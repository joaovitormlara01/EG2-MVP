// npm run db:migrate — aplica migrações pendentes no banco de DATABASE_URL.

import { carregarConfig } from '../../config.js';
import { migrar } from '../migrador.js';
import { criarPool } from '../pool.js';

const config = carregarConfig();
const pool = criarPool(config.databaseUrl);

try {
  const { aplicadas, total } = await migrar(pool, { log: (m) => console.log(m) });
  console.log(
    aplicadas.length
      ? `${aplicadas.length} migração(ões) aplicada(s). Total no projeto: ${total}.`
      : `Banco já atualizado (${total} migração(ões)).`,
  );
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
