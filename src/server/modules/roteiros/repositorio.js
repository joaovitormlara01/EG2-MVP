// SQL de roteiros e ocorrências (RoteiroPonto). Recebe o executor (pool ou cliente).

const SQL_ROTEIRO = `
  select r.id, r.data, r.situacao, r.versao, r.motorista_id as "motoristaId", u.nome as "motoristaNome",
         r.equipe_id as "equipeId", e.nome as "equipeNome",
         r.veiculo_id as "veiculoId", v.placa as "veiculoPlaca",
         r.distancia_km as "distanciaKm", r.parametro_id as "parametroId", p.versao as "parametroVersao",
         p.jornada_min as "jornadaMin", r.valor_combustivel as "valorCombustivel",
         r.rendimento_km_l as "rendimentoKmL", r.custo_estimado as "custoEstimado",
         r.total_parado_seg as "totalParadoSeg", r.chave_idempotencia as "chaveIdempotencia",
         r.criado_por as "criadoPor", r.criado_em as "criadoEm", r.iniciado_em as "iniciadoEm",
         r.encerrado_em as "encerradoEm", r.cancelado_em as "canceladoEm"
    from roteiro r
    join usuario u on u.id = r.motorista_id
    join equipe e on e.id = r.equipe_id
    join parametro_sistema p on p.id = r.parametro_id
    left join veiculo v on v.id = r.veiculo_id`;

export async function buscarRoteiro(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SQL_ROTEIRO} where r.id = $1 ${bloquear ? 'for update of r' : ''}`, [id]);
  return rows[0] ?? null;
}

export async function buscarPorChave(db, chave) {
  const { rows } = await db.query(`${SQL_ROTEIRO} where r.chave_idempotencia = $1`, [chave]);
  return rows[0] ?? null;
}

export async function listarPontos(db, roteiroId) {
  const { rows } = await db.query(
    `select ordem, ponto_id as "pontoId", endereco, latitude, longitude, chegada, saida,
            tempo_parado_seg as "tempoParadoSeg"
       from roteiro_ponto where roteiro_id = $1 order by ordem`,
    [roteiroId],
  );
  return rows;
}

// Filtros: data (obrigatória na tela), motoristaId, e escopo { tipo, equipeIds | motoristaId }.
export async function listarRoteiros(db, { data, motoristaId, escopo }) {
  const condicoes = [];
  const params = [];
  const add = (sql, valor) => {
    params.push(valor);
    condicoes.push(sql.replace('?', `$${params.length}`));
  };
  if (data) add('r.data = ?::date', data);
  if (motoristaId) add('r.motorista_id = ?', motoristaId);
  if (escopo.tipo === 'equipes') add('r.equipe_id = any(?::bigint[])', escopo.equipeIds);
  if (escopo.tipo === 'motorista') add('r.motorista_id = ?', escopo.motoristaId);
  const where = condicoes.length ? `where ${condicoes.join(' and ')}` : '';
  const { rows } = await db.query(
    `${SQL_ROTEIRO.replace('from roteiro r', `,
            (select count(*) from roteiro_ponto rp where rp.roteiro_id = r.id) as "totalPontos"
       from roteiro r`)}
     ${where} order by r.data desc, u.nome, r.id limit 200`,
    params,
  );
  return rows;
}

// Outros roteiros não cancelados do motorista na data (aviso D12, sem bloqueio).
export async function outrosRoteirosDoDia(db, { motoristaId, data, excetoId = 0 }) {
  const { rows } = await db.query(
    `select id, situacao from roteiro
      where motorista_id = $1 and data = $2::date and situacao <> 'cancelado' and id <> $3
      order by id`,
    [motoristaId, data, excetoId],
  );
  return rows;
}

// Soma do dia do motorista (política de jornada por motorista/data, D09).
export async function totalDoDia(db, { motoristaId, data }) {
  const { rows } = await db.query(
    `select count(*) as roteiros, coalesce(sum(total_parado_seg), 0) as "totalParadoSeg"
       from roteiro where motorista_id = $1 and data = $2::date and situacao <> 'cancelado'`,
    [motoristaId, data],
  );
  return { roteiros: rows[0].roteiros, totalParadoSeg: Number(rows[0].totalParadoSeg) };
}

export async function buscarPontosAtivos(db, ids) {
  const { rows } = await db.query(
    'select id, endereco, latitude, longitude, ativo from ponto where id = any($1::bigint[])',
    [ids],
  );
  return new Map(rows.map((p) => [p.id, p]));
}

export async function inserirRoteiro(db, r) {
  const { rows } = await db.query(
    `insert into roteiro (motorista_id, equipe_id, data, veiculo_id, distancia_km, parametro_id,
                          valor_combustivel, rendimento_km_l, custo_estimado, criado_por, chave_idempotencia)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [r.motoristaId, r.equipeId, r.data, r.veiculoId, r.distanciaKm, r.parametroId,
      r.valorCombustivel, r.rendimentoKmL, r.custoEstimado, r.criadoPor, r.chaveIdempotencia],
  );
  return rows[0].id;
}

// Substitui todas as ocorrências (somente roteiro planejado, sem horários registrados).
// O gatilho de ordens e a unicidade são verificados ao fim da transação.
export async function substituirPontos(db, roteiroId, pontos) {
  await db.query('delete from roteiro_ponto where roteiro_id = $1', [roteiroId]);
  for (const [i, p] of pontos.entries()) {
    await db.query(
      `insert into roteiro_ponto (roteiro_id, ponto_id, ordem, endereco, latitude, longitude, tempo_parado_seg)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [roteiroId, p.id, i + 1, p.endereco, p.latitude, p.longitude, i === 0 ? 0 : null],
    );
  }
}

export async function atualizarPlanejamento(db, id, r) {
  await db.query(
    `update roteiro set data = $2, veiculo_id = $3, distancia_km = $4, parametro_id = $5,
            valor_combustivel = $6, rendimento_km_l = $7, custo_estimado = $8,
            versao = versao + 1, atualizado_em = now()
      where id = $1`,
    [id, r.data, r.veiculoId, r.distanciaKm, r.parametroId, r.valorCombustivel, r.rendimentoKmL, r.custoEstimado],
  );
}

export async function atualizarHorarios(db, roteiroId, ordem, { chegada, saida, tempoParadoSeg }) {
  await db.query(
    `update roteiro_ponto set chegada = $3, saida = $4, tempo_parado_seg = $5
      where roteiro_id = $1 and ordem = $2`,
    [roteiroId, ordem, chegada, saida, tempoParadoSeg],
  );
}

export async function atualizarSituacao(db, id, { situacao, totalParadoSeg, marcarInicio, marcarEncerramento, marcarCancelamento }) {
  await db.query(
    `update roteiro
        set situacao = $2, total_parado_seg = $3, versao = versao + 1, atualizado_em = now(),
            iniciado_em = case when $4 then coalesce(iniciado_em, now()) else iniciado_em end,
            encerrado_em = case when $5 then now() else encerrado_em end,
            cancelado_em = case when $6 then now() else cancelado_em end
      where id = $1`,
    [id, situacao, totalParadoSeg, !!marcarInicio, !!marcarEncerramento, !!marcarCancelamento],
  );
}
