// Histórico (UC08, RF07), dashboard (UC09, RF08) e exportação CSV (UC12, RF12).
// Os três usam os MESMOS filtros, o mesmo escopo de autorização e a mesma agregação.
//
// Datas: o filtro é pela DATA DO ROTEIRO (dia local do fuso operacional, coluna `date`),
// intervalo inclusivo [inicio, fim]. Horários de chegada/saída são instantes (timestamptz) e
// são exibidos no fuso APP_TIMEZONE.
// Sem limite máximo de período: o histórico é paginado (até 100 linhas por página), o dashboard
// devolve só agregados e o CSV exporta o resultado completo, sem truncar.

import { registrarAuditoria } from '../../shared/auditoria.js';
import { escopoDeConsulta, garantir } from '../../shared/autorizacao.js';
import { percentualJornada, tempoParadoSeg } from '../../shared/calculos.js';
import { dataValida } from '../../shared/esquemas.js';
import { erros, ErroAplicacao } from '../../shared/erros.js';
import { gerarCsv } from './csv.js';
import * as repo from './repositorio.js';

const TAMANHO_PAGINA_MAXIMO = 100;

function validarFiltros({ inicio, fim, motoristaId, equipeId }) {
  const campos = {};
  if (!dataValida(inicio)) campos.inicio = 'Data inicial inválida.';
  if (!dataValida(fim)) campos.fim = 'Data final inválida.';
  if (!Object.keys(campos).length) {
    const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000 + 1;
    if (dias < 1) campos.fim = 'A data final deve ser igual ou posterior à inicial.';
  }
  if (Object.keys(campos).length) throw erros.validacao('Período inválido.', campos);
  return { inicio, fim, motoristaId: motoristaId ?? null, equipeId: equipeId ?? null };
}

function situacaoDoPonto(o) {
  if (!o.chegada) return 'pendente';
  if (o.ordem === 1) return 'partida';
  return o.saida ? 'concluido' : 'em_andamento';
}

export function apresentarOcorrencia(o) {
  return {
    data: o.data,
    roteiroId: o.roteiroId,
    situacaoRoteiro: o.situacao,
    motorista: o.motoristaNome,
    equipe: o.equipeNome,
    ordem: o.ordem,
    partida: o.ordem === 1,
    endereco: o.endereco,
    chegada: o.chegada ? new Date(o.chegada).toISOString() : null,
    saida: o.saida ? new Date(o.saida).toISOString() : null,
    // Mesma regra do detalhe: partida 0; incompleto null; senão saída − chegada.
    tempoParadoSeg: tempoParadoSeg(o),
    situacao: situacaoDoPonto(o),
  };
}

// Consolida as duas agregações (roteiros e pares motorista/data) de um recorte.
function consolidar({ roteiros, pares }) {
  const porBalde = new Map();
  const obter = (balde) => {
    if (!porBalde.has(balde)) {
      porBalde.set(balde, { balde, roteiros: 0, roteirosIncompletos: 0, totalParadoSeg: 0, roteirosComCusto: 0, custoEstimado: null, pares: 0, jornadaMin: 0 });
    }
    return porBalde.get(balde);
  };
  for (const r of roteiros) Object.assign(obter(r.balde), { ...r, totalParadoSeg: Number(r.totalParadoSeg) });
  for (const p of pares) Object.assign(obter(p.balde), { pares: p.pares, jornadaMin: Number(p.jornadaMin) });
  return [...porBalde.values()].sort((a, b) => a.balde.localeCompare(b.balde)).map(indicadores);
}

function indicadores(b) {
  const semCusto = b.roteiros - b.roteirosComCusto;
  return {
    balde: b.balde,
    roteiros: b.roteiros,
    roteirosIncompletos: b.roteirosIncompletos,
    totalParadoSeg: b.totalParadoSeg,
    // Denominador: jornada somada uma vez por par motorista/data com roteiro elegível.
    paresMotoristaData: b.pares,
    jornadaMinTotal: b.jornadaMin,
    percentualJornada: b.pares ? percentualJornada(b.totalParadoSeg, b.jornadaMin) : null,
    custo: {
      // null = nenhum roteiro com custo disponível (diferente de zero).
      estimado: b.roteirosComCusto ? b.custoEstimado : null,
      roteirosComCusto: b.roteirosComCusto,
      roteirosSemCusto: semCusto,
      parcial: b.roteirosComCusto > 0 && semCusto > 0,
    },
    parcial: b.roteirosIncompletos > 0,
  };
}

