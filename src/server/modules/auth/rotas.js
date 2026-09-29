import { NOME_COOKIE_SESSAO } from '../../plugins/seguranca-api.js';

const esquemaLogin = {
  body: {
    type: 'object',
    required: ['login', 'senha'],
    additionalProperties: false,
    properties: {
      login: { type: 'string', minLength: 1, maxLength: 254 },
      senha: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
};

export async function rotasAuth(app, { servicoAuth }) {
  app.post(
    '/auth/login',
    {
      schema: esquemaLogin,
      config: { publico: true, rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (requisicao, resposta) => {
      const { token, expiraEm } = await servicoAuth.entrar(requisicao.body);
      const usuario = await servicoAuth.usuarioDoToken(token);
      resposta.setCookie(NOME_COOKIE_SESSAO, token, app.opcoesCookieSessao(expiraEm));
      return { usuario: servicoAuth.perfilPublico(usuario) };
    },
  );

  app.post('/auth/logout', { config: { publico: true } }, async (requisicao, resposta) => {
    await servicoAuth.sair(requisicao.cookies[NOME_COOKIE_SESSAO]);
    resposta.clearCookie(NOME_COOKIE_SESSAO, app.opcoesCookieSessao());
    return resposta.status(204).send();
  });

  app.get('/auth/me', async (requisicao) => ({
    usuario: servicoAuth.perfilPublico(requisicao.usuario),
  }));
}
