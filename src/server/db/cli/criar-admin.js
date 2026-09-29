// npm run db:criar-admin — cria o primeiro administrador.
// Lê ADMIN_NOME, ADMIN_EMAIL e ADMIN_SENHA do ambiente; o que faltar é perguntado no terminal.
// A senha nunca é gravada em arquivo nem em migração.

import { createInterface } from 'node:readline/promises';
import { carregarConfig } from '../../config.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { gerarHashSenha, validarNovaSenha } from '../../shared/senha.js';
import { criarPool, emTransacao } from '../pool.js';

async function perguntar(texto, { oculto = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (oculto) {
    // Não ecoa os caracteres digitados.
    rl._writeToOutput = (s) => {
      if (s.startsWith(texto)) process.stdout.write(texto);
    };
  }
  const resposta = await rl.question(texto);
  rl.close();
  if (oculto) process.stdout.write('\n');
  return resposta.trim();
}

const config = carregarConfig();
const nome = process.env.ADMIN_NOME || (await perguntar('Nome do administrador: '));
const email = (process.env.ADMIN_EMAIL || (await perguntar('E-mail: '))).toLowerCase();
const senha = process.env.ADMIN_SENHA || (await perguntar('Senha (mín. 8 caracteres): ', { oculto: true }));

const problema = !nome
  ? 'Nome obrigatório.'
  : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ? 'E-mail inválido.'
    : validarNovaSenha(senha);

if (problema) {
  console.error(problema);
  process.exit(1);
}

const pool = criarPool(config.databaseUrl);
try {
  const senhaHash = await gerarHashSenha(senha);
  const id = await emTransacao(pool, async (cliente) => {
    const existente = await cliente.query('select 1 from usuario where lower(email) = $1', [email]);
    if (existente.rowCount) throw new Error('Já existe usuário com este e-mail.');
    const { rows } = await cliente.query(
      `insert into usuario (nome, email, perfil, senha_hash) values ($1, $2, 'admin', $3)
       returning id`,
      [nome, email, senhaHash],
    );
    await registrarAuditoria(cliente, {
      entidade: 'usuario',
      entidadeId: rows[0].id,
      acao: 'criar_admin_cli',
      novo: { nome, email, perfil: 'admin' },
    });
    return rows[0].id;
  });
  console.log(`Administrador criado (id ${id}).`);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
