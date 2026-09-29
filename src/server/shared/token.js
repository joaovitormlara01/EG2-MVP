// Tokens de sessão opacos. O navegador recebe o token; o banco guarda apenas o SHA-256.

import { createHash, randomBytes } from 'node:crypto';

export function gerarTokenSessao() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest();
}
