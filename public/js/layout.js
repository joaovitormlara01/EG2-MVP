// Estrutura comum das páginas internas: sessão obrigatória, usuário no cabeçalho,
// navegação conforme as funções liberadas pelo servidor e botão Sair.

import { el, selecionar } from './dom.js';
import { rotuloPerfil } from './rotulos.js';
import { exigirSessao, sair } from './sessao.js';
import { descreverErro, mostrarEstado } from './ui.js';

function renderizarNavegacao(usuario) {
  const nav = document.querySelector('#navegacao');
  if (!nav) return;
  const atual = window.location.pathname;
  const vistas = new Set();
  const itens = usuario.funcoes
    .filter((f) => !vistas.has(f.pagina) && vistas.add(f.pagina))
    .map((f) =>
      el('li', {}, el('a', { href: f.pagina, 'aria-current': f.pagina === atual ? 'page' : undefined, texto: f.titulo })),
    );
  nav.replaceChildren(el('ul', {}, el('li', {}, el('a', { href: '/inicio.html', 'aria-current': atual === '/inicio.html' ? 'page' : undefined, texto: 'Início' })), ...itens));
}

// Devolve o usuário, ou null quando a página não é permitida ao perfil (estado "proibido").
// `funcao`: id da função exigida (vem de /auth/me); a API continua validando cada operação.
export async function iniciarPagina({ funcao } = {}) {
  const principal = selecionar('#conteudo');
  let usuario;
  try {
    usuario = await exigirSessao();
  } catch (erro) {
    mostrarEstado(principal, 'erro', descreverErro(erro));
    return null;
  }
  selecionar('#usuario-atual').textContent = `${usuario.nome} · ${rotuloPerfil(usuario.perfil)}`;
  selecionar('#botao-sair').addEventListener('click', () => sair());
  renderizarNavegacao(usuario);

  if (funcao && !usuario.funcoes.some((f) => f.id === funcao)) {
    principal.replaceChildren(el('h1', { texto: 'Acesso negado' }));
    const area = el('div');
    principal.append(area);
    mostrarEstado(area, 'proibido');
    return null;
  }
  return usuario;
}
