// Hash de senha com scrypt (node:crypto). Formato armazenado:
//   scrypt$<N>$<r>$<p>$<sal base64url>$<hash base64url>

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1 };
const TAMANHO_SAL = 16;
const TAMANHO_HASH = 64;
export const SENHA_TAMANHO_MINIMO = 8;
export const SENHA_TAMANHO_MAXIMO = 128;

function derivar(senha, sal, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scrypt(
      senha.normalize('NFKC'),
      sal,
      TAMANHO_HASH,
      { N, r, p, maxmem: 256 * N * r },
      (erro, chave) => (erro ? reject(erro) : resolve(chave)),
    );
  });
}

export function validarNovaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_TAMANHO_MINIMO) {
    return `A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`;
  }
  if (senha.length > SENHA_TAMANHO_MAXIMO) {
    return `A senha deve ter no máximo ${SENHA_TAMANHO_MAXIMO} caracteres.`;
  }
  return null;
}

export async function gerarHashSenha(senha) {
  const problema = validarNovaSenha(senha);
  if (problema) throw new Error(problema);
  const sal = randomBytes(TAMANHO_SAL);
  const hash = await derivar(senha, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return ['scrypt', N, r, p, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verificarSenha(senha, armazenado) {
  if (typeof senha !== 'string' || typeof armazenado !== 'string') return false;
  const partes = armazenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salTexto, hashTexto] = partes;
  const esperado = Buffer.from(hashTexto, 'base64url');
  const obtido = await derivar(senha, Buffer.from(salTexto, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

// Hash descartável usado quando o usuário não existe, para que o tempo de resposta
// do login não revele se o identificador está cadastrado.
let hashFicticio;
export async function consumirTempoDeVerificacao(senha) {
  hashFicticio ??= await gerarHashSenha('senha-ficticia-para-tempo-constante');
  await verificarSenha(typeof senha === 'string' ? senha : '', hashFicticio);
}
