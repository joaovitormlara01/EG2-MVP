// Segurança do escopo /api/v1 (encapsulado: não afeta os arquivos estáticos).
//  - Toda rota exige sessão, exceto as marcadas com config.publico.
//  - config.acao aplica a política de acesso antes do handler (verificação por perfil);
//    verificações que dependem do registro (equipe, dono) são feitas no serviço com garantir().
//  - CSRF, em camadas, para toda requisição que altera estado (POST/PUT/PATCH/DELETE):
//      1. Origin, quando presente, precisa ser a própria origem (ou APP_ORIGENS); "null" é recusado.
//      2. Sem Origin, Sec-Fetch-Site (enviado por navegadores atuais) precisa ser same-origin/none.
//      3. Content-Type precisa ser application/json (formulários HTML não produzem esse tipo
//         sem preflight CORS, e o servidor não responde CORS).
//      4. Cookie de sessão SameSite=Lax + HttpOnly.
//    Nenhuma rota GET altera dados de negócio (GETs só leem; no máximo registram acesso em auditoria).
//  - Não há CORS: nenhuma resposta inclui Access-Control-Allow-Origin.

import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { garantir } from '../shared/autorizacao.js';
import { erros } from '../shared/erros.js';

export const NOME_COOKIE_SESSAO = 'rotaclara_sessao';
const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function segurancaApi(app, { servicoAuth, config }) {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('usuario', null);

  app.decorate('opcoesCookieSessao', (expiraEm) => ({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSeguro,
    ...(expiraEm ? { expires: expiraEm } : {}),
  }));

  function origemAceita(requisicao) {
    const origem = requisicao.headers.origin;
    if (origem !== undefined) {
      const propria = `${requisicao.protocol}://${requisicao.host}`;
      return origem === propria || config.origensPermitidas.includes(origem);
    }
    const site = requisicao.headers['sec-fetch-site'];
    if (site !== undefined) return site === 'same-origin' || site === 'none';
    // Cliente não navegador (curl, testes): sem cookie de terceiros, segue as demais camadas.
    return true;
  }

  app.addHook('onRequest', async (requisicao) => {
    if (METODOS_QUE_ALTERAM.has(requisicao.method)) {
      if (!origemAceita(requisicao)) throw erros.origemInvalida();
      const tipo = (requisicao.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (tipo !== 'application/json') {
        const erro = new Error('Content-Type deve ser application/json.');
        erro.statusCode = 415;
        throw erro;
      }
    }

    const opcoes = requisicao.routeOptions.config ?? {};
    const token = requisicao.cookies[NOME_COOKIE_SESSAO];
    if (token) requisicao.usuario = await servicoAuth.usuarioDoToken(token);
    if (!opcoes.publico && !requisicao.usuario) throw erros.naoAutenticado();
  });

  app.addHook('preHandler', async (requisicao) => {
    const acao = requisicao.routeOptions.config?.acao;
    if (acao) garantir(requisicao.usuario, acao);
  });
}
