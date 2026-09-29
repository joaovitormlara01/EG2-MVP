// Lista de roteiros do dia (todos os perfis, no escopo de cada um) e montagem (gerente/admin).

import { api } from '../api.js';
import { el, gerarChave, preencherSelect, selecionar } from '../dom.js';
import { formatarData, formatarDuracao, formatarMoeda, hojeLocal } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { seloSituacao } from '../rotulos.js';
import {
  executarUmaVez, limparErrosCampos, limparMensagem, mostrarErrosCampos, mostrarEstado, mostrarMensagem,
  tratarErro,
} from '../ui.js';

const usuario = await iniciarPagina({ funcao: 'roteiros' });
if (usuario) {
  const mensagem = selecionar('#mensagem');
  const lista = selecionar('#lista');
  const filtro = selecionar('#form-filtro');
  const campoFiltro = selecionar('#filtro-data');
  const gerencia = usuario.perfil !== 'motorista';
  campoFiltro.value = new URLSearchParams(window.location.search).get('data') ?? hojeLocal();
  if (!gerencia) {
    selecionar('#titulo-pagina').textContent = 'Meus roteiros';
    document.title = 'Meus roteiros — RotaClara';
  }

  async function carregarLista() {
    mostrarEstado(lista, 'carregando');
    try {
      const { roteiros } = await api.get(`/roteiros?data=${encodeURIComponent(campoFiltro.value)}`);
      if (!roteiros.length) {
        mostrarEstado(lista, 'vazio', `Nenhum roteiro em ${formatarData(campoFiltro.value)}.`);
        return;
      }
      lista.replaceChildren(
        el(
          'table',
          { classe: 'tabela' },
          el('thead', {}, el('tr', {}, ...['Roteiro', 'Motorista', 'Situação', 'Pontos', 'Tempo parado', 'Custo estimado'].map((t) => el('th', { scope: 'col', texto: t })))),
          el(
            'tbody',
            {},
            ...roteiros.map((r) =>
              el(
                'tr',
                {},
                el('td', { 'data-rotulo': 'Roteiro' }, el('a', { href: `/roteiro.html?id=${r.id}`, texto: `Nº ${r.id} — ${formatarData(r.data)}` })),
                el('td', { 'data-rotulo': 'Motorista', texto: r.motorista.nome }),
                el('td', { 'data-rotulo': 'Situação' }, seloSituacao(r.situacao)),
                el('td', { 'data-rotulo': 'Pontos', texto: String(r.totalPontos) }),
                el('td', { 'data-rotulo': 'Tempo parado', texto: formatarDuracao(r.totalParadoSeg) }),
                el('td', { 'data-rotulo': 'Custo estimado', texto: r.custoEstimado ? formatarMoeda(r.custoEstimado) : 'Não disponível' }),
              ),
            ),
          ),
        ),
      );
    } catch (erro) {
      tratarErro(erro, mensagem);
      mostrarEstado(lista, 'erro');
    }
  }

  filtro.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!campoFiltro.value) return;
    history.replaceState(null, '', `?data=${campoFiltro.value}`);
    carregarLista();
  });

  await carregarLista();
  if (gerencia) await iniciarMontagem();

  // ---- Montagem de roteiro ---------------------------------------------------------------
  async function iniciarMontagem() {
    const secao = selecionar('#secao-montagem');
    const form = selecionar('#form-roteiro');
    const selMotorista = selecionar('#motoristaId');
    const selVeiculo = selecionar('#veiculoId');
    const selPonto = selecionar('#seletor-ponto');
    const listaPontos = selecionar('#pontos-escolhidos');
    const aviso = selecionar('#aviso-dia');
    const botaoEnviar = selecionar('button[type="submit"]', form);
    let motoristas = [];
    let pontos = [];
    let escolhidos = [];
    // Uma chave por montagem: reenvios do mesmo formulário não criam roteiros duplicados.
    let chave = gerarChave();

    try {
      const [m, v, p] = await Promise.all([
        api.get('/motoristas?ativos=true'), api.get('/veiculos?ativos=true'), api.get('/pontos?ativos=true'),
      ]);
      motoristas = m.motoristas;
      pontos = p.pontos;
      preencherSelect(selMotorista, motoristas, { valor: (x) => x.id, rotulo: (x) => `${x.nome} (${x.equipeNome})`, vazio: 'Selecione o motorista' });
      preencherSelect(selVeiculo, v.veiculos, { valor: (x) => x.id, rotulo: (x) => x.placa, vazio: 'Veículo atribuído ao motorista' });
      preencherSelect(selPonto, pontos, { valor: (x) => x.id, rotulo: (x) => (x.nome ? `${x.nome} — ${x.endereco}` : x.endereco) });
    } catch (erro) {
      tratarErro(erro, mensagem);
      return;
    }
    secao.hidden = false;
    form.elements.namedItem('data').value = campoFiltro.value;

    if (!motoristas.length || pontos.length < 2) {
      mostrarMensagem(aviso, 'Cadastre ao menos um motorista ativo e dois pontos ativos para montar roteiros.', 'info');
      botaoEnviar.disabled = true;
    }

    const rotuloPonto = (id) => {
      const p = pontos.find((x) => x.id === id);
      return p ? (p.nome ? `${p.nome} — ${p.endereco}` : p.endereco) : `Ponto ${id}`;
    };

    function mover(indice, delta) {
      const alvo = indice + delta;
      [escolhidos[indice], escolhidos[alvo]] = [escolhidos[alvo], escolhidos[indice]];
      renderizarEscolhidos(alvo);
    }

    function renderizarEscolhidos(focarIndice) {
      listaPontos.replaceChildren(
        ...escolhidos.map((id, i) =>
          el(
            'li',
            {},
            el('span', { classe: 'ordem', 'aria-hidden': 'true', texto: String(i + 1) }),
            el('span', { classe: 'texto-ponto' },
              el('span', { classe: 'visualmente-oculto', texto: `${i + 1}º: ` }),
              rotuloPonto(id),
              i === 0 ? el('span', { classe: 'selo selo-partida', texto: ' Partida' }) : null),
            el('button', { type: 'button', classe: 'botao botao-secundario botao-pequeno', disabled: i === 0, 'aria-label': `Subir ${i + 1}º ponto`, texto: 'Subir', onclick: () => mover(i, -1), dados: { i: String(i), acao: 'subir' } }),
            el('button', { type: 'button', classe: 'botao botao-secundario botao-pequeno', disabled: i === escolhidos.length - 1, 'aria-label': `Descer ${i + 1}º ponto`, texto: 'Descer', onclick: () => mover(i, 1), dados: { i: String(i), acao: 'descer' } }),
            el('button', {
              type: 'button', classe: 'botao botao-secundario botao-pequeno', 'aria-label': `Remover ${i + 1}º ponto`, texto: 'Remover',
              onclick: () => { escolhidos.splice(i, 1); renderizarEscolhidos(); },
            }),
          ),
        ),
      );
      if (focarIndice !== undefined) {
        listaPontos.querySelectorAll('li')[focarIndice]?.querySelector('button:not([disabled])')?.focus();
      }
    }

    selecionar('#adicionar-ponto').addEventListener('click', () => {
      const id = Number(selPonto.value);
      if (!id) return;
      escolhidos.push(id);
      renderizarEscolhidos();
    });

    selMotorista.addEventListener('change', () => {
      const m = motoristas.find((x) => String(x.id) === selMotorista.value);
      if (m?.veiculoId && [...selVeiculo.options].some((o) => o.value === String(m.veiculoId))) selVeiculo.value = String(m.veiculoId);
      verificarDia();
    });
    form.elements.namedItem('data').addEventListener('change', verificarDia);

    // Aviso (sem bloqueio) quando o motorista já tem roteiro não cancelado na data.
    async function verificarDia() {
      limparMensagem(aviso);
      const motoristaId = selMotorista.value;
      const data = form.elements.namedItem('data').value;
      if (!motoristaId || !data) return;
      try {
        const { roteiros } = await api.get(`/roteiros?data=${data}&motoristaId=${motoristaId}`);
        const ativos = roteiros.filter((r) => r.situacao !== 'cancelado');
        if (ativos.length) {
          mostrarMensagem(aviso, `Atenção: este motorista já tem ${ativos.length} roteiro(s) não cancelado(s) em ${formatarData(data)} (nº ${ativos.map((r) => r.id).join(', ')}). É permitido montar outro.`, 'info');
        }
      } catch {
        // Aviso é opcional; a montagem continua possível.
      }
    }

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      limparMensagem(mensagem);
      limparErrosCampos(form);
      const v = (n) => form.elements.namedItem(n).value.trim();
      const campos = {};
      if (!v('motoristaId')) campos.motoristaId = 'Selecione o motorista.';
      if (!v('data')) campos.data = 'Informe a data.';
      if (v('distanciaKm') && !/^\d{1,7}([.,]\d{1,2})?$/.test(v('distanciaKm'))) campos.distanciaKm = 'Use até 2 casas decimais. Ex.: 120,5';
      if (escolhidos.length < 2) campos.pontoIds = 'Adicione pelo menos 2 pontos.';
      if (Object.keys(campos).length) {
        mostrarMensagem(mensagem, 'Revise os campos destacados.');
        mostrarErrosCampos(form, campos);
        return;
      }
      await executarUmaVez(botaoEnviar, 'Montando…', async () => {
        try {
          const resultado = await api.post('/roteiros', {
            motoristaId: Number(v('motoristaId')),
            data: v('data'),
            veiculoId: v('veiculoId') ? Number(v('veiculoId')) : null,
            distanciaKm: v('distanciaKm') ? v('distanciaKm').replace(',', '.') : null,
            pontoIds: escolhidos,
            chaveIdempotencia: chave,
          });
          const r = resultado.roteiro;
          mensagem.className = 'alerta alerta-sucesso';
          mensagem.replaceChildren(
            `Roteiro nº ${r.id} montado para ${r.motorista.nome} em ${formatarData(r.data)}. `,
            el('a', { href: `/roteiro.html?id=${r.id}`, texto: 'Abrir roteiro' }),
            ...resultado.avisos.map((a) => el('p', { texto: a })),
          );
          chave = gerarChave();
          escolhidos = [];
          renderizarEscolhidos();
          form.reset();
          form.elements.namedItem('data').value = campoFiltro.value;
          limparMensagem(aviso);
          await carregarLista();
        } catch (erro) {
          tratarErro(erro, mensagem, form);
        }
      });
    });
  }
}