function totaisVazios(filtros) {
  return indicadores({ balde: filtros.inicio, roteiros: 0, roteirosIncompletos: 0, totalParadoSeg: 0, roteirosComCusto: 0, custoEstimado: null, pares: 0, jornadaMin: 0 });
}

export function criarServicoConsultas({ pool, fusoHorario }) {
  async function resumo(filtros) {
    const [periodo] = consolidar(await repo.agregar(pool, filtros, 'periodo'));
    return periodo ?? totaisVazios(filtros);
  }

  const comEscopo = (usuario, filtros) => ({ ...filtros, escopo: escopoDeConsulta(usuario) });

  // Acessos de gerente/admin a dados de motoristas ficam registrados (RNF06).
  async function registrarConsulta(usuario, acao, filtros, extra = {}) {
    if (usuario.perfil === 'motorista') return;
    const { inicio, fim, motoristaId, equipeId } = filtros;
    await registrarAuditoria(pool, {
      usuarioId: usuario.id, entidade: 'consulta', acao, novo: { inicio, fim, motoristaId, equipeId, ...extra },
    });
  }

  return {
    async historico(usuario, consulta) {
      garantir(usuario, 'historico.consultar');
      const filtros = comEscopo(usuario, validarFiltros(consulta));
      const tamanho = Math.min(consulta.tamanho ?? 50, TAMANHO_PAGINA_MAXIMO);
      const pagina = consulta.pagina ?? 1;
      const [total, linhas, totais] = await Promise.all([
        repo.contarOcorrencias(pool, filtros),
        repo.listarOcorrencias(pool, filtros, { limite: tamanho, deslocamento: (pagina - 1) * tamanho }),
        resumo(filtros),
      ]);
      await registrarConsulta(usuario, 'consulta_historico', filtros, { pagina });
      return {
        filtros: { inicio: filtros.inicio, fim: filtros.fim, motoristaId: filtros.motoristaId, equipeId: filtros.equipeId },
        pagina, tamanho, total, paginas: Math.max(1, Math.ceil(total / tamanho)),
        ocorrencias: linhas.map(apresentarOcorrencia),
        totais,
      };
    },

    async dashboard(usuario, consulta) {
      garantir(usuario, 'dashboard.consultar');
      const filtros = comEscopo(usuario, validarFiltros(consulta));
      const recorte = consulta.recorte ?? 'dia';
      const [series, totais, maiores] = await Promise.all([
        repo.agregar(pool, filtros, recorte).then(consolidar),
        resumo(filtros),
        repo.maioresParadas(pool, filtros),
      ]);
      return {
        filtros: { inicio: filtros.inicio, fim: filtros.fim, motoristaId: filtros.motoristaId, equipeId: filtros.equipeId },
        recorte,
        series,
        totais,
        maioresParadas: maiores.map(apresentarOcorrencia),
      };
    },

    async exportarCsv(usuario, consulta) {
      garantir(usuario, 'relatorio.exportar');
      const filtros = comEscopo(usuario, validarFiltros(consulta));
      const linhas = await repo.listarOcorrencias(pool, filtros);
      if (!linhas.length) {
        throw new ErroAplicacao(422, 'SEM_DADOS', 'Não há conteúdo para exportar no período e filtros selecionados.');
      }
      const totais = await resumo(filtros);
      const conteudo = gerarCsv({ ocorrencias: linhas.map(apresentarOcorrencia), totais, filtros, fusoHorario });
      await registrarAuditoria(pool, {
        usuarioId: usuario.id, entidade: 'relatorio', acao: 'exportar_csv',
        novo: { inicio: filtros.inicio, fim: filtros.fim, motoristaId: filtros.motoristaId, equipeId: filtros.equipeId, linhas: linhas.length },
      });
      return { conteudo, nomeArquivo: `rotaclara-historico-${filtros.inicio}-a-${filtros.fim}.csv` };
    },
  };
}
