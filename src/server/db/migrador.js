// Migrações SQL versionadas, somente para frente. Nunca apaga ou recria o banco.
// Cada arquivo migrations/NNNN_descricao.sql roda em transação própria e é registrado em
// schema_migrations com seu checksum; alterar um arquivo já aplicado é erro.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASTA_MIGRACOES = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const PADRAO_ARQUIVO = /^(\d{4})_[a-z0-9_]+\.sql$/;
// Chave arbitrária para pg_advisory_lock: evita duas execuções simultâneas.
const CHAVE_BLOQUEIO = 7_242_019;

export async function listarMigracoes(pasta = PASTA_MIGRACOES) {
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort();
  const migracoes = [];
  for (const nome of arquivos) {
    if (!PADRAO_ARQUIVO.test(nome)) {
      throw new Error(`Nome de migração inválido: ${nome} (use NNNN_descricao.sql).`);
    }
    const sql = await readFile(path.join(pasta, nome), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    migracoes.push({ versao: nome.slice(0, 4), nome, sql, checksum });
  }
  const versoes = migracoes.map((m) => m.versao);
  const repetida = versoes.find((v, i) => versoes.indexOf(v) !== i);
  if (repetida) throw new Error(`Versão de migração repetida: ${repetida}.`);
  return migracoes;
}

export async function migrar(pool, { pasta = PASTA_MIGRACOES, log = () => {} } = {}) {
  const migracoes = await listarMigracoes(pasta);
  const cliente = await pool.connect();
  const aplicadasAgora = [];
  try {
    await cliente.query('select pg_advisory_lock($1)', [CHAVE_BLOQUEIO]);
    await cliente.query(`
      create table if not exists schema_migrations (
        versao     text primary key,
        nome       text not null,
        checksum   text not null,
        aplicada_em timestamptz not null default now()
      )`);
    const { rows } = await cliente.query('select versao, nome, checksum from schema_migrations');
    const jaAplicadas = new Map(rows.map((r) => [r.versao, r]));

    for (const registro of rows) {
      if (!migracoes.some((m) => m.versao === registro.versao)) {
        throw new Error(`Migração ${registro.nome} está aplicada no banco mas não existe na pasta.`);
      }
    }

    for (const migracao of migracoes) {
      const aplicada = jaAplicadas.get(migracao.versao);
      if (aplicada) {
        if (aplicada.checksum !== migracao.checksum) {
          throw new Error(
            `Migração ${migracao.nome} foi alterada depois de aplicada. ` +
              'Crie uma nova migração em vez de editar uma existente.',
          );
        }
        continue;
      }
      log(`Aplicando ${migracao.nome}...`);
      try {
        await cliente.query('begin');
        await cliente.query(migracao.sql);
        await cliente.query(
          'insert into schema_migrations (versao, nome, checksum) values ($1, $2, $3)',
          [migracao.versao, migracao.nome, migracao.checksum],
        );
        await cliente.query('commit');
      } catch (erro) {
        await cliente.query('rollback').catch(() => {});
        erro.message = `Falha na migração ${migracao.nome}: ${erro.message}`;
        throw erro;
      }
      aplicadasAgora.push(migracao.nome);
    }
    return { aplicadas: aplicadasAgora, total: migracoes.length };
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [CHAVE_BLOQUEIO]).catch(() => {});
    cliente.release();
  }
}
