// Parâmetros versionados (UC10, RF09, RF10, D10, D23). Somente o administrador cria versões.
// Política (D10, confirmada na etapa 9):
//  - uma nova versão vale a partir de HOJE ou de uma data futura (fuso operacional), sempre
//    posterior à última vigência (uma versão por data; retroatividade não é permitida);
//  - nenhum roteiro existente é recalculado — nem os planejados: cada roteiro guarda a versão e os
//    valores capturados na montagem (P04/D23);
//  - roteiros montados depois usam a versão aplicável pela política de jornada por
//    motorista/data (ver roteiros/servico.js → parametroDoDia).
// Regras RN01–RN10 não são parametrizáveis (D11): só jornada e valor do combustível.

import { emTransacao } from '../../db/pool.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { garantir } from '../../shared/autorizacao.js';
import { dataLocal } from '../../shared/calculos.js';
import { dataValida } from '../../shared/esquemas.js';
import { erros } from '../../shared/erros.js';

const SQL_PARAMETRO = `
  select p.id, p.versao, p.vigente_desde as "vigenteDesde", p.jornada_min as "jornadaMin",
         p.valor_combustivel as "valorCombustivel", p.criado_em as "criadoEm", u.nome as "criadoPor"
    from parametro_sistema p left join usuario u on u.id = p.criado_por`;

// Versão vigente numa data (AAAA-MM-DD).
export async function parametroVigente(db, data) {
  const { rows } = await db.query(
    `${SQL_PARAMETRO} where p.vigente_desde <= $1::date order by p.vigente_desde desc limit 1`,
    [data],
  );
  return rows[0];
}

export async function buscarParametro(db, id) {
  const { rows } = await db.query(`${SQL_PARAMETRO} where p.id = $1`, [id]);
  return rows[0];
}

export function criarServicoParametros({ pool, fusoHorario, agora = () => new Date() }) {
  return {
    async listar(usuario) {
      garantir(usuario, 'parametros.consultar');
      const hoje = dataLocal(agora(), fusoHorario);
      const { rows } = await pool.query(`${SQL_PARAMETRO} order by p.vigente_desde desc`);
      const vigente = await parametroVigente(pool, hoje);
      return { hoje, vigente, versoes: rows };
    },

    async criar(usuario, dados) {
      garantir(usuario, 'parametros.alterar');
      const hoje = dataLocal(agora(), fusoHorario);
      const campos = {};
      if (!dataValida(dados.vigenteDesde)) campos.vigenteDesde = 'Data inválida.';
      else if (dados.vigenteDesde < hoje) campos.vigenteDesde = 'A vigência não pode ser retroativa (use hoje ou uma data futura).';
      if (!(dados.jornadaMin > 0 && dados.jornadaMin <= 1440)) campos.jornadaMin = 'Informe entre 1 e 1440 minutos.';
      if (dados.valorCombustivel != null && !/[1-9]/.test(dados.valorCombustivel)) {
        campos.valorCombustivel = 'Informe um valor maior que zero.';
      }
      if (Object.keys(campos).length) throw erros.validacao('Parâmetros inválidos.', campos);

      return emTransacao(pool, async (db) => {
        // Serializa criações concorrentes de versão.
        await db.query('lock table parametro_sistema in share row exclusive mode');
        const { rows: [ultima] } = await db.query(
          'select max(versao) as versao, max(vigente_desde) as vigente from parametro_sistema',
        );
        if (dados.vigenteDesde <= ultima.vigente) {
          throw erros.regraNegocio('Já existe versão com vigência igual ou posterior.', {
            vigenteDesde: `Use uma data posterior a ${ultima.vigente}.`,
          });
        }
        const novo = {
          versao: ultima.versao + 1,
          vigenteDesde: dados.vigenteDesde,
          jornadaMin: dados.jornadaMin,
          valorCombustivel: dados.valorCombustivel ?? null,
        };
        const { rows: [{ id }] } = await db.query(
          `insert into parametro_sistema (versao, vigente_desde, jornada_min, valor_combustivel, criado_por)
           values ($1, $2, $3, $4, $5) returning id`,
          [novo.versao, novo.vigenteDesde, novo.jornadaMin, novo.valorCombustivel, usuario.id],
        );
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'parametro_sistema', entidadeId: id, acao: 'criar_versao', novo });

        const { rows: [criado] } = await db.query(`${SQL_PARAMETRO} where p.id = $1`, [id]);
        return { parametro: criado };
      });
    },
  };
}
