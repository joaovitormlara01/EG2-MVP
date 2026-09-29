// Sessão do usuário no navegador. O cookie é HttpOnly: o JavaScript nunca vê o token;
// quem sabe se a sessão é válida é sempre o servidor (GET /auth/me).

import { api, ErroApi } from './api.js';

export const PAGINA_LOGIN = '/';
export const PAGINA_INICIAL = '/inicio.html';

export async function entrar(login, senha) {
  const { usuario } = await api.post('/auth/login', { login, senha });
  return usuario;
}

// Devolve o usuário autenticado ou null se não houver sessão válida.
export async function usuarioAtual() {
  try {
    const { usuario } = await api.get('/auth/me');
    return usuario;
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) return null;
    throw erro;
  }
}

// Para páginas internas: redireciona ao login quando não há sessão.
export async function exigirSessao() {
  const usuario = await usuarioAtual();
  if (!usuario) {
    window.location.replace(PAGINA_LOGIN);
    return new Promise(() => {});
  }
  return usuario;
}

export async function sair() {
  try {
    await api.post('/auth/logout');
  } finally {
    window.location.replace(PAGINA_LOGIN);
  }
}
