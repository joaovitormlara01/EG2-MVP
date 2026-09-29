// Integração com PostgreSQL real. Requer TEST_DATABASE_URL apontando para um banco cujo
// nome termine em "_test": o schema public desse banco é APAGADO e recriado.
// Sem a variável, os testes são pulados (e isso aparece no relatório do Vitest).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../src/server/app.js';
import { carregarConfig } from '../../src/server/config.js';
import { migrar } from '../../src/server/db/migrador.js';
import { criarPool, emTransacao } from '../../src/server/db/pool.js';
import { gerarHashSenha } from '../../src/server/shared/senha.js';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const nomeBanco = URL_TESTE ? new URL(URL_TESTE).pathname.slice(1) : '';
if (URL_TESTE && !nomeBanco.endsWith('_test')) {
  throw new Error(`TEST_DATABASE_URL deve apontar para um banco "*_test" (recebido: ${nomeBanco}).`);
}

describe.skipIf(!URL_TESTE)('PostgreSQL: migrações, restrições e autenticação', () => {
  let pool;
  const ids = {};

  beforeAll(async () => {
    pool = criarPool(URL_TESTE);
    await pool.query('drop schema public cascade');
    await pool.query('create schema public');
    await migrar(pool);

    const hash = await gerarHashSenha('senha-de-teste');
    const inserir = async (sql, params) => (await pool.query(sql, params)).rows[0].id;
    ids.admin = await inserir(
      `insert into usuario (nome, email, perfil, senha_hash) values ('Admin', 'admin@t.test', 'admin', $1) returning id`,
      [hash],
    );
    ids.gerente = await inserir(
      `insert into usuario (nome, email, perfil, senha_hash) values ('Gerente', 'ger@t.test', 'gerente', $1) returning id`,
      [hash],
    );
    ids.equipe = await inserir(
      `insert into equipe (nome, gerente_id) values ('Equipe Centro', $1) returning id`,
      [ids.gerente],
    );
    ids.motorista = await inserir(
      `insert into usuario (nome, perfil, senha_hash) values ('Motorista', 'motorista', $1) returning id`,
      [hash],
    );
    await pool.query(
      `insert into motorista (usuario_id, documento, equipe_id) values ($1, '11122233344', $2)`,
      [ids.motorista, ids.equipe],
    );
    ids.pontoA = await inserir(`insert into ponto (endereco, latitude, longitude) values ('Rua A, 1', -19.9, -43.9) returning id`);
    ids.pontoB = await inserir(`insert into ponto (endereco, latitude, longitude) values ('Rua B, 2', -19.8, -43.8) returning id`);
    ids.veiculo = await inserir(`insert into veiculo (placa, rendimento_km_l) values ('TST1A23', 12) returning id`);
  });

  afterAll(async () => pool?.end());

  async function criarRoteiro(cliente, ordens) {
    const { rows } = await cliente.query(
      `insert into roteiro (motorista_id, equipe_id, data, parametro_id, criado_por, veiculo_id)
       values ($1, $2, '2026-09-28', (select id from parametro_sistema where versao = 1), $3, $4)
       returning id`,
      [ids.motorista, ids.equipe, ids.gerente, ids.veiculo],
    );
    for (const ordem of ordens) {
      await cliente.query(
        `insert into roteiro_ponto (roteiro_id, ponto_id, ordem, endereco)
         values ($1, $2, $3, 'cópia')`,
        [rows[0].id, ordem % 2 ? ids.pontoA : ids.pontoB, ordem],
      );
    }
    return rows[0].id;
  }

  describe('migrações', () => {
    it('reaplicar não altera nada (idempotente, somente para frente)', async () => {
      const { aplicadas, total } = await migrar(pool);
      expect(aplicadas).toEqual([]);
      const { rows } = await pool.query('select count(*) as n from schema_migrations');
      expect(rows[0].n).toBe(total);
    });

    it('cria a jornada inicial de 480 minutos (RN04)', async () => {
      const { rows } = await pool.query('select versao, jornada_min, valor_combustivel from parametro_sistema');
      expect(rows).toEqual([{ versao: 1, jornada_min: 480, valor_combustivel: null }]);
    });
  });

  describe('restrições no banco', () => {
    it('roteiro com ordens 1..n contínuas e ≥ 2 pontos é aceito (RN06, D19)', async () => {
      await expect(emTransacao(pool, (c) => criarRoteiro(c, [1, 2, 3]))).resolves.toBeTypeOf('number');
    });

    it('rejeita roteiro com 1 ponto, lacuna na ordem ou ordem repetida', async () => {
      await expect(emTransacao(pool, (c) => criarRoteiro(c, [1]))).rejects.toThrow(/pelo menos 2/);
      await expect(emTransacao(pool, (c) => criarRoteiro(c, [1, 3]))).rejects.toThrow(/contínuas/);
      await expect(emTransacao(pool, (c) => criarRoteiro(c, [1, 2, 2]))).rejects.toThrow(
        /roteiro_ponto_ordem_unica|contínuas/,
      );
    });

    it('permite reordenar vários pontos na mesma transação (unicidade verificada no commit)', async () => {
      const id = await emTransacao(pool, (c) => criarRoteiro(c, [1, 2, 3]));
      await emTransacao(pool, async (c) => {
        await c.query('update roteiro_ponto set ordem = 4 - ordem where roteiro_id = $1', [id]);
      });
      const { rows } = await pool.query('select ordem from roteiro_ponto where roteiro_id = $1 order by ordem', [id]);
      expect(rows.map((r) => r.ordem)).toEqual([1, 2, 3]);
    });

    it('rejeita saída anterior à chegada (RN08 / CT07) e tempo na partida (RN01)', async () => {
      const id = await emTransacao(pool, (c) => criarRoteiro(c, [1, 2]));
      await expect(
        pool.query(
          `update roteiro_ponto set chegada = '2026-09-28 09:15-03', saida = '2026-09-28 09:00-03'
            where roteiro_id = $1 and ordem = 2`,
          [id],
        ),
      ).rejects.toThrow(/roteiro_ponto_saida_apos_chegada/);
      await expect(
        pool.query('update roteiro_ponto set tempo_parado_seg = 60 where roteiro_id = $1 and ordem = 1', [id]),
      ).rejects.toThrow(/roteiro_ponto_partida_sem_tempo/);
    });

    it('D04/D05: ponto sem coordenadas e roteiro sem veículo são recusados pelo banco', async () => {
      await expect(pool.query(`insert into ponto (endereco) values ('Sem coordenadas')`)).rejects.toThrow(/ponto_coordenadas_obrigatorias/);
      await expect(
        pool.query(
          `insert into roteiro (motorista_id, equipe_id, data, parametro_id, criado_por) values ($1, $2, '2026-09-28', 1, $3)`,
          [ids.motorista, ids.equipe, ids.gerente],
        ),
      ).rejects.toThrow(/roteiro_veiculo_obrigatorio/);
    });

    it('valida faixa de coordenadas e rendimento positivo', async () => {
      await expect(
        pool.query(`insert into ponto (endereco, latitude, longitude) values ('X', 91, 0)`),
      ).rejects.toThrow(/ponto_latitude_faixa/);
      await expect(
        pool.query(`insert into veiculo (placa, rendimento_km_l) values ('ABC1D23', 0)`),
      ).rejects.toThrow(/veiculo_rendimento_positivo/);
    });

    it('e-mail e documento são únicos', async () => {
      await expect(
        pool.query(
          `insert into usuario (nome, email, perfil, senha_hash) values ('Outro', 'ADMIN@t.test', 'gerente', 'x')`,
        ),
      ).rejects.toThrow(/usuario_email_unico/);
    });

    it('auditoria é imutável (RNF05)', async () => {
      await pool.query(
        `insert into registro_auditoria (usuario_id, entidade, entidade_id, acao) values ($1, 'teste', '1', 'criar')`,
        [ids.admin],
      );
      await expect(pool.query(`update registro_auditoria set acao = 'x'`)).rejects.toThrow(/imutável/);
      await expect(pool.query('delete from registro_auditoria')).rejects.toThrow(/imutável/);
      await expect(pool.query('truncate registro_auditoria')).rejects.toThrow(/imutável/);
    });
  });

  describe('autenticação com o repositório SQL', () => {
    let app;
    beforeAll(async () => {
      app = await construirApp({ config: carregarConfig({ NODE_ENV: 'test' }), pool });
      await app.ready();
    });
    afterAll(async () => app?.close());

    it('login do gerente cria sessão (só o hash do token é gravado) e /me traz a equipe', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { login: 'ger@t.test', senha: 'senha-de-teste' },
      });
      expect(r.statusCode).toBe(200);
      const token = r.cookies.find((c) => c.name === 'rotaclara_sessao').value;

      const { rows } = await pool.query('select token_hash from sessao where usuario_id = $1', [ids.gerente]);
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash.toString('base64url')).not.toBe(token);

      const me = await app.inject({
        url: '/api/v1/auth/me',
        headers: { cookie: `rotaclara_sessao=${token}` },
      });
      expect(me.json().usuario).toMatchObject({ id: ids.gerente, perfil: 'gerente' });

      const auditoria = await pool.query(
        `select acao from registro_auditoria where usuario_id = $1 and entidade = 'sessao'`,
        [ids.gerente],
      );
      expect(auditoria.rows.map((l) => l.acao)).toContain('login');
    });

    it('motorista entra pelo documento', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { login: '11122233344', senha: 'senha-de-teste' },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().usuario.perfil).toBe('motorista');
    });

    it('inativar o usuário invalida as sessões abertas', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { login: 'admin@t.test', senha: 'senha-de-teste' },
      });
      const cookie = `rotaclara_sessao=${r.cookies.find((c) => c.name === 'rotaclara_sessao').value}`;
      await pool.query('update usuario set ativo = false where id = $1', [ids.admin]);
      const me = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
      expect(me.statusCode).toBe(401);
      await pool.query('update usuario set ativo = true where id = $1', [ids.admin]);
    });

    it('health check consulta o banco', async () => {
      const r = await app.inject('/api/v1/health');
      expect(r.json()).toEqual({ status: 'ok', banco: 'ok' });
    });
  });
});
