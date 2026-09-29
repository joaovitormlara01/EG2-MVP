// Rotas HTTP com repositório em memória (sem PostgreSQL): login, sessão, autorização
// no servidor, proteção CSRF e arquivos estáticos na mesma origem.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/server/app.js';
import { carregarConfig } from '../../src/server/config.js';
import { criarRepositorioAuthMemoria } from '../apoio/repositorio-auth-memoria.js';

const USUARIOS = [
  { id: 1, nome: 'Ana Admin', email: 'admin@rotaclara.test', perfil: 'admin', senha: 'admin-senha-1' },
  { id: 2, nome: 'Gil Gerente', email: 'gerente@rotaclara.test', perfil: 'gerente', senha: 'gerente-senha', equipeIds: [10] },
  { id: 3, nome: 'Mia Motorista', documento: '12345678900', perfil: 'motorista', senha: 'motorista-senha', equipeIds: [10] },
  { id: 4, nome: 'Ivo Inativo', email: 'inativo@rotaclara.test', perfil: 'gerente', senha: 'inativo-senha', ativo: false },
];

// Rotas de exemplo protegidas pela política, só para exercitar o mecanismo nos testes.
async function rotasDeTeste(api) {
  api.put('/teste/parametros', { config: { acao: 'parametros.alterar' } }, async () => ({ ok: true }));
  api.get('/teste/auditoria', { config: { acao: 'auditoria.consultar' } }, async () => ({ ok: true }));
}

const poolOk = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
const poolFora = {
  query: async () => {
    throw new Error('ECONNREFUSED');
  },
};

let app;
let repositorio;

async function montar(pool = poolOk) {
  repositorio = await criarRepositorioAuthMemoria(USUARIOS);
  app = await construirApp({
    config: carregarConfig({ NODE_ENV: 'test' }),
    pool,
    repositorios: { auth: repositorio },
    rotasAdicionais: rotasDeTeste,
  });
  await app.ready();
}

function cookieDe(resposta) {
  const c = resposta.cookies.find((k) => k.name === 'rotaclara_sessao');
  return c ? `rotaclara_sessao=${c.value}` : undefined;
}

async function entrar(login, senha) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login, senha } });
}

beforeEach(() => montar());
afterEach(() => app?.close());

describe('health check', () => {
  it('responde 200 com banco disponível, sem autenticação', async () => {
    const r = await app.inject('/api/v1/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('responde 503 quando o banco está fora', async () => {
    await app.close();
    await montar(poolFora);
    const r = await app.inject('/api/v1/health');
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ status: 'degradado', banco: 'indisponivel' });
  });
});

describe('login (UC01)', () => {
  it('autentica por e-mail e grava cookie HttpOnly, SameSite=Lax', async () => {
    const r = await entrar('ADMIN@rotaclara.test', 'admin-senha-1');
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toMatchObject({ id: 1, nome: 'Ana Admin', perfil: 'admin' });
    const cookie = r.cookies.find((c) => c.name === 'rotaclara_sessao');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie.value).toMatch(/^[\w-]{43}$/);
    expect(r.body).not.toContain(cookie.value);
    expect(repositorio.auditoria).toContainEqual({ usuarioId: 1, acao: 'login' });
  });

  it('autentica motorista pelo documento', async () => {
    const r = await entrar('12345678900', 'motorista-senha');
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.perfil).toBe('motorista');
  });

  it('não revela qual dado está incorreto', async () => {
    const senhaErrada = await entrar('admin@rotaclara.test', 'errada-123');
    const usuarioInexistente = await entrar('ninguem@rotaclara.test', 'errada-123');
    for (const r of [senhaErrada, usuarioInexistente]) {
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({
        erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Usuário ou senha inválidos.' },
      });
      expect(cookieDe(r)).toBeUndefined();
    }
    expect(repositorio.auditoria).toContainEqual({ usuarioId: 1, acao: 'login_negado_credencial' });
  });

  it('nega usuário inativo e orienta procurar o administrador', async () => {
    const r = await entrar('inativo@rotaclara.test', 'inativo-senha');
    expect(r.statusCode).toBe(403);
    expect(r.json().erro.codigo).toBe('USUARIO_INATIVO');
    expect(r.json().erro.mensagem).toMatch(/administrador/);
  });

  it('valida o corpo e rejeita campos extras', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'a', senha: 'b', perfil: 'admin' },
    });
    expect(r.statusCode).toBe(400);
    const faltando = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    expect(faltando.json().erro).toMatchObject({
      codigo: 'VALIDACAO',
      campos: { login: 'Campo obrigatório.' },
    });
  });

  it('limita tentativas de login (10 por minuto)', async () => {
    let ultima;
    for (let i = 0; i < 11; i += 1) ultima = await entrar('ninguem@rotaclara.test', 'x');
    expect(ultima.statusCode).toBe(429);
    expect(ultima.json().erro.codigo).toBe('MUITAS_TENTATIVAS');
  });
});

