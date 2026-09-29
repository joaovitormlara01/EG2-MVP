import { objeto, paramsId, texto, textoOpcional } from '../../shared/esquemas.js';

const coordenada = { type: 'string', pattern: '^-?\\d{1,3}(\\.\\d{1,6})?$' };
const ponto = { nome: textoOpcional(100), endereco: texto(300), latitude: coordenada, longitude: coordenada };

export async function rotasPontos(app, { servico }) {
  app.get('/pontos', { schema: { querystring: objeto({ ativos: { type: 'boolean' } }) } }, async (req) => ({
    pontos: await servico.listar(req.usuario, { somenteAtivos: req.query.ativos }),
  }));
  app.post(
    '/pontos',
    { schema: { body: objeto(ponto, ['endereco', 'latitude', 'longitude']) } },
    async (req, res) => res.status(201).send({ ponto: await servico.criar(req.usuario, req.body) }),
  );
  app.put(
    '/pontos/:id',
    { schema: { params: paramsId, body: objeto({ ...ponto, ativo: { type: 'boolean' } }, ['endereco', 'latitude', 'longitude', 'ativo']) } },
    async (req) => ({ ponto: await servico.atualizar(req.usuario, req.params.id, req.body) }),
  );
}
