// SQL de equipes, gerentes, motoristas e veículos. Todas as funções recebem o executor
// (pool ou cliente de transação) como primeiro argumento. Nunca há DELETE: só inativação.

// ---- Equipes ----------------------------------------------------------------------------------

const SQL_EQUIPE = `
  select e.id, e.nome, e.ativo, e.gerente_id as "gerenteId", g.nome as "gerenteNome",
         (select count(*) from motorista m where m.equipe_id = e.id) as "totalMotoristas"
    from equipe e left join usuario g on g.id = e.gerente_id`;

export async function listarEquipes(db, { equipeIds } = {}) {
  const filtro = equipeIds ? 'where e.id = any($1::bigint[])' : '';
  const { rows } = await db.query(`${SQL_EQUIPE} ${filtro} order by e.nome`, equipeIds ? [equipeIds] : []);
  return rows;
}

export async function buscarEquipe(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SQL_EQUIPE} where e.id = $1 ${bloquear ? 'for update of e' : ''}`, [id]);
  return rows[0] ?? null;
}

export async function inserirEquipe(db, { nome, gerenteId }) {
  const { rows } = await db.query(
    'insert into equipe (nome, gerente_id) values ($1, $2) returning id',
    [nome, gerenteId],
  );
  return rows[0].id;
}

export async function atualizarEquipe(db, id, { nome, gerenteId, ativo }) {
  await db.query(
    `update equipe set nome = $2, gerente_id = $3, ativo = $4, atualizado_em = now() where id = $1`,
    [id, nome, gerenteId, ativo],
  );
}

// ---- Usuários (gerentes e motoristas) ---------------------------------------------------------

export async function inserirUsuario(db, { nome, email, telefone, perfil, senhaHash }) {
  const { rows } = await db.query(
    `insert into usuario (nome, email, telefone, perfil, senha_hash)
     values ($1, $2, $3, $4, $5) returning id`,
    [nome, email, telefone, perfil, senhaHash],
  );
  return rows[0].id;
}

export async function atualizarUsuario(db, id, { nome, email, telefone, ativo, senhaHash }) {
  await db.query(
    `update usuario
        set nome = $2, email = $3, telefone = $4, ativo = $5,
            senha_hash = coalesce($6, senha_hash), atualizado_em = now()
      where id = $1`,
    [id, nome, email, telefone, ativo, senhaHash ?? null],
  );
}

const SQL_GERENTE = `
  select u.id, u.nome, u.email, u.telefone, u.ativo,
         coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome) order by e.nome)
                     from equipe e where e.gerente_id = u.id), '[]') as equipes
    from usuario u
   where u.perfil = 'gerente'`;

export async function listarGerentes(db) {
  const { rows } = await db.query(`${SQL_GERENTE} order by u.nome`);
  return rows;
}

export async function buscarGerente(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SQL_GERENTE} and u.id = $1 ${bloquear ? 'for update of u' : ''}`, [id]);
  return rows[0] ?? null;
}

const SQL_MOTORISTA = `
  select u.id, u.nome, u.email, u.telefone, u.ativo, m.documento,
         m.equipe_id as "equipeId", e.nome as "equipeNome",
         m.veiculo_id as "veiculoId", v.placa as "veiculoPlaca"
    from motorista m
    join usuario u on u.id = m.usuario_id
    join equipe e on e.id = m.equipe_id
    left join veiculo v on v.id = m.veiculo_id`;

export async function listarMotoristas(db, { equipeIds, somenteAtivos = false } = {}) {
  const condicoes = [];
  const params = [];
  if (equipeIds) {
    params.push(equipeIds);
    condicoes.push(`m.equipe_id = any($${params.length}::bigint[])`);
  }
  if (somenteAtivos) condicoes.push('u.ativo');
  const where = condicoes.length ? `where ${condicoes.join(' and ')}` : '';
  const { rows } = await db.query(`${SQL_MOTORISTA} ${where} order by u.nome`, params);
  return rows;
}

export async function buscarMotorista(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `${SQL_MOTORISTA} where m.usuario_id = $1 ${bloquear ? 'for update of m, u' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function inserirMotorista(db, { usuarioId, documento, equipeId, veiculoId }) {
  await db.query(
    'insert into motorista (usuario_id, documento, equipe_id, veiculo_id) values ($1, $2, $3, $4)',
    [usuarioId, documento, equipeId, veiculoId],
  );
}

export async function atualizarMotorista(db, id, { documento, equipeId, veiculoId }) {
  await db.query(
    'update motorista set documento = $2, equipe_id = $3, veiculo_id = $4 where usuario_id = $1',
    [id, documento, equipeId, veiculoId],
  );
}

// ---- Veículos ---------------------------------------------------------------------------------

const SQL_VEICULO = `
  select id, placa, descricao, rendimento_km_l as "rendimentoKmL", ativo from veiculo`;

export async function listarVeiculos(db, { somenteAtivos = false } = {}) {
  const { rows } = await db.query(`${SQL_VEICULO} ${somenteAtivos ? 'where ativo' : ''} order by placa`);
  return rows;
}

export async function buscarVeiculo(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SQL_VEICULO} where id = $1 ${bloquear ? 'for update' : ''}`, [id]);
  return rows[0] ?? null;
}

export async function inserirVeiculo(db, { placa, descricao, rendimentoKmL }) {
  const { rows } = await db.query(
    'insert into veiculo (placa, descricao, rendimento_km_l) values ($1, $2, $3) returning id',
    [placa, descricao, rendimentoKmL],
  );
  return rows[0].id;
}

export async function atualizarVeiculo(db, id, { placa, descricao, rendimentoKmL, ativo }) {
  await db.query(
    `update veiculo set placa = $2, descricao = $3, rendimento_km_l = $4, ativo = $5,
            atualizado_em = now() where id = $1`,
    [id, placa, descricao, rendimentoKmL, ativo],
  );
}
