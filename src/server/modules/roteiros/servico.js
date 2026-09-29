// Montagem de roteiro (UC05), coleta (UC06), cálculos (UC07, UC11), correção e encerramento.
// Toda decisão é do servidor: horários vêm do relógio do servidor (P01), totais são recalculados
// aqui e gravados junto com a auditoria na mesma transação. O roteiro é bloqueado (FOR UPDATE)
// em toda escrita, e alterações de planejamento/correção exigem a versão lida (409 se mudou).
//
// Estados (D20): planejado → em_execucao (1ª chegada) → encerrado; cancelado a partir de
// planejado ou em_execucao. Encerrado e cancelado são finais.

import { emTransacao } from '../../db/pool.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { escopoDeConsulta, garantir, pode } from '../../shared/autorizacao.js';
import {
  calcularCusto, dataLocal, percentualJornada, tempoParadoSeg, totaisDoRoteiro,
} from '../../shared/calculos.js';
import { dataValida } from '../../shared/esquemas.js';
import { erros } from '../../shared/erros.js';
import { buscarMotorista, buscarVeiculo } from '../cadastros/repositorio.js';
import { buscarParametro, parametroVigente } from '../parametros/servico.js';
import * as repo from './repositorio.js';

const ABERTOS = new Set(['planejado', 'em_execucao']);
const recursoDe = (r) => ({ equipeId: r.equipeId, motoristaId: r.motoristaId, situacao: r.situacao });
const iso = (d) => (d ? new Date(d).toISOString() : null);

function situacaoDoPonto(p) {
  if (!p.chegada) return 'pendente';
  if (p.ordem === 1) return p.saida ? 'concluido' : 'chegada_registrada';
  return p.saida ? 'concluido' : 'em_andamento';
}

// Primeiro ponto que ainda precisa de ação do motorista.
function pontoAtual(pontos) {
  const p = pontos.find((x) => !x.chegada || (x.ordem > 1 && !x.saida));
  return p ? p.ordem : null;
}

