// SQL de histórico, dashboard e exportação (UC08, UC09, UC12).
// Roteiros elegíveis: em execução ou encerrados, com data do roteiro no intervalo [inicio, fim]
// (inclusivo). Cancelados ficam fora; planejados ainda não têm paradas.
// Agregações de roteiro nunca fazem JOIN com roteiro_ponto (evita multiplicar custo/total).

export const SITUACOES_ELEGIVEIS = ['em_execucao', 'encerrado'];

// Monta o WHERE comum. `escopo` vem de escopoDeConsulta(usuario).
function filtroRoteiros({ inicio, fim, motoristaId, equipeId, escopo }) {
  const params = [inicio, fim, SITUACOES_ELEGIVEIS];
  const condicoes = ['r.data between $1::date and $2::date', 'r.situacao = any($3::text[])'];
  const add = (sql, valor) => {
    params.push(valor);
    condicoes.push(sql.replace('?', `$${params.length}`));
  };
  if (motoristaId) add('r.motorista_id = ?', motoristaId);
  if (equipeId) add('r.equipe_id = ?', equipeId);
  if (escopo.tipo === 'equipes') add('r.equipe_id = any(?::bigint[])', escopo.equipeIds);
  if (escopo.tipo === 'motorista') add('r.motorista_id = ?', escopo.motoristaId);
  return { where: condicoes.join(' and '), params };
}

const SQL_OCORRENCIAS = `
  select r.data, r.id as "roteiroId", r.situacao, u.nome as "motoristaNome", e.nome as "equipeNome",
         rp.ordem, rp.endereco, rp.chegada, rp.saida
    from roteiro r
    join roteiro_ponto rp on rp.roteiro_id = r.id
    join usuario u on u.id = r.motorista_id
    join equipe e on e.id = r.equipe_id`;

export async function contarOcorrencias(db, filtros) {
  const { where, params } = filtroRoteiros(filtros);
  const { rows } = await db.query(
    `select count(*) as total from roteiro r join roteiro_ponto rp on rp.roteiro_id = r.id where ${where}`,
    params,
  );
  return rows[0].total;
}

// limite/deslocamento opcionais: sem eles, devolve tudo (exportação).
export async function listarOcorrencias(db, filtros, { limite, deslocamento } = {}) {
  const { where, params } = filtroRoteiros(filtros);
  let paginacao = '';
  if (limite) {
    params.push(limite, deslocamento ?? 0);
    paginacao = `limit $${params.length - 1} offset $${params.length}`;
  }
  const { rows } = await db.query(
    `${SQL_OCORRENCIAS} where ${where} order by r.data desc, r.id desc, rp.ordem ${paginacao}`,
    params,
  );
  return rows;
}

// Expressão do recorte sobre a data do roteiro.
const BALDES = {
  dia: 'r.data',
  mes: "date_trunc('month', r.data)::date",
  periodo: '$1::date',
};

// Agregação por recorte, em duas consultas independentes:
//  - roteiros: soma do total parado (gravado com os mesmos cálculos do detalhe), custo e contagens;
//  - pares motorista/data: jornada somada UMA vez por par, com a versão preservada no roteiro
//    mais antigo do par (todos os roteiros de um par usam a mesma versão pela política D09/D10).
export async function agregar(db, filtros, recorte) {
  const { where, params } = filtroRoteiros(filtros);
  const balde = BALDES[recorte];
  const { rows: roteiros } = await db.query(
    `select ${balde} as balde,
            count(*) as roteiros,
            count(*) filter (where r.situacao <> 'encerrado') as "roteirosIncompletos",
            coalesce(sum(r.total_parado_seg), 0) as "totalParadoSeg",
            count(r.custo_estimado) as "roteirosComCusto",
            sum(r.custo_estimado) as "custoEstimado"
       from roteiro r
      where ${where}
      group by 1 order by 1`,
    params,
  );
  const { rows: pares } = await db.query(
    `with pares as (
       select distinct on (r.motorista_id, r.data) r.motorista_id, r.data, p.jornada_min
         from roteiro r join parametro_sistema p on p.id = r.parametro_id
        where ${where}
        order by r.motorista_id, r.data, r.id)
     select ${balde} as balde, count(*) as pares, sum(jornada_min) as "jornadaMin"
       from pares r group by 1 order by 1`,
    params,
  );
  return { roteiros, pares };
}

export async function maioresParadas(db, filtros, limite = 10) {
  const { where, params } = filtroRoteiros(filtros);
  params.push(limite);
  const { rows } = await db.query(
    `${SQL_OCORRENCIAS}
      where ${where} and rp.ordem > 1 and rp.tempo_parado_seg is not null
      order by rp.tempo_parado_seg desc, r.data desc, r.id, rp.ordem
      limit $${params.length}`,
    params,
  );
  return rows;
}
