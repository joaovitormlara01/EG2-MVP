// Acesso a dados de autenticação. Único ponto que conhece o SQL de usuário/sessão.

import { emTransacao } from '../../db/pool.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

const paraUsuario = (linha) => ({
  id: linha.id,
  nome: linha.nome,
  perfil: linha.perfil,
  equipeIds: (linha.equipe_ids ?? []).map(Number),
});

export function criarRepositorioAuth(pool) {
  return {
    // Login por e-mail (qualquer perfil) ou documento (motorista).
    async buscarCredencial(login) {
      const { rows } = await pool.query(
        `select u.id, u.nome, u.perfil, u.ativo, u.senha_hash
           from usuario u
           left join motorista m on m.usuario_id = u.id
          where lower(u.email) = lower($1) or m.documento = $1
          limit 2`,
        [login],
      );
      // Identificador ambíguo nunca autentica.
      if (rows.length !== 1) return null;
      const [linha] = rows;
      return {
        id: linha.id,
        nome: linha.nome,
        perfil: linha.perfil,
        ativo: linha.ativo,
        senhaHash: linha.senha_hash,
      };
    },

    async criarSessao({ tokenHash, usuarioId, expiraEm }) {
      await emTransacao(pool, async (cliente) => {
        await cliente.query(
          'insert into sessao (token_hash, usuario_id, expira_em) values ($1, $2, $3)',
          [tokenHash, usuarioId, expiraEm],
        );
        await registrarAuditoria(cliente, {
          usuarioId,
          entidade: 'sessao',
          entidadeId: usuarioId,
          acao: 'login',
        });
      });
    },

    // Usuário ativo dono de uma sessão válida, com as equipes que definem seu escopo (D07).
    async buscarUsuarioDaSessao(tokenHash) {
      const { rows } = await pool.query(
        `select u.id, u.nome, u.perfil,
                case u.perfil
                  when 'gerente' then coalesce(
                    (select array_agg(e.id order by e.id)
                       from equipe e where e.gerente_id = u.id and e.ativo), '{}')
                  when 'motorista' then
                    (select array[m.equipe_id] from motorista m where m.usuario_id = u.id)
                  else '{}'::bigint[]
                end as equipe_ids
           from sessao s
           join usuario u on u.id = s.usuario_id
          where s.token_hash = $1
            and s.revogada_em is null
            and s.expira_em > now()
            and u.ativo`,
        [tokenHash],
      );
      return rows.length ? paraUsuario(rows[0]) : null;
    },

    async revogarSessao(tokenHash) {
      const { rows } = await pool.query(
        `update sessao set revogada_em = now()
          where token_hash = $1 and revogada_em is null
          returning usuario_id`,
        [tokenHash],
      );
      if (rows.length) {
        await registrarAuditoria(pool, {
          usuarioId: rows[0].usuario_id,
          entidade: 'sessao',
          entidadeId: rows[0].usuario_id,
          acao: 'logout',
        });
      }
    },

    // Tentativas negadas de usuários existentes (UC01: acesso registrado). O texto digitado
    // no login não é gravado (minimização, RNF06).
    async registrarAcessoNegado(usuarioId, motivo) {
      await registrarAuditoria(pool, {
        usuarioId,
        entidade: 'sessao',
        entidadeId: usuarioId,
        acao: `login_negado_${motivo}`,
      });
    },
  };
}
