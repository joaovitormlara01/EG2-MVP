import { data, decimalOpcional, objeto } from '../../shared/esquemas.js';

export async function rotasParametros(app, { servico }) {
  app.get('/parametros', { config: { acao: 'parametros.consultar' } }, async (req) => servico.listar(req.usuario));
  app.post(
    '/parametros',
    {
      config: { acao: 'parametros.alterar' },
      schema: {
        body: objeto(
          { vigenteDesde: data, jornadaMin: { type: 'integer' }, valorCombustivel: decimalOpcional(7, 3) },
          ['vigenteDesde', 'jornadaMin'],
        ),
      },
    },
    async (req, res) => res.status(201).send(await servico.criar(req.usuario, req.body)),
  );
}
