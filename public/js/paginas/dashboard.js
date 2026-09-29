// Dashboard (UC09): recortes por dia, mês e período com Chart.js. Todos os números vêm
// agregados do servidor; o navegador só converte unidades para exibição (segundos → minutos).

import { api } from '../api.js';
import {
  filtrosDoFormulario, lerFiltrosDaUrl, paraQuery, prepararFiltrosDePessoas, resumoIndicadores,
} from '../consultas.js';
import { el, selecionar } from '../dom.js';
import { formatarData, formatarDataHora, formatarDuracao, formatarMoeda, formatarPercentual } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { limparErrosCampos, limparMensagem, mostrarEstado, tratarErro } from '../ui.js';

// RNF03: a consulta inicial (filtros da URL), a verificação de sessão e o download do Chart.js
// começam em paralelo, em vez de um depois do outro. O servidor continua exigindo sessão e
// aplicando o escopo; sem sessão, a consulta falha (401) e iniciarPagina leva ao login.
const formInicial = document.querySelector('#form-filtros');
lerFiltrosDaUrl(formInicial, ['recorte']);
const urlInicial = new URLSearchParams(window.location.search);
const filtrosIniciais = filtrosDoFormulario(formInicial, ['recorte']);
for (const nome of ['motoristaId', 'equipeId']) if (urlInicial.get(nome)) filtrosIniciais[nome] = urlInicial.get(nome);
const pedidoInicial = api.get(`/dashboard?${paraQuery(filtrosIniciais)}`);
pedidoInicial.catch(() => {}); // tratado em consultar()
const chartPronto = new Promise((resolve) => {
  if (window.Chart) return resolve();
  const script = document.createElement('script');
  script.src = '/vendor/chart.js/chart.umd.min.js';
  script.onload = resolve;
  script.onerror = resolve; // sem Chart.js, a tabela de dados continua disponível
  document.head.append(script);
});

