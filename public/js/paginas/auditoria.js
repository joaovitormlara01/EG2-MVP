// Consulta do registro de auditoria (somente administrador; somente leitura).

import { api } from '../api.js';
import { paraQuery } from '../consultas.js';
import { el, selecionar } from '../dom.js';
import { formatarDataHora } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { limparErrosCampos, limparMensagem, mostrarEstado, tratarErro } from '../ui.js';

const usuario = await iniciarPagina({ funcao: 'auditoria' });
if (usuario) {
  const form = selecionar('#form-filtros');
  const lista = selecionar('#lista');
  const mensagem = selecionar('#mensagem');
  const campos = ['entidade', 'entidadeId', 'inicio', 'fim'];
  const url = new URLSearchParams(window.location.search);
  for (const c of campos) if (url.get(c)) form.elements.namedItem(c).value = url.get(c);
  let pagina = Number(url.get('pagina')) || 1;

  // Valores anterior/novo como texto (nunca interpretados como HTML).
  const valor = (json) => (json ? el('pre', { classe: 'json', texto: JSON.stringify(json, null, 1) }) : '—');

  async function consultar() {
    limparMensagem(mensagem);
    limparErrosCampos(form);
    const filtros = Object.fromEntries(campos.map((c) => [c, form.elements.namedItem(c).value.trim()]));
    history.replaceState(null, '', `?${paraQuery({ ...filtros, pagina })}`);
    mostrarEstado(lista, 'carregando');
    try {
      const dados = await api.get(`/auditoria?${paraQuery({ ...filtros, pagina })}`);
      if (!dados.registros.length) {
        mostrarEstado(lista, 'vazio', 'Nenhum registro com esses filtros.');
      } else {
        lista.replaceChildren(el('table', { classe: 'tabela' },
          el('caption', { texto: `${dados.total} registro(s)` }),
          el('thead', {}, el('tr', {}, ...['Data e hora', 'Usuário', 'Entidade', 'Registro', 'Operação', 'Antes', 'Depois'].map((t) => el('th', { scope: 'col', texto: t })))),
          el('tbody', {}, ...dados.registros.map((a) => el('tr', {},
            el('td', { 'data-rotulo': 'Data e hora', texto: formatarDataHora(a.ocorridoEm) }),
            el('td', { 'data-rotulo': 'Usuário', texto: a.usuario ?? 'Sistema' }),
            el('td', { 'data-rotulo': 'Entidade', texto: a.entidade }),
            el('td', { 'data-rotulo': 'Registro', texto: a.entidadeId ?? '—' }),
            el('td', { 'data-rotulo': 'Operação', texto: a.acao }),
            el('td', { 'data-rotulo': 'Antes' }, valor(a.anterior)),
            el('td', { 'data-rotulo': 'Depois' }, valor(a.novo)))))));
      }
      selecionar('#paginacao').hidden = dados.paginas <= 1;
      selecionar('#pagina-atual').textContent = `Página ${dados.pagina} de ${dados.paginas}`;
      selecionar('#anterior').disabled = dados.pagina <= 1;
      selecionar('#proxima').disabled = dados.pagina >= dados.paginas;
    } catch (erro) {
      tratarErro(erro, mensagem, form);
      mostrarEstado(lista, 'erro');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); pagina = 1; consultar(); });
  selecionar('#anterior').addEventListener('click', () => { pagina -= 1; consultar(); });
  selecionar('#proxima').addEventListener('click', () => { pagina += 1; consultar(); });
  await consultar();
}
