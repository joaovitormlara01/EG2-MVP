// Registro de auditoria (RNF05, RN09, RNF06). Deve ser chamado com o mesmo cliente da
// transação que faz a alteração, para que ambos sejam gravados juntos ou nenhum.

const CAMPOS_SENSIVEIS = new Set(['senha', 'senha_hash', 'senhaHash', 'token', 'token_hash']);

function semCamposSensiveis(valor) {
  if (valor == null || typeof valor !== 'object') return valor ?? null;
  return Object.fromEntries(Object.entries(valor).filter(([chave]) => !CAMPOS_SENSIVEIS.has(chave)));
}

export async function registrarAuditoria(
  executor,
  { usuarioId = null, entidade, entidadeId = null, acao, anterior = null, novo = null },
) {
  await executor.query(
    `insert into registro_auditoria (usuario_id, entidade, entidade_id, acao, valor_anterior, valor_novo)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      usuarioId,
      entidade,
      entidadeId == null ? null : String(entidadeId),
      acao,
      anterior == null ? null : JSON.stringify(semCamposSensiveis(anterior)),
      novo == null ? null : JSON.stringify(semCamposSensiveis(novo)),
    ],
  );
}
