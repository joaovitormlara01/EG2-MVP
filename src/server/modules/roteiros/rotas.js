import { data, decimalOpcional, id, instante, objeto, paramsId, versao } from '../../shared/esquemas.js';

const pontoIds = { type: 'array', minItems: 2, maxItems: 100, items: id };
const idOpcional = { anyOf: [id, { type: 'null' }] };
const paramsPonto = {
  type: 'object',
  required: ['id', 'ordem'],
  properties: { id, ordem: { type: 'integer', minimum: 1 } },
};
const soVersao = { body: objeto({ versao }, ['versao']) };

export async function rotasRoteiros(app, { servico }) {
  const u = (req) => req.usuario;

  app.get(
    '/roteiros',
    { schema: { querystring: objeto({ data, motoristaId: id }) } },
    async (req) => ({ roteiros: await servico.listar(u(req), req.query) }),
  );

  app.get('/roteiros/:id', { schema: { params: paramsId } }, async (req) => ({
    roteiro: await servico.detalhe(u(req), req.params.id),
  }));

  app.post(
    '/roteiros',
    {
      schema: {
        body: objeto(
          {
            motoristaId: id,
            data,
            veiculoId: idOpcional,
            distanciaKm: decimalOpcional(7, 2),
            pontoIds,
            chaveIdempotencia: { type: 'string', format: 'uuid' },
          },
          ['motoristaId', 'data', 'pontoIds'],
        ),
      },
    },
    async (req, res) => {
      const resultado = await servico.criar(u(req), req.body);
      return res.status(resultado.repetido ? 200 : 201).send(resultado);
    },
  );

  app.put(
    '/roteiros/:id',
    {
      schema: {
        params: paramsId,
        body: objeto({ versao, data, veiculoId: idOpcional, distanciaKm: decimalOpcional(7, 2), pontoIds }, ['versao']),
      },
    },
    async (req) => servico.editar(u(req), req.params.id, req.body),
  );

  app.post('/roteiros/:id/cancelar', { schema: { params: paramsId, ...soVersao } }, async (req) => ({
    roteiro: await servico.cancelar(u(req), req.params.id, req.body),
  }));

  app.post('/roteiros/:id/encerrar', { schema: { params: paramsId, ...soVersao } }, async (req) => ({
    roteiro: await servico.encerrar(u(req), req.params.id, req.body),
  }));

  // Coleta: sem corpo relevante; o horário é o do servidor. Repetir é seguro (idempotente).
  for (const tipo of ['chegada', 'saida']) {
    app.post(
      `/roteiros/:id/pontos/:ordem/${tipo}`,
      { schema: { params: paramsPonto, body: objeto({}) } },
      async (req) => servico.registrar(u(req), req.params.id, req.params.ordem, tipo),
    );
  }

  app.put(
    '/roteiros/:id/pontos/:ordem',
    {
      schema: {
        params: paramsPonto,
        body: objeto(
          {
            versao,
            chegada: instante,
            saida: { anyOf: [instante, { type: 'null' }] },
            motivo: { type: 'string', minLength: 3, maxLength: 300, pattern: '\\S' },
          },
          ['versao', 'chegada', 'motivo'],
        ),
      },
    },
    async (req) => ({ roteiro: await servico.corrigir(u(req), req.params.id, req.params.ordem, req.body) }),
  );
}