export function criarServicoRoteiros({ pool, fusoHorario, agora = () => new Date() }) {
  const hoje = () => dataLocal(agora(), fusoHorario);

  // ---- Apresentação (tudo calculado no servidor) ----
  async function apresentar(db, r, usuario) {
    const pontos = await repo.listarPontos(db, r.id);
    const totais = totaisDoRoteiro(pontos);
    const dia = await repo.totalDoDia(db, { motoristaId: r.motoristaId, data: r.data });
    const custo = calcularCusto(r);
    const recurso = recursoDe(r);
    return {
      id: r.id,
      data: r.data,
      situacao: r.situacao,
      versao: r.versao,
      motorista: { id: r.motoristaId, nome: r.motoristaNome },
      equipe: { id: r.equipeId, nome: r.equipeNome },
      veiculo: r.veiculoId ? { id: r.veiculoId, placa: r.veiculoPlaca } : null,
      distanciaKm: r.distanciaKm,
      pontoAtual: ABERTOS.has(r.situacao) ? pontoAtual(pontos) : null,
      pontos: pontos.map((p) => ({
        ordem: p.ordem,
        partida: p.ordem === 1,
        pontoId: p.pontoId,
        endereco: p.endereco,
        latitude: p.latitude,
        longitude: p.longitude,
        chegada: iso(p.chegada),
        saida: iso(p.saida),
        situacao: situacaoDoPonto(p),
        // null = incompleto (diferente de zero). Partida sempre 0 e fora do total (RN01, RN03).
        tempoParadoSeg: tempoParadoSeg(p),
        contaNoTotal: p.ordem > 1,
      })),
      totais: {
        ...totais,
        totalParadoSeg: r.totalParadoSeg,
        jornadaMin: r.jornadaMin,
        percentualJornada: percentualJornada(r.totalParadoSeg, r.jornadaMin),
      },
      // Jornada por motorista/data: soma dos roteiros não cancelados do dia (D09).
      jornadaDoDia: {
        roteiros: dia.roteiros,
        totalParadoSeg: dia.totalParadoSeg,
        percentual: percentualJornada(dia.totalParadoSeg, r.jornadaMin),
      },
      custo: {
        ...custo,
        valorCombustivel: r.valorCombustivel,
        rendimentoKmL: r.rendimentoKmL,
        distanciaKm: r.distanciaKm,
        parametroVersao: r.parametroVersao,
        custoEstimado: r.custoEstimado ?? null,
      },
      datas: {
        criadoEm: iso(r.criadoEm), iniciadoEm: iso(r.iniciadoEm),
        encerradoEm: iso(r.encerradoEm), canceladoEm: iso(r.canceladoEm),
      },
      permissoes: usuario
        ? {
            gerir: ABERTOS.has(r.situacao) && pode(usuario, 'roteiro.gerir', recurso),
            editarPontos: r.situacao === 'planejado' && pode(usuario, 'roteiro.gerir', recurso),
            registrar: pode(usuario, 'coleta.registrar', recurso) && r.data <= hoje(),
            corrigir: ['em_execucao', 'encerrado'].includes(r.situacao) && pode(usuario, 'coleta.corrigir', recurso),
            encerrar: r.situacao === 'em_execucao' && pode(usuario, 'roteiro.encerrar', recurso),
          }
        : undefined,
    };
  }

  async function carregar(db, id, { bloquear = false } = {}) {
    const r = await repo.buscarRoteiro(db, id, { bloquear });
    if (!r) throw erros.naoEncontrado('Roteiro não encontrado.');
    return r;
  }

  function conferirVersao(r, versao) {
    if (versao !== r.versao) throw erros.versaoDesatualizada();
  }

  // Resolve pontos (ativos) e copia endereço/coordenadas (P03).
  async function resolverPontos(db, pontoIds) {
    if (!Array.isArray(pontoIds) || pontoIds.length < 2) {
      throw erros.regraNegocio('O roteiro precisa de pelo menos 2 pontos.', { pontoIds: 'Selecione pelo menos 2 pontos.' });
    }
    const mapa = await repo.buscarPontosAtivos(db, [...new Set(pontoIds)]);
    return pontoIds.map((id) => {
      const p = mapa.get(id);
      if (!p) throw erros.validacao('Ponto inexistente.', { pontoIds: `Ponto ${id} não existe.` });
      if (!p.ativo) throw erros.regraNegocio('Ponto inativo.', { pontoIds: `Ponto ${id} está inativo.` });
      return p;
    });
  }

  // Política de jornada por motorista/data (D09/D10): todos os roteiros não cancelados de um
  // motorista numa data usam a MESMA versão de parâmetros. Se já existe roteiro nesse par,
  // reutiliza a versão capturada por ele (o mais antigo); senão, captura a vigente na data agora.
  async function parametroDoDia(db, { motoristaId, data, excetoId = 0 }) {
    const { rows } = await db.query(
      `select parametro_id from roteiro
        where motorista_id = $1 and data = $2::date and situacao <> 'cancelado' and id <> $3
        order by id limit 1`,
      [motoristaId, data, excetoId],
    );
    return rows.length ? buscarParametro(db, rows[0].parametro_id) : parametroVigente(db, data);
  }

  // D05: todo roteiro operacional tem veículo. Mantém o rendimento já copiado se o veículo não muda.
  async function rendimentoDoVeiculo(db, { veiculoId, veiculoAtual, rendimentoAtual }) {
    if (veiculoId == null) {
      throw erros.regraNegocio('O roteiro precisa de um veículo.', {
        veiculoId: 'Selecione um veículo ou atribua um veículo ao motorista.',
      });
    }
    if (veiculoId === veiculoAtual) return rendimentoAtual;
    const v = await buscarVeiculo(db, veiculoId);
    if (!v) throw erros.validacao('Veículo inexistente.', { veiculoId: 'Veículo inexistente.' });
    if (!v.ativo) throw erros.regraNegocio('Veículo inativo.', { veiculoId: 'Veículo inativo.' });
    return v.rendimentoKmL;
  }

  // Valores de custo copiados no roteiro (P04, D23). Nunca recalculados depois sem ação explícita.
  function valoresDeCusto(parametro, rendimentoKmL, distanciaKm) {
    return {
      parametroId: parametro.id,
      valorCombustivel: parametro.valorCombustivel,
      rendimentoKmL,
      custoEstimado: calcularCusto({ valorCombustivel: parametro.valorCombustivel, rendimentoKmL, distanciaKm }).custoEstimado,
    };
  }

  function validarData(data) {
    if (!dataValida(data)) throw erros.validacao('Data inválida.', { data: 'Data inválida.' });
  }

  async function avisosDoDia(db, { motoristaId, data, id }) {
    const outros = await repo.outrosRoteirosDoDia(db, { motoristaId, data, excetoId: id });
    return outros.length
      ? [`O motorista já tem ${outros.length} outro(s) roteiro(s) não cancelado(s) em ${data}: nº ${outros.map((o) => o.id).join(', ')}.`]
      : [];
  }

  // Recalcula tempos e total a partir dos horários gravados.
  async function recalcularTotal(db, r) {
    const pontos = await repo.listarPontos(db, r.id);
    return totaisDoRoteiro(pontos).totalParadoSeg;
  }

  return {
    async listar(usuario, { data, motoristaId }) {
      if (data) validarData(data);
      const linhas = await repo.listarRoteiros(pool, { data, motoristaId, escopo: escopoDeConsulta(usuario) });
      return linhas.map((r) => ({
        id: r.id, data: r.data, situacao: r.situacao,
        motorista: { id: r.motoristaId, nome: r.motoristaNome },
        equipe: { id: r.equipeId, nome: r.equipeNome },
        veiculo: r.veiculoId ? { id: r.veiculoId, placa: r.veiculoPlaca } : null,
        totalPontos: r.totalPontos,
        totalParadoSeg: r.totalParadoSeg,
        custoEstimado: r.custoEstimado,
      }));
    },

    async detalhe(usuario, id) {
      const r = await carregar(pool, id);
      garantir(usuario, 'roteiro.consultar', recursoDe(r));
      return apresentar(pool, r, usuario);
    },

    async criar(usuario, dados) {
      validarData(dados.data);
      // Reenvio com a mesma chave devolve o roteiro já criado (duplo clique, nova tentativa).
      if (dados.chaveIdempotencia) {
        const existente = await repo.buscarPorChave(pool, dados.chaveIdempotencia);
        if (existente) {
          if (existente.criadoPor !== usuario.id) throw erros.conflito('Chave de envio já utilizada.');
          return { roteiro: await apresentar(pool, existente, usuario), avisos: [], repetido: true };
        }
      }
      try {
        return await emTransacao(pool, async (db) => {
          const motorista = await buscarMotorista(db, dados.motoristaId);
          if (!motorista) throw erros.validacao('Motorista inexistente.', { motoristaId: 'Motorista inexistente.' });
          // Equipe vem do cadastro do motorista, nunca do cliente.
          garantir(usuario, 'roteiro.gerir', { equipeId: motorista.equipeId });
          if (!motorista.ativo) throw erros.regraNegocio('Motorista inativo.', { motoristaId: 'Motorista inativo.' });

          const pontos = await resolverPontos(db, dados.pontoIds);
          // Sem veículo informado, usa o veículo atribuído ao motorista (D05).
          const veiculoId = dados.veiculoId ?? motorista.veiculoId ?? null;
          const rendimento = await rendimentoDoVeiculo(db, { veiculoId });
          const parametro = await parametroDoDia(db, { motoristaId: motorista.id, data: dados.data });
          const custo = valoresDeCusto(parametro, rendimento, dados.distanciaKm ?? null);
          const id = await repo.inserirRoteiro(db, {
            motoristaId: motorista.id, equipeId: motorista.equipeId, data: dados.data,
            veiculoId, distanciaKm: dados.distanciaKm ?? null, ...custo,
            criadoPor: usuario.id, chaveIdempotencia: dados.chaveIdempotencia ?? null,
          });
          await repo.substituirPontos(db, id, pontos);
          await registrarAuditoria(db, {
            usuarioId: usuario.id, entidade: 'roteiro', entidadeId: id, acao: 'montar',
            novo: { motoristaId: motorista.id, data: dados.data, veiculoId,
              distanciaKm: dados.distanciaKm ?? null, pontoIds: dados.pontoIds, ...custo },
          });
          const avisos = await avisosDoDia(db, { motoristaId: motorista.id, data: dados.data, id });
          return { roteiro: await apresentar(db, await carregar(db, id), usuario), avisos, repetido: false };
        });
      } catch (erro) {
        // Dois envios simultâneos com a mesma chave: o segundo devolve o primeiro.
        if (erro.code === '23505' && erro.constraint === 'roteiro_chave_idempotencia_unica') {
          const existente = await repo.buscarPorChave(pool, dados.chaveIdempotencia);
          return { roteiro: await apresentar(pool, existente, usuario), avisos: [], repetido: true };
        }
        throw erro;
      }
    },

    // Planejado: altera data, veículo, distância e pontos. Em execução: só veículo e distância.
    async editar(usuario, id, dados) {
      return emTransacao(pool, async (db) => {
        const r = await carregar(db, id, { bloquear: true });
        garantir(usuario, 'roteiro.gerir', recursoDe(r));
        conferirVersao(r, dados.versao);
        if (!ABERTOS.has(r.situacao)) throw erros.regraNegocio('Roteiro encerrado ou cancelado não pode ser editado.');

        const data = dados.data ?? r.data;
        validarData(data);
        const mudaPontos = dados.pontoIds !== undefined;
        if (r.situacao !== 'planejado' && (mudaPontos || data !== r.data)) {
          throw erros.regraNegocio('Com o roteiro em execução, só veículo e distância podem ser alterados.');
        }
        const veiculoId = dados.veiculoId === undefined ? r.veiculoId : dados.veiculoId;
        const distanciaKm = dados.distanciaKm === undefined ? r.distanciaKm : dados.distanciaKm;
        const pontosAntes = (await repo.listarPontos(db, id)).map((p) => p.pontoId);

        // A versão de parâmetros capturada só muda se a DATA mudar (novo par motorista/data).
        // Veículo e distância são alterações explícitas do gerente e recalculam o custo.
        const rendimento = await rendimentoDoVeiculo(db, { veiculoId, veiculoAtual: r.veiculoId, rendimentoAtual: r.rendimentoKmL });
        const parametro = data !== r.data
          ? await parametroDoDia(db, { motoristaId: r.motoristaId, data, excetoId: id })
          : { id: r.parametroId, valorCombustivel: r.valorCombustivel };
        const custo = valoresDeCusto(parametro, rendimento, distanciaKm);
        if (mudaPontos) await repo.substituirPontos(db, id, await resolverPontos(db, dados.pontoIds));
        await repo.atualizarPlanejamento(db, id, { data, veiculoId, distanciaKm, ...custo });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'roteiro', entidadeId: id, acao: 'editar',
          anterior: { data: r.data, veiculoId: r.veiculoId, distanciaKm: r.distanciaKm, pontoIds: pontosAntes,
            parametroId: r.parametroId, valorCombustivel: r.valorCombustivel, rendimentoKmL: r.rendimentoKmL, custoEstimado: r.custoEstimado },
          novo: { data, veiculoId, distanciaKm, pontoIds: mudaPontos ? dados.pontoIds : pontosAntes, ...custo },
        });
        const avisos = await avisosDoDia(db, { motoristaId: r.motoristaId, data, id });
        return { roteiro: await apresentar(db, await carregar(db, id), usuario), avisos };
      });
    },

    async cancelar(usuario, id, { versao }) {
      return emTransacao(pool, async (db) => {
        const r = await carregar(db, id, { bloquear: true });
        garantir(usuario, 'roteiro.gerir', recursoDe(r));
        conferirVersao(r, versao);
        if (!ABERTOS.has(r.situacao)) throw erros.regraNegocio('Só roteiros planejados ou em execução podem ser cancelados.');
        await repo.atualizarSituacao(db, id, { situacao: 'cancelado', totalParadoSeg: r.totalParadoSeg, marcarCancelamento: true });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'roteiro', entidadeId: id, acao: 'cancelar',
          anterior: { situacao: r.situacao }, novo: { situacao: 'cancelado' },
        });
        return apresentar(db, await carregar(db, id), usuario);
      });
    },

    // RN10 (decisão registrada): todos os pontos com chegada; todos exceto a partida com saída.
    async encerrar(usuario, id, { versao }) {
      return emTransacao(pool, async (db) => {
        const r = await carregar(db, id, { bloquear: true });
        garantir(usuario, 'roteiro.encerrar', recursoDe(r));
        conferirVersao(r, versao);
        if (r.situacao !== 'em_execucao') throw erros.regraNegocio('Só roteiros em execução podem ser encerrados.');
        const pontos = await repo.listarPontos(db, id);
        const semChegada = pontos.filter((p) => !p.chegada).map((p) => p.ordem);
        const semSaida = pontos.filter((p) => p.ordem > 1 && !p.saida).map((p) => p.ordem);
        if (semChegada.length || semSaida.length) {
          const partes = [];
          if (semChegada.length) partes.push(`sem chegada: ${semChegada.join(', ')}`);
          if (semSaida.length) partes.push(`sem saída: ${semSaida.join(', ')}`);
          throw erros.regraNegocio(`Não é possível encerrar. Pontos ${partes.join('; ')}.`);
        }
        const total = totaisDoRoteiro(pontos).totalParadoSeg;
        await repo.atualizarSituacao(db, id, { situacao: 'encerrado', totalParadoSeg: total, marcarEncerramento: true });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'roteiro', entidadeId: id, acao: 'encerrar',
          anterior: { situacao: r.situacao }, novo: { situacao: 'encerrado', totalParadoSeg: total },
        });
        return apresentar(db, await carregar(db, id), usuario);
      });
    },

    // Registro pelo motorista com o relógio do servidor. Repetir a mesma ação não sobrescreve:
    // devolve o estado atual com jaRegistrado = true.
    async registrar(usuario, id, ordem, tipo) {
      return emTransacao(pool, async (db) => {
        const r = await carregar(db, id, { bloquear: true });
        garantir(usuario, 'coleta.registrar', recursoDe(r));
        // Coleta normal usa o relógio do servidor (P01). Fonte das regras abaixo: instrução da
        // etapa 7 ("ownership/date and point sequence remain valid") e RN06. Horários de datas
        // passadas ou fora de ordem entram pela correção autorizada (RN09), não pela coleta.
        if (r.data > hoje()) throw erros.regraNegocio(`Este roteiro é para ${r.data}; o registro só pode começar nessa data.`);
        const pontos = await repo.listarPontos(db, id);
        const ponto = pontos.find((p) => p.ordem === ordem);
        if (!ponto) throw erros.naoEncontrado('Ponto não existe neste roteiro.');
        const anterior = pontos.find((p) => p.ordem === ordem - 1);
        const proximo = pontos.find((p) => p.ordem === ordem + 1);

        if (tipo === 'chegada') {
          if (ponto.chegada) return { roteiro: await apresentar(db, r, usuario), jaRegistrado: true };
          if (anterior && (!anterior.chegada || (anterior.ordem > 1 && !anterior.saida))) {
            throw erros.regraNegocio(`Registre antes ${anterior.chegada ? 'a saída' : 'a chegada'} do ponto ${anterior.ordem}.`);
          }
        } else {
          if (ponto.saida) return { roteiro: await apresentar(db, r, usuario), jaRegistrado: true };
          if (!ponto.chegada) throw erros.regraNegocio('Registre a chegada antes da saída (RN08).');
          if (proximo?.chegada) throw erros.regraNegocio('A chegada no ponto seguinte já foi registrada.');
        }

        const instante = agora();
        const novo = {
          chegada: tipo === 'chegada' ? instante : ponto.chegada,
          saida: tipo === 'saida' ? instante : ponto.saida,
        };
        novo.tempoParadoSeg = tempoParadoSeg({ ordem, ...novo });
        await repo.atualizarHorarios(db, id, ordem, novo);
        const total = await recalcularTotal(db, r);
        const inicia = r.situacao === 'planejado';
        await repo.atualizarSituacao(db, id, {
          situacao: inicia ? 'em_execucao' : r.situacao, totalParadoSeg: total, marcarInicio: inicia,
        });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'roteiro_ponto', entidadeId: `${id}/${ordem}`,
          acao: `registrar_${tipo}`,
          anterior: { chegada: iso(ponto.chegada), saida: iso(ponto.saida) },
          novo: { chegada: iso(novo.chegada), saida: iso(novo.saida), tempoParadoSeg: novo.tempoParadoSeg, totalParadoSeg: total },
        });
        return { roteiro: await apresentar(db, await carregar(db, id), usuario), jaRegistrado: false };
      });
    },

    // Correção auditada (RN09): gerente da equipe ou admin; roteiro em execução ou encerrado.
    async corrigir(usuario, id, ordem, { versao, chegada, saida, motivo }) {
      return emTransacao(pool, async (db) => {
        const r = await carregar(db, id, { bloquear: true });
        garantir(usuario, 'coleta.corrigir', recursoDe(r));
        conferirVersao(r, versao);
        if (!['em_execucao', 'encerrado'].includes(r.situacao)) {
          throw erros.regraNegocio('Só é possível corrigir roteiros em execução ou encerrados.');
        }
        const pontos = await repo.listarPontos(db, id);
        const ponto = pontos.find((p) => p.ordem === ordem);
        if (!ponto) throw erros.naoEncontrado('Ponto não existe neste roteiro.');

        const c = chegada ? new Date(chegada) : null;
        const s = saida ? new Date(saida) : null;
        const campos = {};
        if (!c) campos.chegada = 'Informe a chegada.';
        if (s && c && s < c) campos.saida = 'A saída não pode ser anterior à chegada (RN08).';
        if (!s && r.situacao === 'encerrado' && ordem > 1) campos.saida = 'Roteiro encerrado exige saída neste ponto (RN10).';
        // Correção restaura horários históricos: não aceita instante no futuro.
        if ((c && c > agora()) || (s && s > agora())) campos[c > agora() ? 'chegada' : 'saida'] = 'Horário no futuro.';
        // Não há regra documentada de ordem cronológica entre pontos: cada ponto pode ser corrigido
        // isoladamente, em qualquer ordem (apenas RN08 e RN10 valem).
        if (Object.keys(campos).length) throw erros.regraNegocio('Correção inválida.', campos);

        const novo = { chegada: c, saida: s, tempoParadoSeg: tempoParadoSeg({ ordem, chegada: c, saida: s }) };
        const totalAntes = r.totalParadoSeg;
        await repo.atualizarHorarios(db, id, ordem, novo);
        const total = await recalcularTotal(db, r);
        await repo.atualizarSituacao(db, id, { situacao: r.situacao, totalParadoSeg: total });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'roteiro_ponto', entidadeId: `${id}/${ordem}`, acao: 'corrigir',
          anterior: { chegada: iso(ponto.chegada), saida: iso(ponto.saida), tempoParadoSeg: tempoParadoSeg(ponto), totalParadoSeg: totalAntes },
          novo: { chegada: iso(c), saida: iso(s), tempoParadoSeg: novo.tempoParadoSeg, totalParadoSeg: total, motivo: motivo.trim() },
        });
        return apresentar(db, await carregar(db, id), usuario);
      });
    },
  };
}
