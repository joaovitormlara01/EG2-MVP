// Política central de acesso: pode(usuario, acao, recurso).
// Fonte: matriz de permissão do Projeto Preliminar (p.7) + casos de uso (p.8–21).
// Referências (Dxx/Pxx) apontam para docs/decisoes.md.
//
// usuario: { id, perfil: 'motorista'|'gerente'|'admin', equipeIds: number[] }
//   - gerente: equipes pelas quais é responsável
//   - motorista: a equipe a que pertence (D07)
// recurso (quando a ação é sobre um registro específico):
//   { motoristaId?, equipeId?, situacao? }  — situacao do roteiro

import { erros } from './erros.js';

export const PERFIS = Object.freeze(['motorista', 'gerente', 'admin']);

const SITUACOES_FECHADAS = new Set(['encerrado', 'cancelado']);

const ehAdmin = (u) => u.perfil === 'admin';
const ehGerente = (u) => u.perfil === 'gerente';
const ehMotorista = (u) => u.perfil === 'motorista';

function daEquipe(usuario, recurso) {
  return recurso?.equipeId != null && usuario.equipeIds.includes(Number(recurso.equipeId));
}

function proprio(usuario, recurso) {
  return recurso?.motoristaId != null && Number(recurso.motoristaId) === usuario.id;
}

// Cada regra recebe (usuario, recurso) e devolve true/false.
const REGRAS = {
  // Registrar chegada e saída: motorista no próprio roteiro não encerrado (RN09, PP p.30).
  'coleta.registrar': (u, r) =>
    ehMotorista(u) && proprio(u, r) && !SITUACOES_FECHADAS.has(r?.situacao),
  // Correção auditada de pontos/horários (RN09): gerente da equipe ou administrador.
  'coleta.corrigir': (u, r) => ehAdmin(u) || (ehGerente(u) && daEquipe(u, r)),

  // Montar/cancelar roteiro: gerente (equipe do motorista, D07) ou administrador.
  'roteiro.gerir': (u, r) => ehAdmin(u) || (ehGerente(u) && daEquipe(u, r)),
  // Encerrar roteiro: motorista no próprio roteiro, gerente da equipe ou admin (P02).
  'roteiro.encerrar': (u, r) =>
    ehAdmin(u) ||
    (ehGerente(u) && daEquipe(u, r)) ||
    (ehMotorista(u) && proprio(u, r) && !SITUACOES_FECHADAS.has(r?.situacao)),
  'roteiro.consultar': (u, r) =>
    ehAdmin(u) || (ehGerente(u) && daEquipe(u, r)) || (ehMotorista(u) && proprio(u, r)),

  // Histórico e dashboard (D06 confirmada): todos os perfis, sempre filtrados por
  // escopoDeConsulta — motorista só os próprios roteiros; gerente as equipes; admin todos.
  'historico.consultar': () => true,
  'dashboard.consultar': () => true,
  // Exportação: somente gerente (equipe) e admin (D06 confirmada).
  'relatorio.exportar': (u) => ehAdmin(u) || ehGerente(u),

  // Parâmetros: só o administrador altera (CT10); gerente consulta para planejar custos.
  'parametros.consultar': (u) => ehAdmin(u) || ehGerente(u),
  'parametros.alterar': (u) => ehAdmin(u),

  // Gerir usuários: gerente só motoristas da equipe; admin todos (PP p.7).
  'motorista.gerir': (u, r) => ehAdmin(u) || (ehGerente(u) && (r == null || daEquipe(u, r))),
  'veiculo.gerir': (u) => ehAdmin(u) || ehGerente(u),
  'gerente.gerir': (u) => ehAdmin(u),
  'equipe.gerir': (u) => ehAdmin(u),

  // Pontos (UC04): gerente e admin.
  'ponto.gerir': (u) => ehAdmin(u) || ehGerente(u),
  'ponto.consultar': () => true,

  // Auditoria: somente admin.
  'auditoria.consultar': (u) => ehAdmin(u),
};

export const ACOES = Object.freeze(Object.keys(REGRAS));

export function pode(usuario, acao, recurso) {
  if (!usuario || !PERFIS.includes(usuario.perfil)) return false;
  const regra = REGRAS[acao];
  if (!regra) throw new Error(`Ação de autorização desconhecida: ${acao}`);
  return regra(usuario, recurso) === true;
}

// Uso nos serviços: lança 403 quando a política nega.
export function garantir(usuario, acao, recurso) {
  if (!pode(usuario, acao, recurso)) throw erros.proibido();
}

// Filtro para consultas em lote (histórico, dashboard, exportação).
export function escopoDeConsulta(usuario) {
  if (ehAdmin(usuario)) return { tipo: 'todos' };
  if (ehGerente(usuario)) return { tipo: 'equipes', equipeIds: [...usuario.equipeIds] };
  return { tipo: 'motorista', motoristaId: usuario.id };
}