describe('sessão', () => {
  it('GET /auth/me exige sessão', async () => {
    const r = await app.inject('/api/v1/auth/me');
    expect(r.statusCode).toBe(401);
    expect(r.json().erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('GET /auth/me devolve o usuário e as funções do perfil', async () => {
    const cookie = cookieDe(await entrar('gerente@rotaclara.test', 'gerente-senha'));
    const r = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
    expect(r.statusCode).toBe(200);
    const { usuario } = r.json();
    expect(usuario).toMatchObject({ id: 2, perfil: 'gerente' });
    const ids = usuario.funcoes.map((f) => f.id);
    expect(ids).toEqual(['roteiros', 'historico', 'dashboard', 'motoristas', 'veiculos', 'pontos']);
    expect(usuario.funcoes[0].pagina).toBe('/roteiros.html');
    expect(usuario).not.toHaveProperty('senhaHash');
  });

  it('motorista vê só os próprios roteiros', async () => {
    const cookie = cookieDe(await entrar('12345678900', 'motorista-senha'));
    const r = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
    expect(r.json().usuario.funcoes.map((f) => f.id)).toEqual(['roteiros', 'historico', 'dashboard']);
  });

  it('logout revoga a sessão no servidor', async () => {
    const cookie = cookieDe(await entrar('admin@rotaclara.test', 'admin-senha-1'));
    const saida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie },
      payload: {},
    });
    expect(saida.statusCode).toBe(204);
    const r = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
    expect(r.statusCode).toBe(401);
  });

  it('token forjado não autentica', async () => {
    const r = await app.inject({
      url: '/api/v1/auth/me',
      headers: { cookie: 'rotaclara_sessao=forjado' },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('autorização no servidor', () => {
  it('motorista não altera parâmetros (CT10: 403)', async () => {
    const cookie = cookieDe(await entrar('12345678900', 'motorista-senha'));
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/teste/parametros',
      headers: { cookie },
      payload: {},
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro.codigo).toBe('PROIBIDO');
  });

  it('gerente não altera parâmetros nem vê auditoria; admin pode', async () => {
    const gerente = cookieDe(await entrar('gerente@rotaclara.test', 'gerente-senha'));
    const admin = cookieDe(await entrar('admin@rotaclara.test', 'admin-senha-1'));
    const put = (cookie) =>
      app.inject({ method: 'PUT', url: '/api/v1/teste/parametros', headers: { cookie }, payload: {} });
    expect((await put(gerente)).statusCode).toBe(403);
    expect((await put(admin)).statusCode).toBe(200);
    const aud = (cookie) => app.inject({ url: '/api/v1/teste/auditoria', headers: { cookie } });
    expect((await aud(gerente)).statusCode).toBe(403);
    expect((await aud(admin)).statusCode).toBe(200);
  });

  it('RN05: roteiro sem motorista ou sem data é rejeitado na validação (400)', async () => {
    const cookie = cookieDe(await entrar('gerente@rotaclara.test', 'gerente-senha'));
    for (const corpo of [{ data: '2026-10-01', pontoIds: [1, 2] }, { motoristaId: 3, pontoIds: [1, 2] }]) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/roteiros', headers: { cookie }, payload: corpo });
      expect(r.statusCode).toBe(400);
      expect(r.json().erro.codigo).toBe('VALIDACAO');
    }
  });

  it('exportação CSV exige perfil gerente/admin antes de consultar dados (403)', async () => {
    const cookie = cookieDe(await entrar('12345678900', 'motorista-senha'));
    const r = await app.inject({ url: '/api/v1/relatorios/historico.csv?inicio=2026-01-01&fim=2026-01-31', headers: { cookie } });
    expect(r.statusCode).toBe(403);
  });

  it('rota protegida sem sessão devolve 401 antes de avaliar permissão', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/v1/teste/parametros', payload: {} });
    expect(r.statusCode).toBe(401);
  });

  it('rota inexistente na API devolve 404 em JSON', async () => {
    const r = await app.inject('/api/v1/nao-existe');
    expect(r.statusCode).toBe(404);
    expect(r.json().erro.codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('proteção CSRF', () => {
  const login = { login: 'admin@rotaclara.test', senha: 'admin-senha-1' };

  it('rejeita mutação com Origin de outro site, "null" ou Sec-Fetch-Site cross-site', async () => {
    const cookie = cookieDe(await entrar('admin@rotaclara.test', 'admin-senha-1'));
    const casos = [
      { origin: 'https://atacante.exemplo' },
      { origin: 'null' },
      { origin: 'http://localhost:80.atacante.exemplo' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
    ];
    for (const extra of casos) {
      const r = await app.inject({
        method: 'PUT', url: '/api/v1/teste/parametros', headers: { cookie, ...extra }, payload: {},
      });
      expect(r.statusCode, JSON.stringify(extra)).toBe(403);
      expect(r.json().erro.codigo).toBe('ORIGEM_INVALIDA');
    }
    const login403 = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://atacante.exemplo' }, payload: login,
    });
    expect(login403.statusCode).toBe(403);
    expect(cookieDe(login403)).toBeUndefined();
  });

  it('aceita mutação da própria origem', async () => {
    const r = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:80', 'sec-fetch-site': 'same-origin' }, payload: login,
    });
    expect(r.statusCode).toBe(200);
  });

  it('não responde CORS (preflight de outra origem não é autorizado)', async () => {
    const r = await app.inject({
      method: 'OPTIONS', url: '/api/v1/auth/login',
      headers: { origin: 'https://atacante.exemplo', 'access-control-request-method': 'POST' },
    });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('GET não aceita alteração: rotas de escrita não respondem a GET', async () => {
    const cookie = cookieDe(await entrar('admin@rotaclara.test', 'admin-senha-1'));
    for (const url of ['/api/v1/auth/logout', '/api/v1/roteiros/1/encerrar', '/api/v1/roteiros/1/pontos/1/chegada']) {
      const r = await app.inject({ url, headers: { cookie } });
      expect(r.statusCode, url).toBe(404);
    }
  });

  it('rejeita corpo text/plain ou formulário em requisições que alteram estado', async () => {
    for (const tipo of ['text/plain', 'application/x-www-form-urlencoded']) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': tipo },
        payload: 'login=admin@rotaclara.test&senha=admin-senha-1',
      });
      expect(r.statusCode).toBe(415);
      expect(cookieDe(r)).toBeUndefined();
    }
  });
});

describe('frontend na mesma origem', () => {
  it('serve HTML, CSS, módulos JS e Chart.js com CSP restritiva', async () => {
    const pagina = await app.inject('/');
    expect(pagina.statusCode).toBe(200);
    expect(pagina.headers['content-type']).toMatch(/text\/html/);
    expect(pagina.body).toContain('lang="pt-BR"');
    expect(pagina.headers['content-security-policy']).toContain("script-src 'self'");

    for (const caminho of ['/css/base.css', '/js/api.js', '/js/paginas/login.js']) {
      expect((await app.inject(caminho)).statusCode).toBe(200);
    }
    const chart = await app.inject('/vendor/chart.js/chart.umd.min.js');
    expect(chart.statusCode).toBe(200);
    expect(chart.headers['content-type']).toMatch(/javascript/);
  });

  it('não expõe outros arquivos de node_modules nem do servidor', async () => {
    expect((await app.inject('/vendor/chart.js/chart.cjs')).statusCode).toBe(404);
    expect((await app.inject('/src/server/config.js')).statusCode).toBe(404);
    expect((await app.inject('/.env')).statusCode).toBe(404);
    expect((await app.inject('/../package.json')).statusCode).toBe(404);
  });

  it('página inexistente devolve 404 em HTML', async () => {
    const r = await app.inject('/nao-existe.html');
    expect(r.statusCode).toBe(404);
    expect(r.body).toContain('Página não encontrada');
  });
});
