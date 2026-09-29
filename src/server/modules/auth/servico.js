// Regras de autenticação (UC01). Não conhece HTTP nem SQL.

import { erros } from '../../shared/erros.js';
import { consumirTempoDeVerificacao, verificarSenha } from '../../shared/senha.js';
import { gerarTokenSessao, hashToken } from '../../shared/token.js';
import { funcoesDoUsuario } from './funcoes.js';

export function criarServicoAuth({ repositorio, sessaoDuracaoMin, agora = () => new Date() }) {
  return {
    async entrar({ login, senha }) {
      const credencial = await repositorio.buscarCredencial(login.trim());
      if (!credencial) {
        await consumirTempoDeVerificacao(senha);
        throw erros.credenciaisInvalidas();
      }
      if (!(await verificarSenha(senha, credencial.senhaHash))) {
        await repositorio.registrarAcessoNegado(credencial.id, 'credencial');
        throw erros.credenciaisInvalidas();
      }
      // Só informa a inatividade depois da senha correta (UC01, fluxo "usuário inativo").
      if (!credencial.ativo) {
        await repositorio.registrarAcessoNegado(credencial.id, 'inativo');
        throw erros.usuarioInativo();
      }

      const token = gerarTokenSessao();
      const expiraEm = new Date(agora().getTime() + sessaoDuracaoMin * 60_000);
      await repositorio.criarSessao({ tokenHash: hashToken(token), usuarioId: credencial.id, expiraEm });
      return { token, expiraEm };
    },

    async usuarioDoToken(token) {
      if (typeof token !== 'string' || token.length === 0 || token.length > 100) return null;
      return repositorio.buscarUsuarioDaSessao(hashToken(token));
    },

    async sair(token) {
      if (typeof token === 'string' && token.length > 0 && token.length <= 100) {
        await repositorio.revogarSessao(hashToken(token));
      }
    },

    perfilPublico(usuario) {
      return {
        id: usuario.id,
        nome: usuario.nome,
        perfil: usuario.perfil,
        funcoes: funcoesDoUsuario(usuario),
      };
    },
  };
}
