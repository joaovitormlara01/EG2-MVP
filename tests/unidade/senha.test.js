import { describe, expect, it } from 'vitest';
import {
  gerarHashSenha,
  validarNovaSenha,
  verificarSenha,
} from '../../src/server/shared/senha.js';
import { gerarTokenSessao, hashToken } from '../../src/server/shared/token.js';

describe('senha (scrypt)', () => {
  it('gera hash com sal e verifica a senha correta', async () => {
    const hash = await gerarHashSenha('senha-segura-1');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain('senha-segura-1');
    expect(await verificarSenha('senha-segura-1', hash)).toBe(true);
    expect(await verificarSenha('senha-errada', hash)).toBe(false);
  });

  it('usa sal diferente a cada hash', async () => {
    const [a, b] = await Promise.all([gerarHashSenha('mesma-senha'), gerarHashSenha('mesma-senha')]);
    expect(a).not.toBe(b);
  });

  it('rejeita hash em formato desconhecido', async () => {
    expect(await verificarSenha('x', 'md5$abc')).toBe(false);
    expect(await verificarSenha('x', null)).toBe(false);
  });

  it('valida tamanho da nova senha', () => {
    expect(validarNovaSenha('curta')).toMatch(/pelo menos 8/);
    expect(validarNovaSenha('a'.repeat(129))).toMatch(/no máximo 128/);
    expect(validarNovaSenha('suficiente')).toBeNull();
  });
});

describe('token de sessão', () => {
  it('gera tokens aleatórios e hash SHA-256 de 32 bytes', () => {
    const t1 = gerarTokenSessao();
    expect(t1).toMatch(/^[\w-]{43}$/);
    expect(gerarTokenSessao()).not.toBe(t1);
    expect(hashToken(t1)).toHaveLength(32);
    expect(hashToken(t1).equals(hashToken(t1))).toBe(true);
  });
});
