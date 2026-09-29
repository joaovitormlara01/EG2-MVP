// Repositório de autenticação em memória, com a mesma interface do repositório SQL.
// Usado nos testes de rotas que não precisam de PostgreSQL.

import { gerarHashSenha } from '../../src/server/shared/senha.js';

export async function criarRepositorioAuthMemoria(usuarios) {
  const registros = [];
  for (const u of usuarios) {
    registros.push({ ...u, senhaHash: await gerarHashSenha(u.senha), ativo: u.ativo ?? true });
  }
  const sessoes = new Map(); // hex(tokenHash) -> { usuarioId, expiraEm, revogada }
  const auditoria = [];

  return {
    auditoria,
    sessoes,
    async buscarCredencial(login) {
      const achados = registros.filter(
        (u) => u.email?.toLowerCase() === login.toLowerCase() || u.documento === login,
      );
      if (achados.length !== 1) return null;
      const [u] = achados;
      return { id: u.id, nome: u.nome, perfil: u.perfil, ativo: u.ativo, senhaHash: u.senhaHash };
    },
    async criarSessao({ tokenHash, usuarioId, expiraEm }) {
      sessoes.set(tokenHash.toString('hex'), { usuarioId, expiraEm, revogada: false });
      auditoria.push({ usuarioId, acao: 'login' });
    },
    async buscarUsuarioDaSessao(tokenHash) {
      const sessao = sessoes.get(tokenHash.toString('hex'));
      if (!sessao || sessao.revogada || sessao.expiraEm <= new Date()) return null;
      const u = registros.find((r) => r.id === sessao.usuarioId);
      if (!u?.ativo) return null;
      return { id: u.id, nome: u.nome, perfil: u.perfil, equipeIds: u.equipeIds ?? [] };
    },
    async revogarSessao(tokenHash) {
      const sessao = sessoes.get(tokenHash.toString('hex'));
      if (sessao && !sessao.revogada) {
        sessao.revogada = true;
        auditoria.push({ usuarioId: sessao.usuarioId, acao: 'logout' });
      }
    },
    async registrarAcessoNegado(usuarioId, motivo) {
      auditoria.push({ usuarioId, acao: `login_negado_${motivo}` });
    },
  };
}
