import { el, selecionar } from '../dom.js';
import { iniciarPagina } from '../layout.js';
import { mostrarMensagem } from '../ui.js';

const usuario = await iniciarPagina();
if (usuario) {
  selecionar('#saudacao').textContent = `Olá, ${usuario.nome.split(' ')[0]}`;
  const lista = selecionar('#lista-funcoes');
  const vistas = new Set();
  const funcoes = usuario.funcoes.filter((f) => !vistas.has(f.pagina) && vistas.add(f.pagina));
  lista.replaceChildren(
    ...funcoes.map((f) => el('li', {}, el('a', { href: f.pagina, texto: f.titulo }))),
  );
  if (funcoes.length === 0) {
    mostrarMensagem(selecionar('#mensagem'), 'Nenhuma função liberada para o seu perfil. Procure o administrador.', 'info');
  }
}
