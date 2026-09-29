import { data, id, objeto } from '../../shared/esquemas.js';

const filtros = { inicio: data, fim: data, motoristaId: id, equipeId: id };

export async function rotasConsultas(app, { servico }) {
  app.get(
    '/historico',
    {
      schema: {
        querystring: objeto(
          { ...filtros, pagina: { type: 'integer', minimum: 1 }, tamanho: { type: 'integer', minimum: 1, maximum: 100 } },
          ['inicio', 'fim'],
        ),
      },
    },
    async (req) => servico.historico(req.usuario, req.query),
  );

  app.get(
    '/dashboard',
    {
      schema: {
        querystring: objeto({ ...filtros, recorte: { type: 'string', enum: ['dia', 'mes', 'periodo'] } }, ['inicio', 'fim']),
      },
    },
    async (req) => servico.dashboard(req.usuario, req.query),
  );

  // GET só lê: a exportação não altera dados (apenas registra a ação em auditoria).
  app.get(
    '/relatorios/historico.csv',
    { config: { acao: 'relatorio.exportar' }, schema: { querystring: objeto(filtros, ['inicio', 'fim']) } },
    async (req, res) => {
      const { conteudo, nomeArquivo } = await servico.exportarCsv(req.usuario, req.query);
      return res
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${nomeArquivo}"`)
        .header('cache-control', 'no-store')
        .send(conteudo);
    },
  );
}
