// GET /auditoria — consulta somente leitura do registro de auditoria (admin; PP p.7, RNF05).
// O registro é imutável no banco; esta rota não altera nada. Datas no fuso operacional.

import { data, objeto } from '../../shared/esquemas.js';

const TAMANHO = 50;

export async function rotasAuditoria(app, { pool, fusoHorario }) {
  app.get(
    '/auditoria',
    {
      config: { acao: 'auditoria.consultar' },
      schema: {
        querystring: objeto({
          entidade: { type: 'string', maxLength: 40 },
          entidadeId: { type: 'string', maxLength: 40, pattern: '^[0-9/]+$' },
          inicio: data,
          fim: data,
          pagina: { type: 'integer', minimum: 1 },
        }),
      },
    },
    async (req) => {
      const { entidade, entidadeId, inicio, fim } = req.query;
      const pagina = req.query.pagina ?? 1;
      const params = [fusoHorario];
      // $1 (fuso) sempre referenciado, para o PostgreSQL inferir o tipo mesmo sem filtro de data.
      const condicoes = ['$1::text is not null'];
      const p = (valor) => {
        params.push(valor);
        return `$${params.length}`;
      };
      if (entidade === 'roteiro' && entidadeId) {
        // O roteiro e as ocorrências dele ("12/1", "12/2"...).
        const id = p(entidadeId);
        condicoes.push(`((a.entidade = 'roteiro' and a.entidade_id = ${id}) or (a.entidade = 'roteiro_ponto' and a.entidade_id like ${id} || '/%'))`);
      } else {
        if (entidade) condicoes.push(`a.entidade = ${p(entidade)}`);
        if (entidadeId) condicoes.push(`a.entidade_id = ${p(entidadeId)}`);
      }
      if (inicio) condicoes.push(`a.ocorrido_em >= (${p(inicio)}::date)::timestamp at time zone $1`);
      if (fim) condicoes.push(`a.ocorrido_em < ((${p(fim)}::date + 1)::timestamp at time zone $1)`);
      const where = `where ${condicoes.join(' and ')}`;
      const { rows: [{ total }] } = await pool.query(`select count(*) as total from registro_auditoria a ${where}`, params);
      const limite = p(TAMANHO);
      const deslocamento = p((pagina - 1) * TAMANHO);
      const { rows } = await pool.query(
        `select a.id, a.ocorrido_em as "ocorridoEm", a.entidade, a.entidade_id as "entidadeId", a.acao,
                a.valor_anterior as "anterior", a.valor_novo as "novo", u.nome as "usuario"
           from registro_auditoria a left join usuario u on u.id = a.usuario_id
           ${where} order by a.id desc limit ${limite} offset ${deslocamento}`,
        params,
      );
      return { pagina, total, paginas: Math.max(1, Math.ceil(total / TAMANHO)), registros: rows };
    },
  );
}
