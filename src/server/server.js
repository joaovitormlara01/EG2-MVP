// npm start — inicia API + frontend em um único processo.

import { construirApp } from './app.js';
import { carregarConfig } from './config.js';
import { criarPool } from './db/pool.js';

const config = carregarConfig();
const pool = criarPool(config.databaseUrl);
const app = await construirApp({ config, pool });

async function encerrar(sinal) {
  app.log.info(`Recebido ${sinal}; encerrando.`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);

try {
  await app.listen({ host: config.host, port: config.porta });
} catch (erro) {
  app.log.error(erro);
  await pool.end();
  process.exit(1);
}
