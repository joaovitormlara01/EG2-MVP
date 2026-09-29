import { describe, expect, it } from 'vitest';
import {
  calcularCusto, dataLocal, deInteiro, paraInteiro, percentualJornada, tempoParadoSeg, totaisDoRoteiro,
} from '../../src/server/shared/calculos.js';

const h = (hhmm) => `2026-10-01T${hhmm}:00-03:00`;

describe('tempo parado (RN01–RN03)', () => {
  it('CT01: partida 08:00–08:20 = 0; ponto seguinte 09:00–09:15 = 15 min; total 15', () => {
    const pontos = [
      { ordem: 1, chegada: h('08:00'), saida: h('08:20') },
      { ordem: 2, chegada: h('09:00'), saida: h('09:15') },
    ];
    expect(tempoParadoSeg(pontos[0])).toBe(0);
    expect(tempoParadoSeg(pontos[1])).toBe(15 * 60);
    expect(totaisDoRoteiro(pontos)).toEqual({
      totalParadoSeg: 900, pontosConcluidos: 1, pontosComputaveis: 1, completo: true,
    });
  });

  it('CT02: 15 + 10 + 50 = 75 min; 75/480 = 15,625%', () => {
    const pontos = [
      { ordem: 1, chegada: h('07:00'), saida: h('07:30') },
      { ordem: 2, chegada: h('08:00'), saida: h('08:15') },
      { ordem: 3, chegada: h('09:00'), saida: h('09:10') },
      { ordem: 4, chegada: h('10:00'), saida: h('10:50') },
    ];
    const { totalParadoSeg } = totaisDoRoteiro(pontos);
    expect(totalParadoSeg).toBe(75 * 60);
    expect(percentualJornada(totalParadoSeg, 480)).toBe('15.625');
    expect(percentualJornada(totalParadoSeg, 420)).toBe('17.857'); // CT05: jornada 420
  });

  it('ponto incompleto é null (≠ zero) e não entra no total', () => {
    const pontos = [
      { ordem: 1, chegada: h('08:00'), saida: null },
      { ordem: 2, chegada: h('09:00'), saida: null },
      { ordem: 3, chegada: null, saida: null },
    ];
    expect(tempoParadoSeg(pontos[0])).toBe(0);
    expect(tempoParadoSeg(pontos[1])).toBeNull();
    expect(totaisDoRoteiro(pontos)).toMatchObject({ totalParadoSeg: 0, pontosConcluidos: 0, completo: false });
  });

  it('RN08: saída antes da chegada é erro', () => {
    expect(() => tempoParadoSeg({ ordem: 2, chegada: h('09:15'), saida: h('09:00') })).toThrow(/RN08/);
  });

  it('jornada inválida não produz percentual', () => {
    expect(percentualJornada(100, 0)).toBeNull();
  });
});

describe('custo (RN07)', () => {
  it('CT06: R$ 6,00; 12 km/l; 120 km → R$ 0,50/km e R$ 60,00', () => {
    expect(calcularCusto({ valorCombustivel: '6.000', rendimentoKmL: '12.00', distanciaKm: '120.00' })).toEqual({
      disponivel: true, motivo: null, custoKm: '0.5000', custoEstimado: '60.00',
    });
  });

  it('arredonda uma única vez, meio para cima, sobre o valor exato', () => {
    // 87,45 × 5,899 / 11,3 = 45,652… → 45,65; 1 × 0,005 / 1 = 0,005 → 0,01 (meio para cima).
    expect(calcularCusto({ valorCombustivel: '5.899', rendimentoKmL: '11.30', distanciaKm: '87.45' }).custoEstimado).toBe('45.65');
    expect(calcularCusto({ valorCombustivel: '0.005', rendimentoKmL: '1', distanciaKm: '1' }).custoEstimado).toBe('0.01');
    expect(calcularCusto({ valorCombustivel: '0.004', rendimentoKmL: '1', distanciaKm: '1' }).custoEstimado).toBe('0.00');
  });

  it('entradas ausentes produzem "não disponível", nunca zero', () => {
    const r = calcularCusto({ valorCombustivel: null, rendimentoKmL: '12.00', distanciaKm: '120.00' });
    expect(r.disponivel).toBe(false);
    expect(r.custoEstimado).toBeNull();
    expect(r.motivo).toMatch(/valor do combustível/);
    expect(calcularCusto({ valorCombustivel: '6', rendimentoKmL: null, distanciaKm: null }).motivo).toMatch(
      /rendimento do veículo, distância/,
    );
    expect(calcularCusto({ valorCombustivel: '6', rendimentoKmL: '0', distanciaKm: '10' }).disponivel).toBe(false);
  });
});

describe('decimais e datas', () => {
  it('converte texto decimal sem ponto flutuante', () => {
    expect(paraInteiro('12.5', 2)).toBe(1250n);
    expect(deInteiro(5n, 2)).toBe('0.05');
    expect(() => paraInteiro('1.234', 2)).toThrow();
    expect(() => paraInteiro('-1', 2)).toThrow();
  });

  it('data local usa o fuso operacional', () => {
    expect(dataLocal(new Date('2026-10-02T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-10-01');
  });
});
