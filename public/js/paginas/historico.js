// Histórico de paradas (UC08) com paginação e exportação CSV (UC12, gerente/admin).

import { api, ErroApi } from '../api.js';
import {
  filtrosDoFormulario, lerFiltrosDaUrl, paraQuery, prepararFiltrosDePessoas, resumoIndicadores, rotuloSituacao,
} from '../consultas.js';
import { el, selecionar } from '../dom.js';
import { formatarData, formatarDataHora, formatarDuracao } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import {
  descreverErro, executarUmaVez, limparErrosCampos, limparMensagem, mostrarEstado, mostrarMensagem, tratarErro,
} from '../ui.js';

const usuario = await iniciarPagina({ funcao: 'historico' });
if (usuario) {
  const form = selecionar('#form-filtros');
  const mensagem = selecionar('#mensagem');
  const lista = selecionar('#lista');
  const totais = selecionar('#totais');
  const paginacao = selecionar('#paginacao');
  const botaoExportar = selecionar('#exportar');
  let pagina = Number(new URLSearchParams(window.location.search).get('pagina')) || 1;
  let ultimo = null;

  lerFiltrosDaUrl(form);
  try {
    await prepararFiltrosDePessoas(form, usuario);
    lerFiltrosDaUrl(form); // reaplica motorista/equipe depois de carregar as opções
  } catch (erro) {
    tratarErro(erro, mensagem);
  }
  botaoExportar.hidden = usuario.perfil === 'motorista';

  function tempo(o) {
    if (o.partida) return '0 min (partida)';
    if (o.tempoParadoSeg === null) return o.chegada ? 'Incompleto (sem saída)' : 'Incompleto (sem chegada)';
    return formatarDuracao(o.tempoParadoSeg);
  }

  function renderizar(dados) {
    totais.replaceChildren(resumoIndicadores(dados.totais));
    if (!dados.ocorrencias.length) {
      mostrarEstado(lista, 'vazio', 'Nenhuma parada registrada no período e filtros selecionados.');
      paginacao.hidden = true;
      return;
    }
    const cab = ['Data', 'Roteiro', 'Motorista', 'Ponto', 'Endereço (histórico)', 'Chegada', 'Saída', 'Tempo parado'];
    lista.replaceChildren(
      el('table', { classe: 'tabela' },
        el('caption', { texto: `${dados.total} parada(s) no período` }),
        el('thead', {}, el('tr', {}, ...cab.map((t) => el('th', { scope: 'col', texto: t })))),
        el('tbody', {}, ...dados.ocorrencias.map((o) => el('tr', {},
          el('td', { 'data-rotulo': 'Data', texto: formatarData(o.data) }),
          el('td', { 'data-rotulo': 'Roteiro' },
            el('a', { href: `/roteiro.html?id=${o.roteiroId}#ponto-${o.ordem}`, texto: `Nº ${o.roteiroId}` }),
            ` (${rotuloSituacao(o.situacaoRoteiro)})`),
          el('td', { 'data-rotulo': 'Motorista', texto: o.motorista }),
          el('td', { 'data-rotulo': 'Ponto', texto: o.partida ? '1 (partida)' : String(o.ordem) }),
          el('td', { 'data-rotulo': 'Endereço', texto: o.endereco }),
          el('td', { 'data-rotulo': 'Chegada', texto: formatarDataHora(o.chegada) }),
          el('td', { 'data-rotulo': 'Saída', texto: formatarDataHora(o.saida) }),
          el('td', { 'data-rotulo': 'Tempo parado', texto: tempo(o) }))))),
    );
    paginacao.hidden = dados.paginas <= 1;
    selecionar('#pagina-atual').textContent = `Página ${dados.pagina} de ${dados.paginas}`;
    selecionar('#anterior').disabled = dados.pagina <= 1;
    selecionar('#proxima').disabled = dados.pagina >= dados.paginas;
  }

  async function consultar() {
    limparMensagem(mensagem);
    limparErrosCampos(form);
    const filtros = filtrosDoFormulario(form);
    history.replaceState(null, '', `?${paraQuery({ ...filtros, pagina })}`);
    mostrarEstado(lista, 'carregando');
    try {
      ultimo = await api.get(`/historico?${paraQuery({ ...filtros, pagina, tamanho: 50 })}`);
      renderizar(ultimo);
    } catch (erro) {
      tratarErro(erro, mensagem, form);
      mostrarEstado(lista, 'erro');
      totais.replaceChildren();
    }
  }

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    pagina = 1;
    consultar();
  });
  selecionar('#anterior').addEventListener('click', () => { pagina -= 1; consultar(); });
  selecionar('#proxima').addEventListener('click', () => { pagina += 1; consultar(); });

  // Exporta o resultado completo do filtro (não só a página visível).
  botaoExportar.addEventListener('click', () => executarUmaVez(botaoExportar, 'Gerando arquivo…', async () => {
    limparMensagem(mensagem);
    const filtros = filtrosDoFormulario(form);
    try {
      const resposta = await fetch(`/api/v1/relatorios/historico.csv?${paraQuery(filtros)}`, { credentials: 'same-origin' });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new ErroApi(resposta.status, corpo.erro);
      }
      const blob = await resposta.blob();
      const nome = /filename="([^"]+)"/.exec(resposta.headers.get('content-disposition') ?? '')?.[1] ?? 'rotaclara-historico.csv';
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: nome });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarMensagem(mensagem, `Arquivo ${nome} gerado com todas as paradas do período (exportação registrada).`, 'sucesso');
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'SEM_DADOS') mostrarMensagem(mensagem, erro.message, 'info');
      else if (erro instanceof ErroApi) tratarErro(erro, mensagem, form);
      else mostrarMensagem(mensagem, descreverErro(new ErroApi(0)));
    }
  }));

  await consultar();
}
