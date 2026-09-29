// Formatação para exibição (pt-BR). Só apresenta valores calculados pelo servidor;
// nenhum total ou custo é calculado no navegador.

const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatarData(aaaaMmDd) {
  if (!aaaaMmDd) return '—';
  if (aaaaMmDd === '-infinity') return 'desde o início';
  const [a, m, d] = aaaaMmDd.split('-');
  return `${d}/${m}/${a}`;
}

export const formatarHora = (iso) => (iso ? hora.format(new Date(iso)) : '—');
export const formatarDataHora = (iso) => (iso ? dataHora.format(new Date(iso)) : '—');

// Segundos → "15 min", "1 h 05 min", "15 min 20 s". null → texto de incompleto.
export function formatarDuracao(segundos, incompleto = 'Incompleto') {
  if (segundos === null || segundos === undefined) return incompleto;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const partes = [];
  if (h) partes.push(`${h} h`);
  partes.push(`${h ? String(m).padStart(2, '0') : m} min`);
  if (s) partes.push(`${s} s`);
  return partes.join(' ');
}

// Decimal em texto ("60.00") → "60,00" sem passar por ponto flutuante.
export function formatarDecimal(texto, casasMinimas = 0) {
  if (texto === null || texto === undefined) return '—';
  const [inteira, fracao = ''] = String(texto).split('.');
  const milhar = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const f = fracao.padEnd(casasMinimas, '0');
  return f ? `${milhar},${f}` : milhar;
}

export const formatarMoeda = (texto) => (texto == null ? '—' : `R$ ${formatarDecimal(texto, 2)}`);
export const formatarPercentual = (texto) => (texto == null ? '—' : `${formatarDecimal(texto)}%`);

export const SITUACOES_ROTEIRO = Object.freeze({
  planejado: 'Planejado',
  em_execucao: 'Em execução',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
});

export const SITUACOES_PONTO = Object.freeze({
  pendente: 'Aguardando chegada',
  em_andamento: 'Parado (aguardando saída)',
  chegada_registrada: 'Chegada registrada',
  concluido: 'Concluído',
});

// Data de hoje no relógio do aparelho (usada só como valor inicial de filtros).
export function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Converte ISO → valor de <input type="datetime-local"> no fuso do aparelho, e vice-versa.
export function paraCampoDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function deCampoDataHora(valor) {
  return valor ? new Date(valor).toISOString() : null;
}