const usuario = await iniciarPagina({ funcao: 'dashboard' });
if (usuario) {
  const form = selecionar('#form-filtros');
  const mensagem = selecionar('#mensagem');
  const graficos = {};
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // As listas de motoristas/equipes carregam em paralelo com a primeira consulta.
  const opcoes = prepararFiltrosDePessoas(form, usuario)
    .then(() => lerFiltrosDaUrl(form, ['recorte']))
    .catch((erro) => tratarErro(erro, mensagem));

  const rotulo = (balde, recorte, filtros) => {
    if (recorte === 'mes') return `${MESES[Number(balde.slice(5, 7)) - 1]}/${balde.slice(0, 4)}`;
    if (recorte === 'periodo') return `${formatarData(filtros.inicio)} a ${formatarData(filtros.fim)}`;
    return formatarData(balde);
  };

  // Período de origem de cada barra, para abrir o histórico correspondente (drill-down).
  function intervalo(balde, recorte, filtros) {
    if (recorte === 'dia') return { inicio: balde, fim: balde };
    if (recorte === 'periodo') return { inicio: filtros.inicio, fim: filtros.fim };
    const [a, m] = balde.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return { inicio: balde < filtros.inicio ? filtros.inicio : balde, fim: ultimo > filtros.fim ? filtros.fim : ultimo };
  }

  const linkHistorico = (faixa, filtros) =>
    `/historico.html?${paraQuery({ ...filtros, ...faixa })}`;

  function desenhar(id, tipo, rotulos, valores, rotuloSerie, cor, aoClicar) {
    graficos[id]?.destroy();
    if (!window.Chart) return;
    graficos[id] = new window.Chart(selecionar(`#${id}`), {
      type: tipo,
      data: { labels: rotulos, datasets: [{ label: rotuloSerie, data: valores, backgroundColor: cor, borderColor: cor, spanGaps: false }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Limita a densidade de pixels a 2× (telas 3× desenham 2,25× menos pixels; dados iguais).
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        animation: false,
        plugins: { legend: { display: false } },
        // sampleSize: mede só uma amostra dos rótulos (365 dias no recorte diário) — RNF03.
        scales: {
          x: { ticks: { sampleSize: 12, maxRotation: 0, autoSkipPadding: 8 } },
          y: { beginAtZero: true, ticks: { sampleSize: 12 } },
        },
        normalized: true,
        onClick: (_e, elementos) => elementos[0] && aoClicar(elementos[0].index),
      },
    });
  }

  function renderizar(dados) {
    const { filtros, recorte, series } = dados;
    selecionar('#totais').replaceChildren(resumoIndicadores(dados.totais));
    const estado = selecionar('#estado-graficos');
    const area = selecionar('#graficos');
    if (!series.length) {
      area.hidden = true;
      mostrarEstado(estado, 'vazio', 'Sem roteiros em execução ou encerrados no período. Os gráficos aparecem quando houver dados.');
      selecionar('#tabela-series').replaceChildren();
    } else {
      estado.replaceChildren();
      area.hidden = false;
      const rotulos = series.map((s) => rotulo(s.balde, recorte, filtros));
      const abrir = (i) => { window.location.href = linkHistorico(intervalo(series[i].balde, recorte, filtros), filtros); };
      // Conversão só de unidade para o eixo do gráfico; o valor exato fica na tabela abaixo.
      desenhar('grafico-tempo', 'bar', rotulos, series.map((s) => Math.round((s.totalParadoSeg / 60) * 100) / 100), 'Minutos parados', '#0f5ea8', abrir);
      desenhar('grafico-percentual', recorte === 'dia' ? 'line' : 'bar', rotulos, series.map((s) => (s.percentualJornada === null ? null : Number(s.percentualJornada))), '% da jornada', '#7a4b00', abrir);
      desenhar('grafico-custo', 'bar', rotulos, series.map((s) => (s.custo.estimado === null ? null : Number(s.custo.estimado))), 'R$', '#1e6b34', abrir);

      // Tabela acessível com os mesmos dados dos gráficos e links para a origem. Só é montada
      // quando aberta (365 linhas no recorte diário pesavam em celulares lentos — RNF03).
      const montarTabela = () => el('table', { classe: 'tabela' },
          el('caption', { texto: 'Dados dos gráficos (clique para ver as paradas de origem)' }),
          el('thead', {}, el('tr', {}, ...['Recorte', 'Tempo parado', '% da jornada', 'Base da jornada', 'Custo estimado', 'Roteiros'].map((t) => el('th', { scope: 'col', texto: t })))),
          el('tbody', {}, ...series.map((s, i) => el('tr', {},
            el('td', { 'data-rotulo': 'Recorte' }, el('a', { href: linkHistorico(intervalo(s.balde, recorte, filtros), filtros), texto: rotulos[i] })),
            el('td', { 'data-rotulo': 'Tempo parado', texto: `${formatarDuracao(s.totalParadoSeg)}${s.parcial ? ' (parcial)' : ''}` }),
            el('td', { 'data-rotulo': '% da jornada', texto: s.percentualJornada === null ? 'Não disponível' : formatarPercentual(s.percentualJornada) }),
            el('td', { 'data-rotulo': 'Base da jornada', texto: `${s.paresMotoristaData} dia(s) de motorista · ${s.jornadaMinTotal} min` }),
            el('td', { 'data-rotulo': 'Custo estimado', texto: s.custo.estimado === null ? 'Não disponível' : `${formatarMoeda(s.custo.estimado)}${s.custo.parcial ? ' (parcial)' : ''}` }),
            el('td', { 'data-rotulo': 'Roteiros', texto: `${s.roteiros}${s.roteirosIncompletos ? ` (${s.roteirosIncompletos} em execução)` : ''}` })))));
      const detalhes = el('details', {}, el('summary', { texto: `Ver os dados dos gráficos em tabela (${series.length} linha(s), com links para a origem)` }));
      detalhes.addEventListener('toggle', () => {
        if (detalhes.open && detalhes.childElementCount === 1) detalhes.append(montarTabela());
      });
      selecionar('#tabela-series').replaceChildren(detalhes);
    }

    const maiores = selecionar('#maiores');
    if (!dados.maioresParadas.length) {
      mostrarEstado(maiores, 'vazio', 'Nenhuma parada concluída no período.');
    } else {
      maiores.replaceChildren(el('table', { classe: 'tabela' },
        el('thead', {}, el('tr', {}, ...['Duração', 'Endereço (histórico)', 'Data', 'Chegada', 'Motorista', 'Origem'].map((t) => el('th', { scope: 'col', texto: t })))),
        el('tbody', {}, ...dados.maioresParadas.map((o) => el('tr', {},
          el('td', { 'data-rotulo': 'Duração', texto: formatarDuracao(o.tempoParadoSeg) }),
          el('td', { 'data-rotulo': 'Endereço', texto: o.endereco }),
          el('td', { 'data-rotulo': 'Data', texto: formatarData(o.data) }),
          el('td', { 'data-rotulo': 'Chegada', texto: formatarDataHora(o.chegada) }),
          el('td', { 'data-rotulo': 'Motorista', texto: o.motorista }),
          el('td', { 'data-rotulo': 'Origem' }, el('a', { href: `/roteiro.html?id=${o.roteiroId}#ponto-${o.ordem}`, texto: `Roteiro nº ${o.roteiroId}, ponto ${o.ordem}` })))))));
    }
  }

  async function consultar(iniciais, pedido) {
    limparMensagem(mensagem);
    limparErrosCampos(form);
    performance.clearMarks();
    performance.mark('rotaclara:consulta-inicio');
    const filtros = iniciais?.inicio ? iniciais : filtrosDoFormulario(form, ['recorte']);
    history.replaceState(null, '', `?${paraQuery(filtros)}`);
    mostrarEstado(selecionar('#totais'), 'carregando');
    try {
      const dados = await (pedido ?? api.get(`/dashboard?${paraQuery(filtros)}`));
      performance.mark('rotaclara:dados-recebidos');
      await chartPronto;
      renderizar(dados);
      // Marca usada na medição do RNF03 (tempo até dados e gráficos exibidos).
      requestAnimationFrame(() => performance.mark('rotaclara:graficos-exibidos'));
    } catch (erro) {
      tratarErro(erro, mensagem, form);
      mostrarEstado(selecionar('#totais'), 'erro');
    }
  }

  form.addEventListener('submit', (evento) => { evento.preventDefault(); consultar(); });
  for (const radio of form.querySelectorAll('input[name=recorte]')) radio.addEventListener('change', () => consultar());
  await Promise.all([consultar(filtrosIniciais, pedidoInicial), opcoes]);
}
