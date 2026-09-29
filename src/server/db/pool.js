import pg from 'pg';

const OID_INT8 = 20;
const OID_DATE = 1082;

// ids e contagens (bigint) viram Number; datas puras ficam como texto 'AAAA-MM-DD'
// para não sofrerem conversão de fuso. numeric continua string (precisão decimal).
const tipos = {
  getTypeParser(oid, formato) {
    if (oid === OID_INT8) return (valor) => Number(valor);
    if (oid === OID_DATE) return (valor) => valor;
    return pg.types.getTypeParser(oid, formato);
  },
};

export function criarPool(connectionString, opcoes = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env e ajuste.');
  }
  return new pg.Pool({
    connectionString,
    types: tipos,
    max: 10,
    connectionTimeoutMillis: 5000,
    application_name: 'rotaclara',
    ...opcoes,
  });
}

// Executa fn(cliente) dentro de uma transação; faz rollback em qualquer erro.
export async function emTransacao(pool, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await fn(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (erro) {
    await cliente.query('rollback').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}
