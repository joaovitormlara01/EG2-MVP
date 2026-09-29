// /equipes, /gerentes, /motoristas, /veiculos. Sem DELETE: inativação via PUT { ativo: false }.

import {
  decimal, email, id, objeto, paramsId, senha, texto, textoOpcional,
} from '../../shared/esquemas.js';

const idOpcional = { anyOf: [id, { type: 'null' }] };
const consultaAtivos = objeto({ ativos: { type: 'boolean' } });

const equipe = { nome: texto(100), gerenteId: idOpcional };
const gerente = { nome: texto(150), email, telefone: textoOpcional(30) };
const motorista = {
  nome: texto(150),
  telefone: textoOpcional(30),
  email: { anyOf: [email, { type: 'null' }, { type: 'string', maxLength: 0 }] },
  documento: texto(30),
  equipeId: id,
  veiculoId: idOpcional,
};
const veiculo = { placa: texto(10), descricao: textoOpcional(100), rendimentoKmL: decimal(4, 2) };

export async function rotasCadastros(app, { servico }) {
  const u = (req) => req.usuario;

  app.get('/equipes', async (req) => ({ equipes: await servico.listarEquipes(u(req)) }));
  app.post('/equipes', { schema: { body: objeto(equipe, ['nome']) } }, async (req, res) =>
    res.status(201).send({ equipe: await servico.criarEquipe(u(req), req.body) }));
  app.put(
    '/equipes/:id',
    { schema: { params: paramsId, body: objeto({ ...equipe, ativo: { type: 'boolean' } }, ['nome', 'ativo']) } },
    async (req) => ({ equipe: await servico.atualizarEquipe(u(req), req.params.id, req.body) }),
  );

  app.get('/gerentes', async (req) => ({ gerentes: await servico.listarGerentes(u(req)) }));
  app.post('/gerentes', { schema: { body: objeto({ ...gerente, senha }, ['nome', 'email', 'senha']) } },
    async (req, res) => res.status(201).send({ gerente: await servico.criarGerente(u(req), req.body) }));
  app.put(
    '/gerentes/:id',
    {
      schema: {
        params: paramsId,
        body: objeto({ ...gerente, ativo: { type: 'boolean' }, senha: { anyOf: [senha, { type: 'null' }] } }, ['nome', 'email', 'ativo']),
      },
    },
    async (req) => ({ gerente: await servico.atualizarGerente(u(req), req.params.id, req.body) }),
  );

  app.get('/motoristas', { schema: { querystring: consultaAtivos } }, async (req) => ({
    motoristas: await servico.listarMotoristas(u(req), { somenteAtivos: req.query.ativos }),
  }));
  app.post(
    '/motoristas',
    { schema: { body: objeto({ ...motorista, senha }, ['nome', 'documento', 'equipeId', 'senha']) } },
    async (req, res) => res.status(201).send({ motorista: await servico.criarMotorista(u(req), req.body) }),
  );
  app.put(
    '/motoristas/:id',
    {
      schema: {
        params: paramsId,
        body: objeto(
          { ...motorista, ativo: { type: 'boolean' }, senha: { anyOf: [senha, { type: 'null' }] } },
          ['nome', 'documento', 'equipeId', 'ativo'],
        ),
      },
    },
    async (req) => ({ motorista: await servico.atualizarMotorista(u(req), req.params.id, req.body) }),
  );

  app.get('/veiculos', { schema: { querystring: consultaAtivos } }, async (req) => ({
    veiculos: await servico.listarVeiculos(u(req), { somenteAtivos: req.query.ativos }),
  }));
  app.post('/veiculos', { schema: { body: objeto(veiculo, ['placa', 'rendimentoKmL']) } }, async (req, res) =>
    res.status(201).send({ veiculo: await servico.criarVeiculo(u(req), req.body) }));
  app.put(
    '/veiculos/:id',
    { schema: { params: paramsId, body: objeto({ ...veiculo, ativo: { type: 'boolean' } }, ['placa', 'rendimentoKmL', 'ativo']) } },
    async (req) => ({ veiculo: await servico.atualizarVeiculo(u(req), req.params.id, req.body) }),
  );
}
