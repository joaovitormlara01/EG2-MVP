import { describe, expect, it } from 'vitest';
import { campoTexto, gerarCsv } from '../../src/server/modules/consultas/csv.js';

describe('CSV (UC12)', () => {
  it('neutraliza fórmulas de planilha em campos de texto', () => {
    for (const perigoso of ['=1+1', '+SOMA(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
      expect(campoTexto(perigoso).replace(/^"/, '')).toMatch(/^'/);
    }
    expect(campoTexto('Rua A')).toBe('Rua A');
  });

  it('escapa separador, aspas e quebras de linha', () => {
    expect(campoTexto('a;b')).toBe('"a;b"');
    expect(campoTexto('diz "oi"')).toBe('"diz ""oi"""');
    expect(campoTexto('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(campoTexto(null)).toBe('');
  });

  it('gera BOM, CRLF, decimais com vírgula e totais identificados', () => {
    const csv = gerarCsv({
      ocorrencias: [{
        data: '2026-10-01', roteiroId: 7, situacaoRoteiro: 'encerrado', motorista: 'José Ávila', equipe: 'Centro',
        ordem: 2, partida: false, endereco: 'Praça da Estação', chegada: '2026-10-01T12:00:00.000Z',
        saida: '2026-10-01T12:15:30.000Z', tempoParadoSeg: 930, situacao: 'concluido',
      }],
      totais: {
        roteiros: 1, roteirosIncompletos: 0, totalParadoSeg: 930, paresMotoristaData: 1, jornadaMinTotal: 480,
        percentualJornada: '3.229', custo: { estimado: null, roteirosSemCusto: 1 },
      },
      filtros: { inicio: '2026-10-01', fim: '2026-10-01' },
      fusoHorario: 'America/Sao_Paulo',
    });
    expect(csv.startsWith('﻿RotaClara')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('01/10/2026;7;Encerrado;José Ávila;Centro;2;Parada;Praça da Estação;01/10/2026 09:00:00;01/10/2026 09:15:30;930;15,50;Concluído');
    expect(csv).toContain('Percentual da jornada (%);3,229');
    expect(csv).toContain('Custo estimado (R$);Não disponível');
  });
});
