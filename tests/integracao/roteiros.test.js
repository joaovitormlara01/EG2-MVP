// Etapas 6–7 com PostgreSQL real (TEST_DATABASE_URL "*_test"; o schema é recriado).
// O relógio do servidor é controlado pelo teste para reproduzir CT01, CT02, CT05 e CT06.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { construirApp } from '../../src/server/app.js';
import { carregarConfig } from '../../src/server/config.js';
import { migrar } from '../../src/server/db/migrador.js';
import { criarPool } from '../../src/server/db/pool.js';
import { gerarHashSenha } from '../../src/server/shared/senha.js';

const URL_TESTE = process.env.TEST_DATABASE_URL;
if (URL_TESTE && !new URL(URL_TESTE).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL deve apontar para um banco "*_test".');
}

// Relógio: 2026-10-01 no fuso de São Paulo (UTC-3).
let instante = new Date('2026-10-01T11:00:00Z');
const as = (hhmm, dia = '2026-10-01') => {
  instante = new Date(`${dia}T${hhmm}:00-03:00`);
};

describe.skipIf(!URL_TESTE)('etapas 6–7: cadastros, roteiros, coleta, parâmetros', () => {
  let pool;
  let app;
  const c = {}; // cookies por papel
  const ids = {};

  async function chamar(papel, method, url, payload) {
    const r = await app.inject({
      method, url: `/api/v1${url}`, headers: c[papel] ? { cookie: c[papel] } : {},
      ...(payload !== undefined ? { payload } : method === 'GET' ? {} : { payload: {} }),
    });
    return { status: r.statusCode, corpo: r.body ? r.json() : null };
  }
  const get = (p, url) => chamar(p, 'GET', url);
  const post = (p, url, b) => chamar(p, 'POST', url, b);
  const put = (p, url, b) => chamar(p, 'PUT', url, b);

  async function entrar(papel, login, senha) {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login, senha } });
    expect(r.statusCode).toBe(200);
    const k = r.cookies.find((x) => x.name === 'rotaclara_sessao');
    c[papel] = `rotaclara_sessao=${k.value}`;
  }

  async function auditoria(entidade, entidadeId) {
    const { rows } = await pool.query(
      `select acao, valor_anterior, valor_novo, usuario_id from registro_auditoria
        where entidade = $1 and entidade_id = $2 order by id`,
      [entidade, String(entidadeId)],
    );
    return rows;
  }

  async function montar(papel, corpo) {
    return post(papel, '/roteiros', { chaveIdempotencia: randomUUID(), ...corpo });
  }

  beforeAll(async () => {
    pool = criarPool(URL_TESTE);
    await pool.query('drop schema public cascade');
    await pool.query('create schema public');
    await migrar(pool);
    const hash = await gerarHashSenha('senha-admin-1');
    await pool.query(
      `insert into usuario (nome, email, perfil, senha_hash) values ('Admin', 'admin@t.test', 'admin', $1)`,
      [hash],
    );
    app = await construirApp({ config: carregarConfig({ NODE_ENV: 'test' }), pool, agora: () => instante });
    await app.ready();
    await entrar('admin', 'admin@t.test', 'senha-admin-1');
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  describe('cadastros (etapa 6)', () => {
    it('admin cadastra gerentes e equipes; e-mail duplicado é recusado', async () => {
      const g1 = await post('admin', '/gerentes', { nome: 'Gerente Um', email: 'g1@t.test', senha: 'senha-gerente' });
      const g2 = await post('admin', '/gerentes', { nome: 'Gerente Dois', email: 'g2@t.test', senha: 'senha-gerente' });
      expect(g1.status).toBe(201);
      ids.g1 = g1.corpo.gerente.id;
      ids.g2 = g2.corpo.gerente.id;
      const dup = await post('admin', '/gerentes', { nome: 'X', email: 'G1@t.test', senha: 'senha-gerente' });
      expect(dup.status).toBe(409);
      expect(dup.corpo.erro.campos.email).toMatch(/já cadastrado/);

      const e1 = await post('admin', '/equipes', { nome: 'Centro', gerenteId: ids.g1 });
      const e2 = await post('admin', '/equipes', { nome: 'Norte', gerenteId: ids.g2 });
      expect(e1.status).toBe(201);
      ids.e1 = e1.corpo.equipe.id;
      ids.e2 = e2.corpo.equipe.id;
      await entrar('g1', 'g1@t.test', 'senha-gerente');
      await entrar('g2', 'g2@t.test', 'senha-gerente');
    });

    it('gerente não gere gerentes nem equipes', async () => {
      expect((await post('g1', '/gerentes', { nome: 'X', email: 'x@t.test', senha: 'senha-gerente' })).status).toBe(403);
      expect((await post('g1', '/equipes', { nome: 'Sul' })).status).toBe(403);
      expect((await get('g1', '/equipes')).corpo.equipes.map((e) => e.id)).toEqual([ids.e1]);
    });

    it('veículo exige rendimento positivo', async () => {
      expect((await post('g1', '/veiculos', { placa: 'abc1d23', rendimentoKmL: '0' })).status).toBe(400);
      const v = await post('g1', '/veiculos', { placa: 'abc1d23', descricao: 'Moto', rendimentoKmL: '12.00' });
      expect(v.status).toBe(201);
      expect(v.corpo.veiculo.placa).toBe('ABC1D23');
      ids.v1 = v.corpo.veiculo.id;
    });

    it('gerente cadastra motorista só na própria equipe; documento é único', async () => {
      const base = { nome: 'Maria Motorista', documento: '111', senha: 'senha-motorista', veiculoId: ids.v1 };
      expect((await post('g1', '/motoristas', { ...base, equipeId: ids.e2 })).status).toBe(403);
      const m = await post('g1', '/motoristas', { ...base, equipeId: ids.e1 });
      expect(m.status).toBe(201);
      ids.m1 = m.corpo.motorista.id;
      const dup = await post('g1', '/motoristas', { ...base, nome: 'Outra', equipeId: ids.e1 });
      expect(dup.status).toBe(409);
      expect(dup.corpo.erro.campos.documento).toBeDefined();
      const m2 = await post('g2', '/motoristas', { ...base, documento: '222', nome: 'Nando', equipeId: ids.e2 });
      ids.m2 = m2.corpo.motorista.id;
      await entrar('m1', '111', 'senha-motorista');
      await entrar('m2', '222', 'senha-motorista');
    });

    it('gerente vê e altera só motoristas da equipe; motorista não gere cadastros', async () => {
      expect((await get('g1', '/motoristas')).corpo.motoristas.map((m) => m.id)).toEqual([ids.m1]);
      const alterar = { nome: 'Nando', documento: '222', equipeId: ids.e1, ativo: true };
      expect((await put('g1', `/motoristas/${ids.m2}`, alterar)).status).toBe(403);
      expect((await get('m1', '/motoristas')).status).toBe(403);
      expect((await post('m1', '/pontos', { endereco: 'X', latitude: '0', longitude: '0' })).status).toBe(403);
    });

    it('pontos exigem endereço e coordenadas válidas', async () => {
      expect((await post('g1', '/pontos', { endereco: 'Rua A', latitude: '91', longitude: '0' })).status).toBe(400);
      expect((await post('g1', '/pontos', { endereco: '  ', latitude: '0', longitude: '0' })).status).toBe(400);
      expect((await post('g1', '/pontos', { endereco: 'Rua A' })).status).toBe(400);
      ids.p = [];
      for (const [i, end] of ['Base, 1', 'Rua A, 10', 'Rua B, 20', 'Rua C, 30'].entries()) {
        const r = await post('g1', '/pontos', { nome: `P${i}`, endereco: end, latitude: '-19.9167', longitude: `-43.93${i}` });
        expect(r.status).toBe(201);
        ids.p.push(r.corpo.ponto.id);
      }
    });

    it('não existe exclusão física: inativação via PUT, com auditoria', async () => {
      const extra = await post('g1', '/pontos', { endereco: 'Rua Z', latitude: '1', longitude: '1' });
      const id = extra.corpo.ponto.id;
      expect((await chamar('g1', 'DELETE', `/pontos/${id}`)).status).toBe(404);
      const r = await put('g1', `/pontos/${id}`, { endereco: 'Rua Z', latitude: '1', longitude: '1', ativo: false });
      expect(r.corpo.ponto.ativo).toBe(false);
      expect((await auditoria('ponto', id)).map((a) => a.acao)).toEqual(['criar', 'inativar']);
      ids.pontoInativo = id;
    });

    it('listas de dados pessoais registram o acesso (RNF06)', async () => {
      const { rows } = await pool.query(`select count(*) as n from registro_auditoria where acao = 'consulta_lista'`);
      expect(rows[0].n).toBeGreaterThan(0);
    });
  });

  describe('montagem de roteiro (etapa 6)', () => {
    it('exige ≥ 2 pontos ativos; ordem 1 é a partida; custo indisponível sem combustível', async () => {
      expect((await montar('g1', { motoristaId: ids.m1, data: '2026-10-01', pontoIds: [ids.p[0]] })).status).toBe(400);
      expect(
        (await montar('g1', { motoristaId: ids.m1, data: '2026-10-01', pontoIds: [ids.p[0], ids.pontoInativo] })).status,
      ).toBe(422);
      const r = await montar('g1', {
        motoristaId: ids.m1, data: '2026-10-01', veiculoId: ids.v1, distanciaKm: '120', pontoIds: [ids.p[0], ids.p[1]],
      });
      expect(r.status).toBe(201);
      const rot = r.corpo.roteiro;
      ids.r1 = rot.id;
      expect(rot.situacao).toBe('planejado');
      expect(rot.equipe.id).toBe(ids.e1);
      expect(rot.pontos.map((p) => [p.ordem, p.partida, p.endereco])).toEqual([
        [1, true, 'Base, 1'], [2, false, 'Rua A, 10'],
      ]);
      expect(rot.custo).toMatchObject({ disponivel: false, custoEstimado: null, custoKm: null, rendimentoKmL: '12.00' });
      expect(rot.custo.motivo).toMatch(/combustível/);
      expect(r.corpo.avisos).toEqual([]);
    });

    it('não aceita equipe informada pelo cliente e nega gerente de outra equipe', async () => {
      const corpo = { motoristaId: ids.m1, data: '2026-10-01', pontoIds: [ids.p[0], ids.p[1]] };
      expect((await montar('g1', { ...corpo, equipeId: ids.e2 })).status).toBe(400);
      expect((await montar('g2', corpo)).status).toBe(403);
      expect((await montar('m1', corpo)).status).toBe(403);
    });

    it('reenvio com a mesma chave devolve o mesmo roteiro (duplo clique)', async () => {
      const corpo = { motoristaId: ids.m1, data: '2026-10-09', pontoIds: [ids.p[0], ids.p[1]], chaveIdempotencia: randomUUID() };
      const [a, b] = await Promise.all([post('g1', '/roteiros', corpo), post('g1', '/roteiros', corpo)]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(a.corpo.roteiro.id).toBe(b.corpo.roteiro.id);
      const { rows } = await pool.query(`select count(*) as n from roteiro where data = '2026-10-09'`);
      expect(rows[0].n).toBe(1);
    });

    it('permite vários roteiros do motorista na mesma data, com aviso', async () => {
      const r = await montar('g1', { motoristaId: ids.m1, data: '2026-10-01', pontoIds: [ids.p[2], ids.p[3]] });
      expect(r.status).toBe(201);
      ids.r2 = r.corpo.roteiro.id;
      expect(r.corpo.avisos[0]).toMatch(new RegExp(`nº ${ids.r1}`));
    });

    it('reordena pontos de forma atômica e exige a versão atual', async () => {
      const antes = (await get('g1', `/roteiros/${ids.r2}`)).corpo.roteiro;
      const ok = await put('g1', `/roteiros/${ids.r2}`, { versao: antes.versao, pontoIds: [ids.p[3], ids.p[2], ids.p[1]] });
      expect(ok.status).toBe(200);
      expect(ok.corpo.roteiro.pontos.map((p) => p.pontoId)).toEqual([ids.p[3], ids.p[2], ids.p[1]]);
      expect(ok.corpo.roteiro.pontos.map((p) => p.ordem)).toEqual([1, 2, 3]);
      const velho = await put('g1', `/roteiros/${ids.r2}`, { versao: antes.versao, pontoIds: [ids.p[0], ids.p[1]] });
      expect(velho.status).toBe(409);
      expect(velho.corpo.erro.codigo).toBe('VERSAO_DESATUALIZADA');
      // Falha no meio (ponto inexistente) não deixa alteração parcial.
      const falha = await put('g1', `/roteiros/${ids.r2}`, { versao: ok.corpo.roteiro.versao, pontoIds: [ids.p[0], 999999] });
      expect(falha.status).toBe(400);
      const depois = (await get('g1', `/roteiros/${ids.r2}`)).corpo.roteiro;
      expect(depois.pontos.map((p) => p.pontoId)).toEqual([ids.p[3], ids.p[2], ids.p[1]]);
    });

    it('preserva endereço e rendimento históricos quando o cadastro muda', async () => {
      await put('g1', `/pontos/${ids.p[1]}`, { endereco: 'Rua A, 10 (novo)', latitude: '0', longitude: '0', ativo: true });
      await put('g1', `/veiculos/${ids.v1}`, { placa: 'ABC1D23', rendimentoKmL: '30.00', ativo: true });
      const rot = (await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      expect(rot.pontos[1].endereco).toBe('Rua A, 10');
      expect(rot.custo.rendimentoKmL).toBe('12.00');
      await put('g1', `/veiculos/${ids.v1}`, { placa: 'ABC1D23', rendimentoKmL: '12.00', ativo: true });
    });

    it('motorista só vê os próprios roteiros', async () => {
      expect((await get('m1', `/roteiros/${ids.r1}`)).status).toBe(200);
      expect((await get('m2', `/roteiros/${ids.r1}`)).status).toBe(403);
      expect((await get('m2', '/roteiros?data=2026-10-01')).corpo.roteiros).toEqual([]);
      expect((await get('g2', '/roteiros?data=2026-10-01')).corpo.roteiros).toEqual([]);
      expect((await get('g1', '/roteiros?data=2026-10-01')).corpo.roteiros).toHaveLength(2);
    });
  });

  describe('coleta, cálculos e encerramento (etapa 7)', () => {
    const reg = (papel, id, ordem, tipo) => post(papel, `/roteiros/${id}/pontos/${ordem}/${tipo}`);

    it('não registra em roteiro de data futura nem fora de sequência', async () => {
      const futuro = await montar('g1', { motoristaId: ids.m1, data: '2026-10-05', pontoIds: [ids.p[0], ids.p[1]] });
      ids.rFuturo = futuro.corpo.roteiro.id;
      as('08:00');
      expect((await reg('m1', ids.rFuturo, 1, 'chegada')).status).toBe(422);
      expect((await reg('m1', ids.r1, 2, 'chegada')).status).toBe(422);
      expect((await reg('m1', ids.r1, 2, 'saida')).status).toBe(422);
      expect((await reg('g1', ids.r1, 1, 'chegada')).status).toBe(403);
      expect((await reg('m2', ids.r1, 1, 'chegada')).status).toBe(403);
    });

    it('CT01: partida 08:00–08:20 = 0; 09:00–09:15 = 15 min; primeira chegada inicia o roteiro', async () => {
      as('08:00');
      const r1 = await reg('m1', ids.r1, 1, 'chegada');
      expect(r1.status).toBe(200);
      expect(r1.corpo.roteiro.situacao).toBe('em_execucao');
      as('08:20');
      await reg('m1', ids.r1, 1, 'saida');
      as('09:00');
      const cheg = await reg('m1', ids.r1, 2, 'chegada');
      expect(cheg.corpo.roteiro.pontos[1]).toMatchObject({ situacao: 'em_andamento', tempoParadoSeg: null });
      as('09:15');
      const fim = (await reg('m1', ids.r1, 2, 'saida')).corpo.roteiro;
      expect(fim.pontos.map((p) => p.tempoParadoSeg)).toEqual([0, 900]);
      expect(fim.pontos[0]).toMatchObject({ partida: true, contaNoTotal: false, chegada: '2026-10-01T11:00:00.000Z' });
      expect(fim.totais).toMatchObject({ totalParadoSeg: 900, completo: true, jornadaMin: 480, percentualJornada: '3.125' });
    });

    it('repetir a mesma ação (ou em paralelo) não sobrescreve nem duplica', async () => {
      as('09:40');
      const respostas = await Promise.all([1, 2, 3, 4].map(() => reg('m1', ids.r1, 2, 'saida')));
      expect(respostas.every((r) => r.status === 200 && r.corpo.jaRegistrado)).toBe(true);
      const rot = (await get('m1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      expect(rot.pontos[1].saida).toBe('2026-10-01T12:15:00.000Z');
      expect((await auditoria('roteiro_ponto', `${ids.r1}/2`)).filter((a) => a.acao === 'registrar_saida')).toHaveLength(1);
    });

    it('chegadas simultâneas no mesmo ponto geram um único registro', async () => {
      as('10:00');
      const rs = await Promise.all([1, 2, 3].map(() => reg('m1', ids.r2, 1, 'chegada')));
      expect(rs.filter((r) => r.corpo.jaRegistrado === false)).toHaveLength(1);
      expect((await auditoria('roteiro_ponto', `${ids.r2}/1`)).filter((a) => a.acao === 'registrar_chegada')).toHaveLength(1);
    });

    it('não encerra com ponto incompleto (RN10); motorista encerra o próprio roteiro completo', async () => {
      const r2 = (await get('m1', `/roteiros/${ids.r2}`)).corpo.roteiro;
      const inc = await post('m1', `/roteiros/${ids.r2}/encerrar`, { versao: r2.versao });
      expect(inc.status).toBe(422);
      expect(inc.corpo.erro.mensagem).toMatch(/sem chegada: 2, 3; sem saída: 2, 3/);

      const r1 = (await get('m1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      const fim = await post('m1', `/roteiros/${ids.r1}/encerrar`, { versao: r1.versao });
      expect(fim.status).toBe(200);
      expect(fim.corpo.roteiro.situacao).toBe('encerrado');
      expect((await reg('m1', ids.r1, 2, 'chegada')).status).toBe(403);
      expect((await post('m1', `/roteiros/${ids.r1}/encerrar`, { versao: fim.corpo.roteiro.versao })).status).toBe(403);
    });

    it('correção: motorista e gerente de outra equipe recebem 403; horários inválidos 422', async () => {
      const rot = (await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      const corpo = { versao: rot.versao, chegada: '2026-10-01T12:00:00Z', saida: '2026-10-01T12:20:00Z', motivo: 'Ajuste' };
      expect((await put('m1', `/roteiros/${ids.r1}/pontos/2`, corpo)).status).toBe(403);
      expect((await put('g2', `/roteiros/${ids.r1}/pontos/2`, corpo)).status).toBe(403);
      const invertido = await put('g1', `/roteiros/${ids.r1}/pontos/2`, { ...corpo, saida: '2026-10-01T11:59:00Z' });
      expect(invertido.status).toBe(422);
      expect(invertido.corpo.erro.campos.saida).toMatch(/RN08/);
      const semSaida = await put('g1', `/roteiros/${ids.r1}/pontos/2`, { ...corpo, saida: null });
      expect(semSaida.corpo.erro.campos.saida).toMatch(/RN10/);
      const futuro = await put('g1', `/roteiros/${ids.r1}/pontos/2`, { ...corpo, chegada: '2026-10-02T12:00:00Z', saida: '2026-10-02T12:10:00Z' });
      expect(futuro.status).toBe(422);
      expect(futuro.corpo.erro.campos.chegada).toMatch(/futuro/);
    });

    it('correção autorizada recalcula o total e gera auditoria imutável na mesma transação', async () => {
      const rot = (await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      const r = await put('g1', `/roteiros/${ids.r1}/pontos/2`, {
        versao: rot.versao, chegada: '2026-10-01T12:00:00Z', saida: '2026-10-01T12:20:00Z', motivo: 'Motorista esqueceu',
      });
      expect(r.status).toBe(200);
      expect(r.corpo.roteiro.pontos[1].tempoParadoSeg).toBe(1200);
      expect(r.corpo.roteiro.totais.totalParadoSeg).toBe(1200);
      expect(r.corpo.roteiro.situacao).toBe('encerrado');
      const aud = (await auditoria('roteiro_ponto', `${ids.r1}/2`)).at(-1);
      expect(aud).toMatchObject({ acao: 'corrigir', usuario_id: ids.g1 });
      expect(aud.valor_anterior).toMatchObject({ tempoParadoSeg: 900, totalParadoSeg: 900 });
      expect(aud.valor_novo).toMatchObject({ tempoParadoSeg: 1200, totalParadoSeg: 1200, motivo: 'Motorista esqueceu' });
      await expect(pool.query(`update registro_auditoria set acao = 'x' where acao = 'corrigir'`)).rejects.toThrow(/imutável/);
      // Versão antiga agora é recusada (sem sobrescrita silenciosa).
      const velho = await put('g1', `/roteiros/${ids.r1}/pontos/2`, {
        versao: rot.versao, chegada: '2026-10-01T12:00:00Z', saida: '2026-10-01T12:05:00Z', motivo: 'x-x',
      });
      expect(velho.status).toBe(409);
    });

    it('correções restauram horários históricos em qualquer ordem (só RN08/RN10), com auditoria', async () => {
      // Ponto 2 corrigido primeiro para ANTES do horário atual da partida — aceito.
      let rot = (await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      const p2 = await put('g1', `/roteiros/${ids.r1}/pontos/2`, {
        versao: rot.versao, chegada: '2026-10-01T10:30:00Z', saida: '2026-10-01T10:50:00Z', motivo: 'Horário real informado',
      });
      expect(p2.status).toBe(200);
      rot = p2.corpo.roteiro;
      const p1 = await put('g1', `/roteiros/${ids.r1}/pontos/1`, {
        versao: rot.versao, chegada: '2026-10-01T10:00:00Z', saida: '2026-10-01T10:20:00Z', motivo: 'Horário real informado',
      });
      expect(p1.status).toBe(200);
      expect(p1.corpo.roteiro.pontos.map((p) => p.tempoParadoSeg)).toEqual([0, 1200]);
      expect(p1.corpo.roteiro.totais.totalParadoSeg).toBe(1200);
      const acoes = (await auditoria('roteiro_ponto', `${ids.r1}/1`)).map((a) => a.acao);
      expect(acoes).toContain('corrigir');
    });

    it('CT02 e jornada do dia: 15 + 10 + 50 = 75 min = 15,625% de 480; soma por motorista/data', async () => {
      const m = await montar('g1', {
        motoristaId: ids.m1, data: '2026-10-01', pontoIds: [ids.p[0], ids.p[1], ids.p[2], ids.p[3]],
      });
      const id = m.corpo.roteiro.id;
      const seq = [
        [1, 'chegada', '11:00'], [2, 'chegada', '11:30'], [2, 'saida', '11:45'], [3, 'chegada', '12:00'],
        [3, 'saida', '12:10'], [4, 'chegada', '13:00'], [4, 'saida', '13:50'],
      ];
      let rot;
      for (const [ordem, tipo, hora] of seq) {
        as(hora);
        rot = (await reg('m1', id, ordem, tipo)).corpo.roteiro;
      }
      expect(rot.totais).toMatchObject({ totalParadoSeg: 4500, percentualJornada: '15.625' });
      // Dia do motorista: r1 (20 min após correção) + r2 (0) + este (75) = 95 min.
      expect(rot.jornadaDoDia).toEqual({ roteiros: 3, totalParadoSeg: 5700, percentual: '19.792' });
      // Cancelar r2 tira-o do dia.
      const r2 = (await get('g1', `/roteiros/${ids.r2}`)).corpo.roteiro;
      expect((await post('g1', `/roteiros/${ids.r2}/cancelar`, { versao: r2.versao })).corpo.roteiro.situacao).toBe('cancelado');
      expect((await get('m1', `/roteiros/${id}`)).corpo.roteiro.jornadaDoDia.roteiros).toBe(2);
      expect((await post('g1', `/roteiros/${ids.r2}/cancelar`, { versao: r2.versao + 1 })).status).toBe(422);
    });
  });

  describe('parâmetros (etapa 7)', () => {
    it('CT10: motorista e gerente não alteram parâmetros', async () => {
      const corpo = { vigenteDesde: '2026-10-02', jornadaMin: 420, valorCombustivel: '6.000' };
      expect((await post('m1', '/parametros', corpo)).status).toBe(403);
      expect((await post('g1', '/parametros', corpo)).status).toBe(403);
      expect((await get('m1', '/parametros')).status).toBe(403);
    });

    it('vigência retroativa e jornada inválida são recusadas', async () => {
      as('14:00');
      const ontem = await post('admin', '/parametros', { vigenteDesde: '2026-09-30', jornadaMin: 420 });
      expect(ontem.status).toBe(400);
      expect(ontem.corpo.erro.campos.vigenteDesde).toMatch(/retroativa/);
      expect((await post('admin', '/parametros', { vigenteDesde: '2026-10-02', jornadaMin: 0 })).status).toBe(400);
      expect((await post('admin', '/parametros', { vigenteDesde: '2026-10-02', jornadaMin: 1441 })).status).toBe(400);
    });

    it('configuração inicial com vigência HOJE: novos roteiros calculam custo; nada existente é recalculado', async () => {
      const r1Antes = (await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro;
      const futuroAntes = (await get('g1', `/roteiros/${ids.rFuturo}`)).corpo.roteiro;
      const nova = await post('admin', '/parametros', { vigenteDesde: '2026-10-01', jornadaMin: 480, valorCombustivel: '6.000' });
      expect(nova.status).toBe(201);
      expect(nova.corpo).toEqual({ parametro: expect.objectContaining({ versao: 2, vigenteDesde: '2026-10-01', valorCombustivel: '6.000' }) });

      // Existentes (encerrado de hoje e planejado futuro) mantêm a versão e os valores capturados.
      expect((await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro.custo).toEqual(r1Antes.custo);
      const futuro = (await get('g1', `/roteiros/${ids.rFuturo}`)).corpo.roteiro;
      expect(futuro.custo).toEqual(futuroAntes.custo);
      expect(futuro.custo.parametroVersao).toBe(1);
      expect((await auditoria('roteiro', ids.rFuturo)).map((x) => x.acao)).not.toContain('recalcular_parametro');

      // CT06 hoje: motorista sem roteiro no dia → captura a versão 2.
      const ct06 = await montar('admin', { motoristaId: ids.m2, data: '2026-10-01', distanciaKm: '120.00', pontoIds: [ids.p[0], ids.p[1]] });
      expect(ct06.status).toBe(201);
      expect(ct06.corpo.roteiro.veiculo.id).toBe(ids.v1); // veículo atribuído ao motorista (D05)
      expect(ct06.corpo.roteiro.custo).toMatchObject({
        disponivel: true, custoKm: '0.5000', custoEstimado: '60.00', valorCombustivel: '6.000', rendimentoKmL: '12.00', parametroVersao: 2,
      });

      // Política motorista/data: m1 já tem roteiros hoje com a versão 1 → o novo roteiro usa a mesma.
      const mesmoDia = await montar('g1', { motoristaId: ids.m1, data: '2026-10-01', distanciaKm: '10', pontoIds: [ids.p[0], ids.p[1]] });
      expect(mesmoDia.corpo.roteiro.custo).toMatchObject({ parametroVersao: 1, disponivel: false, custoEstimado: null });
      ids.rMesmoDia = mesmoDia.corpo.roteiro.id;
    });

    it('CT05 prospectivo: jornada 420 a partir de 02/10 sem alterar código nem o dia 01/10', async () => {
      as('15:00');
      const v3 = await post('admin', '/parametros', { vigenteDesde: '2026-10-02', jornadaMin: 420, valorCombustivel: '6.000' });
      expect(v3.corpo.parametro).toMatchObject({ versao: 3, jornadaMin: 420 });
      const m = await montar('g1', { motoristaId: ids.m1, data: '2026-10-02', distanciaKm: '120.00', pontoIds: [ids.p[0], ids.p[1], ids.p[2], ids.p[3]] });
      const id = m.corpo.roteiro.id;
      expect(m.corpo.roteiro.custo).toMatchObject({ parametroVersao: 3, custoEstimado: '60.00' });
      const seq = [[1, 'chegada', '08:00'], [2, 'chegada', '08:30'], [2, 'saida', '08:45'], [3, 'chegada', '09:00'],
        [3, 'saida', '09:10'], [4, 'chegada', '10:00'], [4, 'saida', '10:50']];
      let rot;
      for (const [ordem, tipo, hora] of seq) {
        as(hora, '2026-10-02');
        rot = (await post('m1', `/roteiros/${id}/pontos/${ordem}/${tipo}`)).corpo.roteiro;
      }
      expect(rot.totais).toMatchObject({ totalParadoSeg: 4500, jornadaMin: 420, percentualJornada: '17.857' });
      expect((await get('g1', `/roteiros/${ids.r1}`)).corpo.roteiro.totais.jornadaMin).toBe(480);
      ids.rCt05 = id;
    });

    it('D05: roteiro sem veículo é recusado quando o motorista não tem veículo atribuído', async () => {
      const semVeiculo = await post('g1', '/motoristas', { nome: 'Sem Veículo', documento: '333', senha: 'senha-motorista', equipeId: ids.e1 });
      expect(semVeiculo.status).toBe(201);
      const r = await montar('g1', { motoristaId: semVeiculo.corpo.motorista.id, data: '2026-10-02', pontoIds: [ids.p[0], ids.p[1]] });
      expect(r.status).toBe(422);
      expect(r.corpo.erro.campos.veiculoId).toBeDefined();
      const rot = (await get('g1', `/roteiros/${ids.rMesmoDia}`)).corpo.roteiro;
      expect((await put('g1', `/roteiros/${ids.rMesmoDia}`, { versao: rot.versao, veiculoId: null })).status).toBe(422);
    });
  });
});
