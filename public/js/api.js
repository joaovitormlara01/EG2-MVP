// Cliente HTTP da API (mesma origem). Toda regra de negócio e permissão é do servidor;
// este módulo só envia requisições e padroniza os erros.

const BASE = '/api/v1';

export class ErroApi extends Error {
  constructor(status, { codigo = 'ERRO', mensagem = 'Falha na comunicação com o servidor.', campos } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.campos = campos ?? {};
  }
}

export async function requisitar(metodo, caminho, corpo) {
  const opcoes = {
    method: metodo,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo ?? {});
  }

  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, opcoes);
  } catch {
    throw new ErroApi(0, {
      codigo: 'SEM_CONEXAO',
      mensagem: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
    });
  }

  if (resposta.status === 204) return null;

  const tipo = resposta.headers.get('content-type') ?? '';
  const dados = tipo.includes('application/json') ? await resposta.json() : null;

  if (!resposta.ok) throw new ErroApi(resposta.status, dados?.erro);
  return dados;
}

export const api = {
  get: (caminho) => requisitar('GET', caminho),
  post: (caminho, corpo) => requisitar('POST', caminho, corpo),
  put: (caminho, corpo) => requisitar('PUT', caminho, corpo),
  patch: (caminho, corpo) => requisitar('PATCH', caminho, corpo),
  delete: (caminho) => requisitar('DELETE', caminho),
};
