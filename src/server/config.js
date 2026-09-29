// Configuração lida do ambiente. Credenciais ficam apenas no servidor.

const AMBIENTES = new Set(['development', 'test', 'production']);

function inteiroPositivo(nome, valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`Variável ${nome} deve ser um inteiro positivo (recebido: "${valor}").`);
  }
  return numero;
}

function booleano(nome, valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new Error(`Variável ${nome} deve ser "true" ou "false" (recebido: "${valor}").`);
}

export function carregarConfig(env = process.env) {
  const ambiente = env.NODE_ENV || 'development';
  if (!AMBIENTES.has(ambiente)) {
    throw new Error(`NODE_ENV inválido: "${ambiente}".`);
  }
  const producao = ambiente === 'production';

  return Object.freeze({
    ambiente,
    host: env.HOST || '127.0.0.1',
    porta: inteiroPositivo('PORT', env.PORT, 3000),
    databaseUrl: env.DATABASE_URL || '',
    fusoHorario: env.APP_TIMEZONE || 'America/Sao_Paulo',
    sessaoDuracaoMin: inteiroPositivo('SESSAO_DURACAO_MIN', env.SESSAO_DURACAO_MIN, 720),
    cookieSeguro: booleano('COOKIE_SECURE', env.COOKIE_SECURE, producao),
    // Origens extras aceitas em requisições que alteram estado (ex.: https://rotaclara.exemplo).
    // A própria origem do servidor é sempre aceita.
    origensPermitidas: (env.APP_ORIGENS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logNivel: env.LOG_LEVEL || (ambiente === 'test' ? 'silent' : 'info'),
  });
}
