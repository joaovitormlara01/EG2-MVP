// Cálculos oficiais (RN01–RN04, RN07). Funções puras, sem ponto flutuante:
// valores decimais chegam como texto ("6.000", "12.00") e são tratados como inteiros (BigInt).
// Arredondamento: meio para cima, uma única vez, na escala de apresentação documentada.

// ---- Tempo parado ---------------------------------------------------------------------------

// RN01/RN02. Devolve segundos inteiros ou null quando o ponto ainda não está concluído
// (null = "incompleto", diferente de zero). A partida (ordem 1) é sempre 0.
export function tempoParadoSeg({ ordem, chegada, saida }) {
  if (ordem === 1) return 0;
  if (!chegada || !saida) return null;
  const ms = new Date(saida).getTime() - new Date(chegada).getTime();
  if (ms < 0) throw new Error('RN08: saída anterior à chegada.');
  return Math.floor(ms / 1000);
}

// RN03. Soma dos pontos de ordem > 1 já concluídos.
export function totaisDoRoteiro(pontos) {
  let totalParadoSeg = 0;
  let concluidos = 0;
  const computaveis = pontos.filter((p) => p.ordem > 1);
  for (const p of computaveis) {
    const t = tempoParadoSeg(p);
    if (t !== null) {
      totalParadoSeg += t;
      concluidos += 1;
    }
  }
  return {
    totalParadoSeg,
    pontosConcluidos: concluidos,
    pontosComputaveis: computaveis.length,
    completo: concluidos === computaveis.length,
  };
}

// ---- Decimais --------------------------------------------------------------------------------

// "12.5" com escala 2 -> 1250n. Aceita apenas números não negativos com até `escala` casas.
export function paraInteiro(texto, escala) {
  const valor = String(texto).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(valor);
  if (!m) throw new Error(`Decimal inválido: "${texto}".`);
  const [, inteira, fracao = ''] = m;
  if (fracao.length > escala) throw new Error(`Decimal "${texto}" excede ${escala} casas.`);
  return BigInt(inteira + fracao.padEnd(escala, '0'));
}

// 1250n com escala 2 -> "12.50"
export function deInteiro(valor, escala) {
  const texto = valor.toString().padStart(escala + 1, '0');
  return escala === 0 ? texto : `${texto.slice(0, -escala)}.${texto.slice(-escala)}`;
}

// round_half_up(numerador / denominador) para inteiros positivos.
function dividirArredondando(numerador, denominador) {
  return (2n * numerador + denominador) / (2n * denominador);
}

// ---- Percentual da jornada (RN04) --------------------------------------------------------------

// Percentual com 3 casas (P05): total / (jornada × 60) × 100. null se jornada inválida.
export function percentualJornada(totalParadoSeg, jornadaMin) {
  if (!Number.isInteger(jornadaMin) || jornadaMin <= 0) return null;
  const milesimos = dividirArredondando(BigInt(totalParadoSeg) * 10_000n, BigInt(jornadaMin) * 6n);
  return deInteiro(milesimos, 3);
}

// ---- Custo (RN07) ------------------------------------------------------------------------------

// Entradas: valorCombustivel (R$/L, 3 casas), rendimentoKmL (2 casas), distanciaKm (2 casas).
// Qualquer entrada ausente => custo indisponível com motivo explícito (nunca zero).
export function calcularCusto({ valorCombustivel, rendimentoKmL, distanciaKm }) {
  const faltando = [];
  if (valorCombustivel == null) faltando.push('valor do combustível');
  if (rendimentoKmL == null) faltando.push('rendimento do veículo');
  if (distanciaKm == null) faltando.push('distância');

  const r = rendimentoKmL == null ? null : paraInteiro(rendimentoKmL, 2);
  if (r === 0n) faltando.push('rendimento maior que zero');

  let custoKm = null;
  if (valorCombustivel != null && r) {
    const c = paraInteiro(valorCombustivel, 3);
    // (c/1000) / (r/100) em unidades de 1e-4 = c × 1000 / r
    custoKm = deInteiro(dividirArredondando(c * 1000n, r), 4);
  }

  if (faltando.length) {
    return { disponivel: false, motivo: `Não disponível: falta ${faltando.join(', ')}.`, custoKm, custoEstimado: null };
  }

  const c = paraInteiro(valorCombustivel, 3);
  const d = paraInteiro(distanciaKm, 2);
  // (d/100) × (c/1000) / (r/100) em centavos = d × c / (10 × r); arredondado uma única vez.
  const centavos = dividirArredondando(d * c, 10n * r);
  return { disponivel: true, motivo: null, custoKm, custoEstimado: deInteiro(centavos, 2) };
}

// ---- Datas -------------------------------------------------------------------------------------

// Data local (AAAA-MM-DD) de um instante no fuso operacional.
export function dataLocal(instante, fusoHorario) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}
