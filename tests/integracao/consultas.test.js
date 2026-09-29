// Etapas 9–10: histórico, dashboard e CSV com PostgreSQL real, cobrindo fronteiras de data,
// vários motoristas/roteiros, versões de parâmetros, dados incompletos, consistência entre as
// três saídas, persistência após reinício e o fluxo completo pela API.
// Requer TEST_DATABASE_URL "*_test" (o schema é recriado).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/server/app.js';
import { carregarConfig } from '../../src/server/config.js';
import { migrar } from '../../src/server/db/migrador.js';
import { criarPool } from '../../src/server/db/pool.js';
import { gerarHashSenha } from '../../src/server/shared/senha.js';

const URL_TESTE = process.env.TEST_DATABASE_URL;
if (URL_TESTE && !new URL(URL_TESTE).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL deve apontar para um banco "*_test".');
}

let instante = new Date('2026-01-01T12:00:00-03:00');
const as = (dia, hhmm) => {
  instante = new Date(`${dia}T${hhmm}:00-03:00`);
};

describe.skipIf(!URL_TESTE)('etapas 9–10: histórico, dashboard, CSV e fluxo completo', () => {
  let pool;
  let app;
  const c = {};
  const ids = {};

  async function construir() {
    app = await construirApp({ config: carregarConfig({ NODE_ENV: 'test' }), pool, agora: () => instante });
    await app.ready();
  }
  async function chamar(papel, method, url, payload) {
    const r = await app.inject({
      method, url: `/api/v1${url}`, headers: c[papel] ? { cookie: c[papel] } : {},
      ...(payload !== undefined ? { payload } : method === 'GET' ? {} : { payload: {} }),
    });
    const json = (r.headers['content-type'] ?? '').includes('json');
    return { status: r.statusCode, corpo: json ? r.json() : r.body, headers: r.headers };
  }
  const get = (p, u) => chamar(p, 'GET', u);
  const post = (p, u, b) => chamar(p, 'POST', u, b);
  const put = (p, u, b) => chamar(p, 'PUT', u, b);
  async function entrar(papel, login, senha) {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login, senha } });
    expect(r.statusCode).toBe(200);
    c[papel] = `rotaclara_sessao=${r.cookies.find((k) => k.name === 'rotaclara_sessao').value}`;
  }
  const reg = (id, ordem, tipo, dia, hora) => {
    as(dia, hora);
    return post(ids.dono[id] ?? 'm1', `/roteiros/${id}/pontos/${ordem}/${tipo}`);
  };
  async function montar(papel, corpo) {
    const r = await post(papel, '/roteiros', { chaveIdempotencia: randomUUID(), ...corpo });
    expect(r.status).toBe(201);
    return r.corpo.roteiro;
  }
  const q = (o) => new URLSearchParams(o).toString();

  beforeAll(async () => {
    pool = criarPool(URL_TESTE);
    await pool.query('drop schema public cascade');
    await pool.query('create schema public');
    await migrar(pool);
    await pool.query(
      `insert into usuario (nome, email, perfil, senha_hash) values ('Admin', 'admin@t.test', 'admin', $1)`,
      [await gerarHashSenha('senha-admin-1')],
    );
    await construir();
    await entrar('admin', 'admin@t.test', 'senha-admin-1');
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('fluxo completo — cadastros pela API (admin → gerentes → equipes → gerente → veículo, pontos, motoristas)', async () => {
    const g1 = await post('admin', '/gerentes', { nome: 'Gerente Um', email: 'g1@t.test', senha: 'senha-gerente' });
    const g2 = await post('admin', '/gerentes', { nome: 'Gerente Dois', email: 'g2@t.test', senha: 'senha-gerente' });
    ids.e1 = (await post('admin', '/equipes', { nome: 'Centro', gerenteId: g1.corpo.gerente.id })).corpo.equipe.id;
    ids.e2 = (await post('admin', '/equipes', { nome: 'Norte', gerenteId: g2.corpo.gerente.id })).corpo.equipe.id;
    await entrar('g1', 'g1@t.test', 'senha-gerente');
    await entrar('g2', 'g2@t.test', 'senha-gerente');
    ids.v = (await post('g1', '/veiculos', { placa: 'RCL1A26', rendimentoKmL: '12.00' })).corpo.veiculo.id;
    const criarPonto = async (nome, endereco) =>
      (await post('g1', '/pontos', { nome, endereco, latitude: '-19.9', longitude: '-43.9' })).corpo.ponto.id;
    ids.base = await criarPonto('Base', 'Av. Afonso Pena, 1000 — Centro');
    ids.a = await criarPonto('Padaria São João', 'Rua da Bahia, 1148; loja "A"');
    ids.b = await criarPonto('Cliente perigoso', '=HYPERLINK("http://x.test","clique")');
    ids.c = await criarPonto('Açougue', 'Rua Espírito Santo, 466');
    const m = async (papel, nome, documento, equipeId) =>
      (await post(papel, '/motoristas', { nome, documento, telefone: '31 90000-0000', equipeId, veiculoId: ids.v, senha: 'senha-motorista' })).corpo.motorista.id;
    ids.m1 = await m('g1', 'Maria', '111', ids.e1);
    ids.m2 = await m('g1', 'João', '222', ids.e1);
    ids.m3 = await m('g2', 'Nair', '333', ids.e2);
    await entrar('m1', '111', 'senha-motorista');
    await entrar('m2', '222', 'senha-motorista');
    await entrar('m3', '333', 'senha-motorista');
    ids.dono = {};
  });

  it('fluxo completo — parâmetros com vigência hoje, montagem, coleta, encerramento, cancelamento e correção', async () => {
    as('2026-01-01', '07:00');
    expect((await post('admin', '/parametros', { vigenteDesde: '2026-01-01', jornadaMin: 480, valorCombustivel: '6.000' })).status).toBe(201);

    // 31/01: dois roteiros de m1 (mesmo par motorista/data). Parada de A cruza para 01/02 em UTC.
    const A = await montar('g1', { motoristaId: ids.m1, data: '2026-01-31', distanciaKm: '100', pontoIds: [ids.base, ids.a] });
    const B = await montar('g1', { motoristaId: ids.m1, data: '2026-01-31', pontoIds: [ids.base, ids.b] }); // sem distância → sem custo
    Object.assign(ids, { A: A.id, B: B.id });
    await reg(A.id, 1, 'chegada', '2026-01-31', '23:00');
    await reg(A.id, 2, 'chegada', '2026-01-31', '23:30');
    await reg(A.id, 2, 'saida', '2026-01-31', '23:45');
    await reg(B.id, 1, 'chegada', '2026-01-31', '10:00');
    await reg(B.id, 2, 'chegada', '2026-01-31', '10:30');
    await reg(B.id, 2, 'saida', '2026-01-31', '10:40');
    for (const id of [A.id, B.id]) {
      const r = (await get('m1', `/roteiros/${id}`)).corpo.roteiro;
      expect((await post('m1', `/roteiros/${id}/encerrar`, { versao: r.versao })).status).toBe(200);
    }

    // 01/02: m2 em execução com parada incompleta; m3 (outra equipe) encerrado.
    const C = await montar('g1', { motoristaId: ids.m2, data: '2026-02-01', distanciaKm: '60', pontoIds: [ids.base, ids.c, ids.a] });
    ids.C = C.id;
    ids.dono[C.id] = 'm2';
    await reg(C.id, 1, 'chegada', '2026-02-01', '08:00');
    await reg(C.id, 2, 'chegada', '2026-02-01', '09:00');
    await reg(C.id, 2, 'saida', '2026-02-01', '09:50');
    await reg(C.id, 3, 'chegada', '2026-02-01', '10:30'); // sem saída: incompleto
    const D = await montar('g2', { motoristaId: ids.m3, data: '2026-02-01', distanciaKm: '24', pontoIds: [ids.base, ids.c] });
    ids.D = D.id;
    ids.dono[D.id] = 'm3';
    await reg(D.id, 1, 'chegada', '2026-02-01', '08:00');
    await reg(D.id, 2, 'chegada', '2026-02-01', '09:00');
    await reg(D.id, 2, 'saida', '2026-02-01', '09:30'); // 30 min, corrigido depois para 20
    const d = (await get('m3', `/roteiros/${D.id}`)).corpo.roteiro;
    await post('m3', `/roteiros/${D.id}/encerrar`, { versao: d.versao });
    const d2 = (await get('g2', `/roteiros/${D.id}`)).corpo.roteiro;
    const corr = await put('g2', `/roteiros/${D.id}/pontos/2`, {
      versao: d2.versao, chegada: '2026-02-01T12:00:00Z', saida: '2026-02-01T12:20:00Z', motivo: 'Ajuste de saída',
    });
    expect(corr.status).toBe(200);
    expect(corr.corpo.roteiro.totais.totalParadoSeg).toBe(1200);

    // 02/02: roteiro com parada registrada e depois cancelado → fora dos indicadores.
    const E = await montar('g1', { motoristaId: ids.m1, data: '2026-02-02', distanciaKm: '10', pontoIds: [ids.base, ids.a] });
    await reg(E.id, 1, 'chegada', '2026-02-02', '08:00');
    await reg(E.id, 2, 'chegada', '2026-02-02', '08:10');
    await reg(E.id, 2, 'saida', '2026-02-02', '09:10');
    const e = (await get('g1', `/roteiros/${E.id}`)).corpo.roteiro;
    expect((await post('g1', `/roteiros/${E.id}/cancelar`, { versao: e.versao })).status).toBe(200);

    // Nova versão a partir de 15/02 (jornada 420, R$ 7,000) — não mexe nos roteiros anteriores.
    as('2026-02-02', '12:00');
    expect((await post('admin', '/parametros', { vigenteDesde: '2026-02-15', jornadaMin: 420, valorCombustivel: '7.000' })).status).toBe(201);
    const F = await montar('g1', { motoristaId: ids.m1, data: '2026-02-15', distanciaKm: '120', pontoIds: [ids.base, ids.c] });
    ids.F = F.id;
    expect(F.custo).toMatchObject({ parametroVersao: 3, custoEstimado: '70.00' });
    await reg(F.id, 1, 'chegada', '2026-02-15', '08:00');
    await reg(F.id, 2, 'chegada', '2026-02-15', '09:00');
    await reg(F.id, 2, 'saida', '2026-02-15', '09:30');

    // Endereço do ponto muda depois: o histórico mantém o endereço da época (P03).
    await put('g1', `/pontos/${ids.a}`, { nome: 'Padaria', endereco: 'Endereço NOVO', latitude: '-19.9', longitude: '-43.9', ativo: true });
  });

  const periodo = { inicio: '2026-01-31', fim: '2026-02-15' };

  describe('dashboard', () => {
    it('recorte diário: fronteira de data pelo dia do roteiro, jornada uma vez por motorista/data, custo sem multiplicar', async () => {
      const r = await get('admin', `/dashboard?${q({ ...periodo, recorte: 'dia' })}`);
      expect(r.status).toBe(200);
      const [d31, d01, d15] = r.corpo.series;
      expect(r.corpo.series.map((s) => s.balde)).toEqual(['2026-01-31', '2026-02-01', '2026-02-15']); // 02/02 cancelado fora
      // 31/01: A (15 min, parada às 23:30 local = 02:30 UTC de 01/02) + B (10 min); um par → 480 min.
      expect(d31).toMatchObject({
        roteiros: 2, totalParadoSeg: 1500, paresMotoristaData: 1, jornadaMinTotal: 480, percentualJornada: '5.208',
        custo: { estimado: '50.00', roteirosComCusto: 1, roteirosSemCusto: 1, parcial: true }, parcial: false,
      });
      // 01/02: C em execução (50 min parcial) + D (20 min após correção); dois pares → 960 min.
      expect(d01).toMatchObject({
        roteiros: 2, roteirosIncompletos: 1, parcial: true, totalParadoSeg: 4200, paresMotoristaData: 2,
        jornadaMinTotal: 960, percentualJornada: '7.292', custo: { estimado: '42.00', parcial: false },
      });
      // 15/02: versão 3 preservada no roteiro (jornada 420, R$ 7,000).
      expect(d15).toMatchObject({ totalParadoSeg: 1800, jornadaMinTotal: 420, percentualJornada: '7.143', custo: { estimado: '70.00' } });
    });

    it('CT03: dia, mês e período usam os mesmos dados de origem', async () => {
      const [dia, mes, per] = await Promise.all(
        ['dia', 'mes', 'periodo'].map((recorte) => get('admin', `/dashboard?${q({ ...periodo, recorte })}`)),
      );
      const soma = (series, campo) => series.reduce((t, s) => t + s[campo], 0);
      for (const campo of ['roteiros', 'totalParadoSeg', 'paresMotoristaData', 'jornadaMinTotal']) {
        expect(soma(mes.corpo.series, campo)).toBe(soma(dia.corpo.series, campo));
        expect(per.corpo.series[0][campo]).toBe(soma(dia.corpo.series, campo));
      }
      expect(mes.corpo.series.map((s) => s.balde)).toEqual(['2026-01-01', '2026-02-01']);
      expect(mes.corpo.series[1]).toMatchObject({ totalParadoSeg: 6000, jornadaMinTotal: 1380, percentualJornada: '7.246' });
      expect(per.corpo.totais).toMatchObject({
        roteiros: 5, totalParadoSeg: 7500, paresMotoristaData: 4, jornadaMinTotal: 1860, percentualJornada: '6.720',
        custo: { estimado: '162.00', roteirosComCusto: 4, roteirosSemCusto: 1, parcial: true },
      });
      expect(per.corpo.series[0]).toEqual(per.corpo.totais);
    });

    it('maiores paradas apontam para a ocorrência de origem', async () => {
      const r = await get('admin', `/dashboard?${q({ ...periodo, recorte: 'periodo' })}`);
      expect(r.corpo.maioresParadas[0]).toMatchObject({ roteiroId: ids.C, ordem: 2, tempoParadoSeg: 3000, endereco: 'Rua Espírito Santo, 466' });
      expect(r.corpo.maioresParadas.every((o) => o.ordem > 1 && o.tempoParadoSeg !== null)).toBe(true);
    });

    it('sem dados: percentual e custo indisponíveis (não zero)', async () => {
      const r = await get('admin', `/dashboard?${q({ inicio: '2025-01-01', fim: '2025-01-31', recorte: 'dia' })}`);
      expect(r.corpo.series).toEqual([]);
      expect(r.corpo.totais).toMatchObject({ roteiros: 0, percentualJornada: null, custo: { estimado: null } });
    });

    it('D06: motorista vê só os próprios dados; gerente só as equipes', async () => {
      const m1 = await get('m1', `/dashboard?${q({ ...periodo, recorte: 'periodo' })}`);
      expect(m1.corpo.totais).toMatchObject({ roteiros: 3, totalParadoSeg: 3300, paresMotoristaData: 2 });
      const m1Outro = await get('m1', `/dashboard?${q({ ...periodo, recorte: 'periodo', motoristaId: ids.m2 })}`);
      expect(m1Outro.corpo.totais.roteiros).toBe(0);
      const g2 = await get('g2', `/dashboard?${q({ ...periodo, recorte: 'periodo' })}`);
      expect(g2.corpo.totais).toMatchObject({ roteiros: 1, totalParadoSeg: 1200 });
      const g1 = await get('g1', `/dashboard?${q({ ...periodo, recorte: 'periodo', equipeId: ids.e2 })}`);
      expect(g1.corpo.totais.roteiros).toBe(0);
    });

    it('valida o período (invertido, data inexistente) sem limite máximo de duração', async () => {
      expect((await get('admin', `/dashboard?${q({ inicio: '2026-02-02', fim: '2026-02-01' })}`)).status).toBe(400);
      expect((await get('admin', `/dashboard?${q({ inicio: '2026-02-30', fim: '2026-03-01' })}`)).status).toBe(400);
      // Períodos longos (5 anos) são aceitos e trazem os mesmos totais do período com dados.
      const longo = await get('admin', `/dashboard?${q({ inicio: '2022-01-01', fim: '2026-12-31', recorte: 'periodo' })}`);
      expect(longo.status).toBe(200);
      expect(longo.corpo.totais).toMatchObject({ roteiros: 5, totalParadoSeg: 7500 });
      const hist = await get('admin', `/historico?${q({ inicio: '2022-01-01', fim: '2026-12-31', tamanho: 100 })}`);
      expect(hist.corpo).toMatchObject({ total: 11, paginas: 1 });
    });
  });

  describe('histórico', () => {
    it('CT04: endereço histórico, data, chegada, saída e duração; paginação; cancelados fora', async () => {
      const r = await get('admin', `/historico?${q({ ...periodo, tamanho: 5, pagina: 1 })}`);
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ total: 11, paginas: 3, pagina: 1, tamanho: 5 });
      const todas = [];
      for (let pagina = 1; pagina <= 3; pagina += 1) {
        todas.push(...(await get('admin', `/historico?${q({ ...periodo, tamanho: 5, pagina })}`)).corpo.ocorrencias);
      }
      expect(todas).toHaveLength(11);
      const a2 = todas.find((o) => o.roteiroId === ids.A && o.ordem === 2);
      expect(a2).toMatchObject({
        data: '2026-01-31', endereco: 'Rua da Bahia, 1148; loja "A"', chegada: '2026-02-01T02:30:00.000Z',
        saida: '2026-02-01T02:45:00.000Z', tempoParadoSeg: 900, situacao: 'concluido', partida: false,
      });
      expect(todas.find((o) => o.roteiroId === ids.A && o.ordem === 1)).toMatchObject({ partida: true, tempoParadoSeg: 0 });
      expect(todas.find((o) => o.roteiroId === ids.C && o.ordem === 3)).toMatchObject({ tempoParadoSeg: null, situacao: 'em_andamento' });
      expect(todas.some((o) => o.endereco === 'Endereço NOVO')).toBe(false);
    });

    it('fronteira inclusiva: 01/02 a 01/02 traz só roteiros com data 01/02', async () => {
      const r = await get('admin', `/historico?${q({ inicio: '2026-02-01', fim: '2026-02-01' })}`);
      expect(new Set(r.corpo.ocorrencias.map((o) => o.data))).toEqual(new Set(['2026-02-01']));
      expect(r.corpo.total).toBe(5);
    });

    it('totais do histórico = totais do dashboard (mesmo cálculo)', async () => {
      const h = await get('g1', `/historico?${q(periodo)}`);
      const d = await get('g1', `/dashboard?${q({ ...periodo, recorte: 'periodo' })}`);
      expect(h.corpo.totais).toEqual(d.corpo.totais);
    });

    it('escopo: motorista só as próprias ocorrências; gerente registra consulta (RNF06)', async () => {
      const m1 = await get('m1', `/historico?${q(periodo)}`);
      expect(new Set(m1.corpo.ocorrencias.map((o) => o.roteiroId))).toEqual(new Set([ids.A, ids.B, ids.F]));
      expect((await get('g2', `/historico?${q(periodo)}`)).corpo.total).toBe(2);
      const { rows } = await pool.query(`select count(*) as n from registro_auditoria where acao = 'consulta_historico'`);
      expect(rows[0].n).toBeGreaterThan(0);
    });

    it('período vazio: lista vazia sem erro', async () => {
      const r = await get('admin', `/historico?${q({ inicio: '2025-06-01', fim: '2025-06-30' })}`);
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ total: 0, ocorrencias: [], paginas: 1 });
    });
  });

  describe('exportação CSV (UC12)', () => {
    it('motorista não exporta (403); período vazio informa que não há conteúdo', async () => {
      expect((await get('m1', `/relatorios/historico.csv?${q(periodo)}`)).status).toBe(403);
      const vazio = await get('g1', `/relatorios/historico.csv?${q({ inicio: '2025-06-01', fim: '2025-06-30' })}`);
      expect(vazio.status).toBe(422);
      expect(vazio.corpo.erro.codigo).toBe('SEM_DADOS');
    });

    it('arquivo completo (não só a página), UTF-8 com BOM, escapado, com fórmulas neutralizadas e totais iguais', async () => {
      const r = await get('admin', `/relatorios/historico.csv?${q(periodo)}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
      expect(r.headers['content-disposition']).toContain('rotaclara-historico-2026-01-31-a-2026-02-15.csv');
      const texto = r.corpo;
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      const linhas = texto.slice(1).split('\r\n');
      const inicioDados = linhas.findIndex((l) => l.startsWith('Data do roteiro;')) + 1;
      const fimDados = linhas.indexOf('', inicioDados);
      expect(fimDados - inicioDados).toBe(11); // todas as ocorrências, sem paginação
      expect(texto).toContain('"Rua da Bahia, 1148; loja ""A"""');
      expect(texto).toContain(`"'=HYPERLINK(""http://x.test"",""clique"")"`);
      expect(texto).not.toMatch(/;=HYPERLINK/);
      expect(texto).toContain('Rua Espírito Santo, 466');
      expect(texto).toContain('31/01/2026;');
      expect(texto).toContain('31/01/2026 23:30:00'); // horário no fuso operacional
      expect(texto).not.toContain('90000-0000'); // sem telefone
      expect(texto).not.toMatch(/;111;|;222;/); // sem documento
      expect(texto).toContain('Tempo parado total (s);7500');
      expect(texto).toContain('Percentual da jornada (%);6,720');
      expect(texto).toContain('Custo estimado (R$);162,00');
      expect(texto).toContain('Roteiros sem custo disponível;1');
      const { rows } = await pool.query(`select valor_novo from registro_auditoria where acao = 'exportar_csv' order by id desc limit 1`);
      expect(rows[0].valor_novo).toMatchObject({ inicio: '2026-01-31', fim: '2026-02-15', linhas: 11 });
    });

    it('gerente exporta só o próprio escopo', async () => {
      const r = await get('g2', `/relatorios/historico.csv?${q(periodo)}`);
      expect(r.corpo).toContain('Nair');
      expect(r.corpo).not.toContain('Maria');
    });
  });

  describe('auditoria (RNF05, RN09, CT08)', () => {
    it('admin consulta a correção do roteiro com usuário, data, antes e depois; gerente recebe 403', async () => {
      const r = await get('admin', `/auditoria?${q({ entidade: 'roteiro', entidadeId: String(ids.D) })}`);
      expect(r.status).toBe(200);
      const corr = r.corpo.registros.find((a) => a.acao === 'corrigir');
      expect(corr).toMatchObject({
        entidade: 'roteiro_ponto', entidadeId: `${ids.D}/2`, usuario: 'Gerente Dois',
        anterior: { tempoParadoSeg: 1800, totalParadoSeg: 1800 },
        novo: { tempoParadoSeg: 1200, totalParadoSeg: 1200, motivo: 'Ajuste de saída' },
      });
      expect(corr.ocorridoEm).toBeTruthy();
      expect(r.corpo.registros.map((a) => a.acao)).toEqual(expect.arrayContaining(['montar', 'registrar_chegada', 'encerrar']));
      expect((await get('g1', '/auditoria')).status).toBe(403);
      expect((await get('m1', '/auditoria')).status).toBe(403);
      const exp = await get('admin', `/auditoria?${q({ entidade: 'relatorio' })}`);
      expect(exp.corpo.registros[0].acao).toBe('exportar_csv');
    });
  });

  describe('persistência após reinício', () => {
    it('um novo processo (nova instância e novo pool) lê os mesmos dados e sessões', async () => {
      const antes = (await get('admin', `/roteiros/${ids.D}`)).corpo.roteiro;
      await app.close();
      await pool.end();
      pool = criarPool(URL_TESTE);
      await construir();
      const depois = await get('admin', `/roteiros/${ids.D}`); // mesma sessão (gravada no banco)
      expect(depois.status).toBe(200);
      expect(depois.corpo.roteiro).toEqual(antes);
    });
  });
});
