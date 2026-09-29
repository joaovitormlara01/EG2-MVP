// Detalhe do roteiro: coleta do motorista (chegada/saída), totais e custo vindos do servidor,
// edição de veículo/distância, cancelamento, encerramento e correção auditada.
// A tela sempre redesenha a partir da resposta da API: recarregar a página mostra o mesmo estado.

import { api, ErroApi } from '../api.js';
import { el, preencherSelect, selecionar } from '../dom.js';
import {
  SITUACOES_PONTO, deCampoDataHora, formatarData, formatarDecimal, formatarDuracao, formatarHora,
  formatarMoeda, formatarPercentual, paraCampoDataHora,
} from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { seloSituacao } from '../rotulos.js';
import {
  executarUmaVez, limparErrosCampos, limparMensagem, mostrarEstado, mostrarMensagem, tratarErro,
} from '../ui.js';

const usuario = await iniciarPagina({ funcao: 'roteiros' });
const id = Number(new URLSearchParams(window.location.search).get('id'));

if (usuario) {
  const mensagem = selecionar('#mensagem');
  const corpo = selecionar('#corpo');
  let roteiro = null;
  let veiculos = null;

  const item = (rotulo, valor) => el('div', {}, el('dt', { texto: rotulo }), el('dd', {}, valor));

  async function carregar() {
    if (!Number.isInteger(id) || id < 1) {
      mostrarEstado(corpo, 'erro', 'Roteiro não informado.');
      return;
    }
    if (!roteiro) mostrarEstado(corpo, 'carregando');
    try {
      const primeiraVez = !roteiro;
      roteiro = (await api.get(`/roteiros/${id}`)).roteiro;
      renderizar();
      // Link vindo do histórico/dashboard (#ponto-N): leva à ocorrência de origem.
      if (primeiraVez && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 403) return mostrarEstado(corpo, 'proibido', 'Você não tem acesso a este roteiro.');
      if (erro instanceof ErroApi && erro.status === 404) return mostrarEstado(corpo, 'erro', 'Roteiro não encontrado.');
      tratarErro(erro, mensagem);
      if (!roteiro) mostrarEstado(corpo, 'erro');
    }
  }

  // Envia uma ação e redesenha com o estado devolvido pelo servidor.
  async function agir(botao, textoOcupado, requisicao, sucesso, formulario) {
    limparMensagem(mensagem);
    await executarUmaVez(botao, textoOcupado, async () => {
      try {
        const resposta = await requisicao();
        roteiro = resposta.roteiro ?? resposta;
        renderizar();
        if (sucesso) mostrarMensagem(mensagem, sucesso(resposta), 'sucesso');
      } catch (erro) {
        tratarErro(erro, mensagem, formulario);
        if (erro instanceof ErroApi && erro.codigo === 'VERSAO_DESATUALIZADA') await carregar();
      }
    });
  }

  function renderizar() {
    const r = roteiro;
    document.title = `Roteiro nº ${r.id} — RotaClara`;
    selecionar('#titulo-roteiro').textContent = `Roteiro nº ${r.id}`;
    selecionar('#selo-situacao').replaceChildren(seloSituacao(r.situacao));
    selecionar('#voltar').href = `/roteiros.html?data=${r.data}`;

    corpo.replaceChildren(...[
      usuario.funcoes.some((f) => f.id === 'auditoria')
        ? el('p', {}, el('a', { href: `/auditoria.html?entidade=roteiro&entidadeId=${r.id}`, texto: 'Ver auditoria deste roteiro (inclui correções)' }))
        : null,
      el('dl', { classe: 'resumo' },
        item('Data', formatarData(r.data)),
        item('Motorista', r.motorista.nome),
        item('Equipe', r.equipe.nome),
        item('Veículo', r.veiculo?.placa ?? 'Sem veículo'),
        item('Distância', r.distanciaKm ? `${formatarDecimal(r.distanciaKm, 2)} km` : 'Não informada'),
      ),
      secaoTotais(r),
      secaoGestao(r),
      el('section', { classe: 'secao', 'aria-labelledby': 'titulo-pontos' },
        el('h2', { id: 'titulo-pontos', texto: 'Pontos' }),
        el('ol', { classe: 'pontos-roteiro' }, ...r.pontos.map((p) => cartaoPonto(r, p))),
      ),
    ].filter(Boolean)); // seções ausentes (null) não podem virar texto
  }

  function secaoTotais(r) {
    const t = r.totais;
    const parcial = !t.completo && r.situacao !== 'cancelado' ? ' (parcial)' : '';
    const c = r.custo;
    return el('section', { classe: 'secao', 'aria-labelledby': 'titulo-totais' },
      el('h2', { id: 'titulo-totais', texto: 'Totais (calculados pelo servidor)' }),
      el('dl', { classe: 'resumo' },
        item('Tempo parado', `${formatarDuracao(t.totalParadoSeg)}${parcial}`),
        item('Paradas concluídas', `${t.pontosConcluidos} de ${t.pontosComputaveis} (partida não conta)`),
        item(`% da jornada (${t.jornadaMin} min)`, formatarPercentual(t.percentualJornada)),
        item(`Dia do motorista (${r.jornadaDoDia.roteiros} roteiro(s))`,
          `${formatarDuracao(r.jornadaDoDia.totalParadoSeg)} · ${formatarPercentual(r.jornadaDoDia.percentual)}`),
        item('Custo estimado', c.custoEstimado ? formatarMoeda(c.custoEstimado) : (c.motivo ?? 'Não disponível')),
        item('Custo por km', c.custoKm ? `R$ ${formatarDecimal(c.custoKm)}` : 'Não disponível'),
        item('Combustível / rendimento',
          `${c.valorCombustivel ? `R$ ${formatarDecimal(c.valorCombustivel)}/L` : 'não informado'} · ${c.rendimentoKmL ? formatarDecimal(c.rendimentoKmL, 2) + ' km/l' : 'sem veículo'}`),
        item('Parâmetros usados', `versão ${c.parametroVersao}`),
      ),
    );
  }

  // ---- Gestão: veículo/distância, cancelar, encerrar ----
  function secaoGestao(r) {
    const p = r.permissoes;
    if (!p.gerir && !p.encerrar) return null;
    const secao = el('section', { classe: 'secao cartao', 'aria-labelledby': 'titulo-gestao' },
      el('h2', { id: 'titulo-gestao', texto: 'Ações do roteiro' }));

    if (p.gerir) {
      const form = el('form', { id: 'form-edicao', novalidate: true },
        el('div', { classe: 'grade-form' },
          el('div', { classe: 'campo' },
            el('label', { for: 'edicao-veiculo', texto: 'Veículo' }),
            el('select', { id: 'edicao-veiculo', name: 'veiculoId', 'aria-describedby': 'form-edicao-veiculoId-erro' }),
            el('span', { id: 'form-edicao-veiculoId-erro', classe: 'campo-erro' })),
          el('div', { classe: 'campo' },
            el('label', { for: 'edicao-distancia', texto: 'Distância total (km)' }),
            el('input', { id: 'edicao-distancia', name: 'distanciaKm', type: 'text', inputmode: 'decimal', value: r.distanciaKm ? formatarDecimal(r.distanciaKm, 2) : '', 'aria-describedby': 'form-edicao-distanciaKm-erro' }),
            el('span', { id: 'form-edicao-distanciaKm-erro', classe: 'campo-erro' }))),
        el('button', { type: 'submit', classe: 'botao botao-secundario', texto: 'Salvar veículo e distância' }));
      const select = form.elements.namedItem('veiculoId');
      preencherVeiculos(select, r);
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        limparErrosCampos(form);
        const distancia = form.elements.namedItem('distanciaKm').value.trim().replace(',', '.');
        agir(form.querySelector('button[type=submit]'), 'Salvando…', () => api.put(`/roteiros/${r.id}`, {
          versao: r.versao,
          veiculoId: select.value ? Number(select.value) : null,
          distanciaKm: distancia || null,
        }), () => 'Veículo e distância salvos. Custo recalculado pelo servidor.', form);
      });
      secao.append(form);
    }

    const acoes = el('div', { classe: 'acoes' });
    if (p.encerrar) acoes.append(botaoComConfirmacao('Encerrar roteiro', 'botao-primario', 'Confirmar encerramento? Depois disso o motorista não poderá alterar horários.',
      (b) => agir(b, 'Encerrando…', () => api.post(`/roteiros/${r.id}/encerrar`, { versao: r.versao }), () => 'Roteiro encerrado.')));
    if (p.gerir) acoes.append(botaoComConfirmacao('Cancelar roteiro', 'botao-perigo', 'Confirmar cancelamento? Esta ação não pode ser desfeita.',
      (b) => agir(b, 'Cancelando…', () => api.post(`/roteiros/${r.id}/cancelar`, { versao: r.versao }), () => 'Roteiro cancelado.')));
    secao.append(el('h3', { texto: 'Situação' }), acoes);
    return secao;
  }

  async function preencherVeiculos(select, r) {
    try {
      veiculos ??= (await api.get('/veiculos?ativos=true')).veiculos;
      preencherSelect(select, veiculos, { valor: (v) => v.id, rotulo: (v) => v.placa });
      if (r.veiculo && ![...select.options].some((o) => o.value === String(r.veiculo.id))) {
        select.append(el('option', { value: r.veiculo.id, texto: r.veiculo.placa }));
      }
      select.value = r.veiculo ? String(r.veiculo.id) : '';
    } catch (erro) {
      tratarErro(erro, mensagem);
    }
  }

  // Confirmação na própria página (sem janelas modais do navegador).
  function botaoComConfirmacao(texto, classe, pergunta, acao) {
    const area = el('div', { classe: 'acoes' });
    const botao = el('button', { type: 'button', classe: `botao ${classe}`, texto });
    botao.addEventListener('click', () => {
      const confirmar = el('button', { type: 'button', classe: `botao ${classe}`, texto: 'Confirmar' });
      const voltar = el('button', { type: 'button', classe: 'botao botao-secundario', texto: 'Voltar' });
      const caixa = el('div', { classe: 'confirmacao', role: 'group', 'aria-label': texto }, el('span', { texto: pergunta }), confirmar, voltar);
      confirmar.addEventListener('click', () => acao(confirmar));
      voltar.addEventListener('click', () => { caixa.replaceWith(botao); botao.focus(); });
      botao.replaceWith(caixa);
      confirmar.focus();
    });
    area.append(botao);
    return area;
  }

  // ---- Pontos, coleta e correção ----
  function cartaoPonto(r, p) {
    const atual = r.pontoAtual === p.ordem;
    const titulo = el('h3', {},
      el('span', { classe: 'ordem', texto: String(p.ordem) }),
      p.partida ? 'Partida' : `Parada ${p.ordem - 1}`,
      p.partida ? el('span', { classe: 'selo selo-partida', texto: 'Não conta no tempo parado' }) : null,
      el('span', { classe: 'campo-ajuda', texto: SITUACOES_PONTO[p.situacao] }));
    const tempo = p.partida
      ? '0 min (partida)'
      : formatarDuracao(p.tempoParadoSeg, p.chegada ? 'Em andamento' : 'Incompleto');

    return el('li', { id: `ponto-${p.ordem}`, classe: `ponto-roteiro${atual ? ' atual' : ''}${p.situacao === 'concluido' ? ' concluido' : ''}`, 'aria-current': atual ? 'step' : undefined },
      titulo,
      el('p', { texto: p.endereco }),
      el('dl', { classe: 'horarios' },
        el('div', {}, el('dt', { texto: 'Chegada' }), el('dd', { texto: formatarHora(p.chegada) })),
        el('div', {}, el('dt', { texto: 'Saída' }), el('dd', { texto: formatarHora(p.saida) })),
        el('div', {}, el('dt', { texto: 'Tempo parado' }), el('dd', { texto: tempo }))),
      acoesColeta(r, p),
      r.permissoes.corrigir ? areaCorrecao(r, p) : null);
  }

  function acoesColeta(r, p) {
    if (!r.permissoes.registrar) return null;
    const botoes = [];
    const registrar = (tipo, rotulo) => {
      const b = el('button', { type: 'button', classe: 'botao botao-primario botao-coleta', texto: rotulo });
      b.addEventListener('click', () => agir(b, 'Registrando…',
        () => api.post(`/roteiros/${r.id}/pontos/${p.ordem}/${tipo}`),
        (res) => {
          const ponto = res.roteiro.pontos.find((x) => x.ordem === p.ordem);
          const nome = tipo === 'chegada' ? 'Chegada' : 'Saída';
          return res.jaRegistrado
            ? `${nome} deste ponto já estava registrada às ${formatarHora(ponto[tipo])}. Nada foi alterado.`
            : `${nome} registrada às ${formatarHora(ponto[tipo])} no ponto ${p.ordem}. Registro salvo no servidor.`;
        }));
      botoes.push(b);
    };
    const proximo = r.pontos.find((x) => x.ordem === p.ordem + 1);
    if (r.pontoAtual === p.ordem && !p.chegada) registrar('chegada', 'Registrar chegada');
    if (p.chegada && !p.saida && !proximo?.chegada) {
      if (p.partida) registrar('saida', 'Registrar saída da partida (opcional)');
      else registrar('saida', 'Registrar saída');
    }
    return botoes.length ? el('div', { classe: 'acoes-coleta' }, ...botoes) : null;
  }

  function areaCorrecao(r, p) {
    const prefixo = `correcao-${p.ordem}`;
    const abrir = el('button', { type: 'button', classe: 'botao botao-secundario botao-pequeno', 'aria-expanded': 'false', 'aria-controls': prefixo, texto: 'Corrigir horários' });
    const campo = (nome, rotulo, tipo, atributos = {}) => el('div', { classe: 'campo' },
      el('label', { for: `${prefixo}-${nome}`, texto: rotulo }),
      el(tipo === 'textarea' ? 'textarea' : 'input', { id: `${prefixo}-${nome}`, name: nome, ...(tipo === 'textarea' ? {} : { type: tipo }), 'aria-describedby': `${prefixo}-${nome}-erro`, ...atributos }),
      el('span', { id: `${prefixo}-${nome}-erro`, classe: 'campo-erro' }));
    const form = el('form', { id: prefixo, novalidate: true, hidden: true },
      el('div', { classe: 'grade-form' },
        campo('chegada', 'Chegada', 'datetime-local', { step: '1', required: true, value: paraCampoDataHora(p.chegada) }),
        campo('saida', p.partida ? 'Saída (opcional na partida)' : 'Saída', 'datetime-local', { step: '1', value: paraCampoDataHora(p.saida) }),
        el('div', { classe: 'largura-total' }, campo('motivo', 'Motivo da correção (fica na auditoria)', 'textarea', { required: true, maxlength: '300', rows: '2' }))),
      el('div', { classe: 'acoes' },
        el('button', { type: 'submit', classe: 'botao botao-primario', texto: 'Salvar correção' }),
        el('button', { type: 'button', classe: 'botao botao-secundario', texto: 'Fechar', onclick: () => alternar(false) })));
    function alternar(aberto) {
      form.hidden = !aberto;
      abrir.setAttribute('aria-expanded', String(aberto));
      if (aberto) form.elements.namedItem('chegada').focus();
      else abrir.focus();
    }
    abrir.addEventListener('click', () => alternar(form.hidden));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      limparErrosCampos(form);
      const v = (n) => form.elements.namedItem(n).value;
      agir(form.querySelector('button[type=submit]'), 'Salvando…', () => api.put(`/roteiros/${r.id}/pontos/${p.ordem}`, {
        versao: r.versao, chegada: deCampoDataHora(v('chegada')), saida: deCampoDataHora(v('saida')), motivo: v('motivo').trim(),
      }), () => `Correção do ponto ${p.ordem} salva e auditada. Totais recalculados.`, form);
    });
    return el('div', {}, abrir, form);
  }

  selecionar('#atualizar').addEventListener('click', (e) => executarUmaVez(e.currentTarget, 'Atualizando…', carregar));
  await carregar();
}
