// Política de acesso contra a matriz de permissão do Projeto Preliminar (p.7).

import { describe, expect, it } from 'vitest';
import { escopoDeConsulta, garantir, pode } from '../../src/server/shared/autorizacao.js';

const admin = { id: 1, perfil: 'admin', equipeIds: [] };
const gerente = { id: 2, perfil: 'gerente', equipeIds: [10] };
const motorista = { id: 3, perfil: 'motorista', equipeIds: [10] };

const daEquipe = { equipeId: 10, motoristaId: 3, situacao: 'em_execucao' };
const outraEquipe = { equipeId: 20, motoristaId: 4, situacao: 'em_execucao' };

describe('matriz de permissão (PP p.7)', () => {
  it('registrar chegada e saída: motorista só no próprio roteiro aberto', () => {
    expect(pode(motorista, 'coleta.registrar', daEquipe)).toBe(true);
    expect(pode(motorista, 'coleta.registrar', outraEquipe)).toBe(false);
    expect(pode(motorista, 'coleta.registrar', { ...daEquipe, situacao: 'encerrado' })).toBe(false);
    expect(pode(motorista, 'coleta.registrar', { ...daEquipe, situacao: 'cancelado' })).toBe(false);
    expect(pode(gerente, 'coleta.registrar', daEquipe)).toBe(false);
  });

  it('correção auditada (RN09): gerente da equipe e admin; nunca motorista', () => {
    const encerrado = { ...daEquipe, situacao: 'encerrado' };
    expect(pode(gerente, 'coleta.corrigir', encerrado)).toBe(true);
    expect(pode(gerente, 'coleta.corrigir', { ...outraEquipe, situacao: 'encerrado' })).toBe(false);
    expect(pode(admin, 'coleta.corrigir', { ...outraEquipe, situacao: 'encerrado' })).toBe(true);
    expect(pode(motorista, 'coleta.corrigir', encerrado)).toBe(false);
  });

  it('montar roteiro: não para motorista; gerente na equipe; admin sim', () => {
    expect(pode(motorista, 'roteiro.gerir', daEquipe)).toBe(false);
    expect(pode(gerente, 'roteiro.gerir', daEquipe)).toBe(true);
    expect(pode(gerente, 'roteiro.gerir', outraEquipe)).toBe(false);
    expect(pode(admin, 'roteiro.gerir', outraEquipe)).toBe(true);
  });

  it('consultar roteiro: próprio / equipe / todos', () => {
    expect(pode(motorista, 'roteiro.consultar', daEquipe)).toBe(true);
    expect(pode(motorista, 'roteiro.consultar', { ...daEquipe, motoristaId: 99 })).toBe(false);
    expect(pode(gerente, 'roteiro.consultar', outraEquipe)).toBe(false);
    expect(pode(admin, 'roteiro.consultar', outraEquipe)).toBe(true);
  });

  it('alterar parâmetros: somente admin (CT10)', () => {
    expect(pode(motorista, 'parametros.alterar')).toBe(false);
    expect(pode(gerente, 'parametros.alterar')).toBe(false);
    expect(pode(admin, 'parametros.alterar')).toBe(true);
    expect(() => garantir(motorista, 'parametros.alterar')).toThrow(
      expect.objectContaining({ status: 403, codigo: 'PROIBIDO' }),
    );
  });

  it('gerir usuários: gerente só motoristas da equipe; admin todos', () => {
    expect(pode(gerente, 'motorista.gerir', { equipeId: 10 })).toBe(true);
    expect(pode(gerente, 'motorista.gerir', { equipeId: 20 })).toBe(false);
    expect(pode(gerente, 'gerente.gerir')).toBe(false);
    expect(pode(motorista, 'motorista.gerir', { equipeId: 10 })).toBe(false);
    expect(pode(admin, 'gerente.gerir')).toBe(true);
  });

  it('D06: histórico e dashboard para todos (com escopo); exportação só gerente e admin', () => {
    for (const u of [motorista, gerente, admin]) {
      expect(pode(u, 'historico.consultar')).toBe(true);
      expect(pode(u, 'dashboard.consultar')).toBe(true);
    }
    expect(pode(motorista, 'relatorio.exportar')).toBe(false);
    expect(pode(gerente, 'relatorio.exportar')).toBe(true);
    expect(pode(admin, 'relatorio.exportar')).toBe(true);
  });

  it('auditoria: somente admin', () => {
    expect(pode(gerente, 'auditoria.consultar')).toBe(false);
    expect(pode(admin, 'auditoria.consultar')).toBe(true);
  });

  it('nega usuário ausente ou perfil desconhecido e ação inexistente é erro de programação', () => {
    expect(pode(null, 'ponto.consultar')).toBe(false);
    expect(pode({ id: 9, perfil: 'dono', equipeIds: [] }, 'ponto.consultar')).toBe(false);
    expect(() => pode(admin, 'acao.inventada')).toThrow(/desconhecida/);
  });
});

describe('escopo de consulta (histórico, dashboard, exportação)', () => {
  it('admin vê tudo, gerente as equipes, motorista só os próprios roteiros', () => {
    expect(escopoDeConsulta(admin)).toEqual({ tipo: 'todos' });
    expect(escopoDeConsulta(gerente)).toEqual({ tipo: 'equipes', equipeIds: [10] });
    expect(escopoDeConsulta(motorista)).toEqual({ tipo: 'motorista', motoristaId: 3 });
  });
});
