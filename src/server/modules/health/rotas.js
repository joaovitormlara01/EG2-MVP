// GET /api/v1/health — status da API e do banco (sem autenticação, sem dados pessoais).

export async function rotasHealth(app, { pool }) {
  app.get('/health', { config: { publico: true } }, async (_requisicao, resposta) => {
    let banco = 'ok';
    try {
      await pool.query('select 1');
    } catch {
      banco = 'indisponivel';
    }
    const status = banco === 'ok' ? 'ok' : 'degradado';
    return resposta.status(banco === 'ok' ? 200 : 503).send({ status, banco });
  });
}
