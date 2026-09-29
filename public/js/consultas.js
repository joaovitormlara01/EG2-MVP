// Filtros compartilhados por histórico e dashboard: período, motorista e equipe.
// Os valores ficam na URL (recarregar a página mantém a consulta). O servidor aplica o escopo
// do perfil; os selects só oferecem o que o perfil pode ver.

import { api } from './api.js';
import { el, preencherSelect, selecionar } from './dom.js';
import { SITUACOES_ROTEIRO, formatarDecimal, formatarDuracao, formatarMoeda, formatarPercentual, hojeLocal } from './formatacao.js';

export function periodoPadrao() {
  const hoje = hojeLocal();
  return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
}

export function lerFiltrosDaUrl(form, extras = []) {
  const url = new URLSearchParams(window.location.search);
  const padrao = periodoPadrao();
  form.elements.namedItem('inicio').value = url.get('inicio') ?? padrao.inicio;
  form.elements.namedItem('fim').value = url.get('fim') ?? padrao.fim;
  for (const nome of ['motoristaId', 'equipeId', ...extras]) {
    const campo = form.elements.namedItem(nome);
    if (campo && url.has(nome)) campo.value = url.get(nome);
  }
}

export function filtrosDoFormulario(form, extras = []) {
  const filtros = {};
  for (const nome of ['inicio', 'fim', 'motoristaId', 'equipeId', ...extras]) {
    const valor = form.elements.namedItem(nome)?.value;
    if (valor) filtros[nome] = valor;
  }
  return filtros;
}

// Omite valores vazios/nulos (ex.: motoristaId null vindo do servidor não vira "null" na URL).
export const paraQuery = (filtros) =>
  new URLSearchParams(Object.entries(filtros).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString();

// Gerente e admin escolhem motorista/equipe; o motorista só vê os próprios dados.
export async function prepararFiltrosDePessoas(form, usuario) {
  if (usuario.perfil === 'motorista') return;
  const [{ motoristas }, { equipes }] = await Promise.all([api.get('/motoristas'), api.get('/equipes')]);
  preencherSelect(form.elements.namedItem('motoristaId'), motoristas, {
    valor: (m) => m.id, rotulo: (m) => `${m.nome}${m.ativo ? '' : ' (inativo)'}`, vazio: 'Todos',
  });
  preencherSelect(form.elements.namedItem('equipeId'), equipes, { valor: (e) => e.id, rotulo: (e) => e.nome, vazio: 'Todas' });
  selecionar('#campo-motorista', form).hidden = false;
  selecionar('#campo-equipe', form).hidden = false;
}

const item = (rotulo, valor, ajuda) =>
  el('div', {}, el('dt', { texto: rotulo }), el('dd', {}, valor), ajuda ? el('dd', { classe: 'campo-ajuda', texto: ajuda }) : null);

// Resumo dos indicadores (mesmo formato no histórico e no dashboard).
export function resumoIndicadores(t) {
  const semDados = t.roteiros === 0;
  return el('dl', { classe: 'resumo' },
    item('Tempo parado', semDados ? 'Sem dados' : formatarDuracao(t.totalParadoSeg),
      t.parcial ? `Parcial: ${t.roteirosIncompletos} roteiro(s) ainda em execução.` : null),
    item('Roteiros', String(t.roteiros), t.roteirosIncompletos ? `${t.roteirosIncompletos} não encerrado(s)` : null),
    item('% da jornada', t.percentualJornada === null ? 'Não disponível' : formatarPercentual(t.percentualJornada),
      t.paresMotoristaData
        ? `Base: ${t.paresMotoristaData} dia(s) de motorista com roteiro × jornada = ${formatarDecimal(String(t.jornadaMinTotal))} min. Dias sem roteiro não entram.`
        : 'Sem dias com roteiro no período.'),
    item('Custo estimado', t.custo.estimado === null ? 'Não disponível' : formatarMoeda(t.custo.estimado),
      t.custo.roteirosSemCusto
        ? `${t.custo.parcial ? 'Parcial: ' : ''}${t.custo.roteirosSemCusto} roteiro(s) sem custo disponível (não somados como zero).`
        : null),
  );
}

export const rotuloSituacao = (s) => SITUACOES_ROTEIRO[s] ?? s;
