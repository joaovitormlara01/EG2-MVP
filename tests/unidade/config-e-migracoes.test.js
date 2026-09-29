import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { carregarConfig } from '../../src/server/config.js';
import { listarMigracoes } from '../../src/server/db/migrador.js';

describe('configuração', () => {
  it('usa padrões seguros', () => {
    const config = carregarConfig({});
    expect(config).toMatchObject({
      ambiente: 'development',
      porta: 3000,
      sessaoDuracaoMin: 720,
      cookieSeguro: false,
      fusoHorario: 'America/Sao_Paulo',
    });
  });

  it('ativa cookie Secure em produção por padrão', () => {
    expect(carregarConfig({ NODE_ENV: 'production' }).cookieSeguro).toBe(true);
  });

  it('rejeita valores inválidos', () => {
    expect(() => carregarConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => carregarConfig({ NODE_ENV: 'homolog' })).toThrow(/NODE_ENV/);
    expect(() => carregarConfig({ COOKIE_SECURE: 'sim' })).toThrow(/COOKIE_SECURE/);
  });
});

describe('arquivos de migração', () => {
  let pasta;
  afterEach(async () => pasta && rm(pasta, { recursive: true, force: true }));

  it('as migrações do projeto seguem o padrão e estão em ordem', async () => {
    const migracoes = await listarMigracoes();
    expect(migracoes.length).toBeGreaterThanOrEqual(2);
    expect(migracoes.map((m) => m.versao)).toEqual(
      migracoes.map((_, i) => String(i + 1).padStart(4, '0')),
    );
    for (const m of migracoes) expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejeita nome fora do padrão e versão repetida', async () => {
    pasta = await mkdtemp(path.join(tmpdir(), 'rotaclara-mig-'));
    await writeFile(path.join(pasta, 'criar.sql'), 'select 1;');
    await expect(listarMigracoes(pasta)).rejects.toThrow(/Nome de migração inválido/);

    await rm(path.join(pasta, 'criar.sql'));
    await writeFile(path.join(pasta, '0001_a.sql'), 'select 1;');
    await writeFile(path.join(pasta, '0001_b.sql'), 'select 2;');
    await expect(listarMigracoes(pasta)).rejects.toThrow(/repetida/);
  });
});
