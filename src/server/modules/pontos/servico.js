// Pontos de entrega (UC04, RF03). Endereço e coordenadas obrigatórios (ER RF03; D04 segue
// em aberto — a ER prevalece). Alterar um ponto não muda roteiros já montados (cópia, P03).

import { emTransacao } from '../../db/pool.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { garantir } from '../../shared/autorizacao.js';
import { erros } from '../../shared/erros.js';

const SQL_PONTO = `
  select id, nome, endereco, latitude, longitude, ativo from ponto`;

function normalizar(dados) {
  const nome = dados.nome?.trim() || null;
  const lat = Number(dados.latitude);
  const lon = Number(dados.longitude);
  const campos = {};
  if (!(lat >= -90 && lat <= 90)) campos.latitude = 'Latitude deve estar entre -90 e 90.';
  if (!(lon >= -180 && lon <= 180)) campos.longitude = 'Longitude deve estar entre -180 e 180.';
  if (Object.keys(campos).length) throw erros.validacao('Coordenadas inválidas.', campos);
  return { nome, endereco: dados.endereco.trim(), latitude: dados.latitude, longitude: dados.longitude };
}

export function criarServicoPontos({ pool }) {
  async function buscar(db, id, bloquear = false) {
    const { rows } = await db.query(`${SQL_PONTO} where id = $1 ${bloquear ? 'for update' : ''}`, [id]);
    if (!rows[0]) throw erros.naoEncontrado('Ponto não encontrado.');
    return rows[0];
  }

  return {
    async listar(usuario, { somenteAtivos } = {}) {
      garantir(usuario, 'ponto.gerir');
      const { rows } = await pool.query(`${SQL_PONTO} ${somenteAtivos ? 'where ativo' : ''} order by coalesce(nome, endereco)`);
      return rows;
    },

    async criar(usuario, dados) {
      garantir(usuario, 'ponto.gerir');
      const novo = normalizar(dados);
      return emTransacao(pool, async (db) => {
        const { rows } = await db.query(
          'insert into ponto (nome, endereco, latitude, longitude) values ($1, $2, $3, $4) returning id',
          [novo.nome, novo.endereco, novo.latitude, novo.longitude],
        );
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'ponto', entidadeId: rows[0].id, acao: 'criar', novo });
        return buscar(db, rows[0].id);
      });
    },

    async atualizar(usuario, id, dados) {
      garantir(usuario, 'ponto.gerir');
      const novo = { ...normalizar(dados), ativo: dados.ativo };
      return emTransacao(pool, async (db) => {
        const anterior = await buscar(db, id, true);
        await db.query(
          `update ponto set nome = $2, endereco = $3, latitude = $4, longitude = $5, ativo = $6,
                  atualizado_em = now() where id = $1`,
          [id, novo.nome, novo.endereco, novo.latitude, novo.longitude, novo.ativo],
        );
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'ponto', entidadeId: id,
          acao: novo.ativo ? 'alterar' : 'inativar', anterior, novo,
        });
        return buscar(db, id);
      });
    },
  };
}
