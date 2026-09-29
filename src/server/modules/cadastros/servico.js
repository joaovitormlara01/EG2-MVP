// Regras de cadastro (UC02, UC03, RF01, RF02). Toda escrita roda em transação junto com a
// auditoria (RNF05). Autorização por perfil e equipe (PP p.7) em cada operação.

import { emTransacao } from '../../db/pool.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { garantir, pode } from '../../shared/autorizacao.js';
import { erros } from '../../shared/erros.js';
import { gerarHashSenha } from '../../shared/senha.js';
import * as repo from './repositorio.js';

const limpar = (v) => (typeof v === 'string' ? v.trim() : v);
const opcional = (v) => {
  const t = limpar(v);
  return t === '' || t === undefined ? null : t;
};

function exigirPositivo(valor, campo, rotulo) {
  if (!/[1-9]/.test(valor)) {
    throw erros.validacao(`${rotulo} deve ser maior que zero.`, { [campo]: 'Informe um valor maior que zero.' });
  }
}

function naoEncontrado(registro, mensagem) {
  if (!registro) throw erros.naoEncontrado(mensagem);
  return registro;
}

export function criarServicoCadastros({ pool }) {
  // Registra acesso administrativo a dados pessoais (RNF06, PP p.30).
  const registrarConsulta = (usuario, entidade) =>
    registrarAuditoria(pool, { usuarioId: usuario.id, entidade, acao: 'consulta_lista' });

  async function validarEquipeAtiva(db, equipeId) {
    const equipe = await repo.buscarEquipe(db, equipeId);
    if (!equipe) throw erros.validacao('Equipe inexistente.', { equipeId: 'Equipe inexistente.' });
    if (!equipe.ativo) throw erros.regraNegocio('Equipe inativa.', { equipeId: 'Equipe inativa.' });
    return equipe;
  }

  async function validarVeiculoAtivo(db, veiculoId, atual) {
    if (veiculoId == null) return;
    const veiculo = await repo.buscarVeiculo(db, veiculoId);
    if (!veiculo) throw erros.validacao('Veículo inexistente.', { veiculoId: 'Veículo inexistente.' });
    // Mantém um veículo já vinculado mesmo que tenha sido inativado depois.
    if (!veiculo.ativo && veiculoId !== atual) {
      throw erros.regraNegocio('Veículo inativo.', { veiculoId: 'Veículo inativo.' });
    }
  }

  async function validarGerenteAtivo(db, gerenteId) {
    if (gerenteId == null) return;
    const gerente = await repo.buscarGerente(db, gerenteId);
    if (!gerente) throw erros.validacao('Gerente inexistente.', { gerenteId: 'Gerente inexistente.' });
    if (!gerente.ativo) throw erros.regraNegocio('Gerente inativo.', { gerenteId: 'Gerente inativo.' });
  }

  return {
    // ---- Equipes (admin gere; gerente consulta as próprias) ----
    async listarEquipes(usuario) {
      if (pode(usuario, 'equipe.gerir')) return repo.listarEquipes(pool);
      if (usuario.perfil === 'gerente') return repo.listarEquipes(pool, { equipeIds: usuario.equipeIds });
      throw erros.proibido();
    },

    async criarEquipe(usuario, dados) {
      garantir(usuario, 'equipe.gerir');
      return emTransacao(pool, async (db) => {
        const novo = { nome: limpar(dados.nome), gerenteId: dados.gerenteId ?? null };
        await validarGerenteAtivo(db, novo.gerenteId);
        const id = await repo.inserirEquipe(db, novo);
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'equipe', entidadeId: id, acao: 'criar', novo });
        return repo.buscarEquipe(db, id);
      });
    },

    async atualizarEquipe(usuario, id, dados) {
      garantir(usuario, 'equipe.gerir');
      return emTransacao(pool, async (db) => {
        const atual = naoEncontrado(await repo.buscarEquipe(db, id, { bloquear: true }), 'Equipe não encontrada.');
        const novo = { nome: limpar(dados.nome), gerenteId: dados.gerenteId ?? null, ativo: dados.ativo };
        if (novo.gerenteId !== atual.gerenteId) await validarGerenteAtivo(db, novo.gerenteId);
        await repo.atualizarEquipe(db, id, novo);
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'equipe', entidadeId: id, acao: novo.ativo ? 'alterar' : 'inativar',
          anterior: { nome: atual.nome, gerenteId: atual.gerenteId, ativo: atual.ativo }, novo,
        });
        return repo.buscarEquipe(db, id);
      });
    },

    // ---- Gerentes (somente admin, UC03) ----
    async listarGerentes(usuario) {
      garantir(usuario, 'gerente.gerir');
      await registrarConsulta(usuario, 'gerente');
      return repo.listarGerentes(pool);
    },

    async criarGerente(usuario, dados) {
      garantir(usuario, 'gerente.gerir');
      const senhaHash = await gerarHashSenha(dados.senha);
      return emTransacao(pool, async (db) => {
        const novo = { nome: limpar(dados.nome), email: limpar(dados.email).toLowerCase(), telefone: opcional(dados.telefone) };
        const id = await repo.inserirUsuario(db, { ...novo, perfil: 'gerente', senhaHash });
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'gerente', entidadeId: id, acao: 'criar', novo });
        return repo.buscarGerente(db, id);
      });
    },

    async atualizarGerente(usuario, id, dados) {
      garantir(usuario, 'gerente.gerir');
      const senhaHash = dados.senha ? await gerarHashSenha(dados.senha) : null;
      return emTransacao(pool, async (db) => {
        const atual = naoEncontrado(await repo.buscarGerente(db, id, { bloquear: true }), 'Gerente não encontrado.');
        const novo = {
          nome: limpar(dados.nome), email: limpar(dados.email).toLowerCase(),
          telefone: opcional(dados.telefone), ativo: dados.ativo,
        };
        await repo.atualizarUsuario(db, id, { ...novo, senhaHash });
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'gerente', entidadeId: id, acao: novo.ativo ? 'alterar' : 'inativar',
          anterior: { nome: atual.nome, email: atual.email, telefone: atual.telefone, ativo: atual.ativo },
          novo: { ...novo, ...(senhaHash ? { senhaRedefinida: true } : {}) },
        });
        return repo.buscarGerente(db, id);
      });
    },

    // ---- Motoristas (admin: todos; gerente: equipes pelas quais responde) ----
    async listarMotoristas(usuario, { somenteAtivos } = {}) {
      garantir(usuario, 'motorista.gerir');
      await registrarConsulta(usuario, 'motorista');
      const equipeIds = usuario.perfil === 'admin' ? undefined : usuario.equipeIds;
      return repo.listarMotoristas(pool, { equipeIds, somenteAtivos });
    },

    async criarMotorista(usuario, dados) {
      garantir(usuario, 'motorista.gerir', { equipeId: dados.equipeId });
      const senhaHash = await gerarHashSenha(dados.senha);
      return emTransacao(pool, async (db) => {
        await validarEquipeAtiva(db, dados.equipeId);
        await validarVeiculoAtivo(db, dados.veiculoId ?? null);
        const novo = {
          nome: limpar(dados.nome), telefone: opcional(dados.telefone),
          email: opcional(dados.email)?.toLowerCase() ?? null, documento: limpar(dados.documento),
          equipeId: dados.equipeId, veiculoId: dados.veiculoId ?? null,
        };
        const id = await repo.inserirUsuario(db, { ...novo, perfil: 'motorista', senhaHash });
        await repo.inserirMotorista(db, { usuarioId: id, ...novo });
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'motorista', entidadeId: id, acao: 'criar', novo });
        return repo.buscarMotorista(db, id);
      });
    },

    async atualizarMotorista(usuario, id, dados) {
      const senhaHash = dados.senha ? await gerarHashSenha(dados.senha) : null;
      return emTransacao(pool, async (db) => {
        const atual = naoEncontrado(await repo.buscarMotorista(db, id, { bloquear: true }), 'Motorista não encontrado.');
        // Precisa de permissão na equipe atual e na equipe de destino.
        garantir(usuario, 'motorista.gerir', { equipeId: atual.equipeId });
        garantir(usuario, 'motorista.gerir', { equipeId: dados.equipeId });
        if (dados.equipeId !== atual.equipeId) await validarEquipeAtiva(db, dados.equipeId);
        await validarVeiculoAtivo(db, dados.veiculoId ?? null, atual.veiculoId);
        const novo = {
          nome: limpar(dados.nome), telefone: opcional(dados.telefone),
          email: opcional(dados.email)?.toLowerCase() ?? null, documento: limpar(dados.documento),
          equipeId: dados.equipeId, veiculoId: dados.veiculoId ?? null, ativo: dados.ativo,
        };
        await repo.atualizarUsuario(db, id, { ...novo, senhaHash });
        await repo.atualizarMotorista(db, id, novo);
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'motorista', entidadeId: id, acao: novo.ativo ? 'alterar' : 'inativar',
          anterior: atual,
          novo: { ...novo, ...(senhaHash ? { senhaRedefinida: true } : {}) },
        });
        return repo.buscarMotorista(db, id);
      });
    },

    // ---- Veículos (admin e gerente) ----
    async listarVeiculos(usuario, { somenteAtivos } = {}) {
      garantir(usuario, 'veiculo.gerir');
      return repo.listarVeiculos(pool, { somenteAtivos });
    },

    async criarVeiculo(usuario, dados) {
      garantir(usuario, 'veiculo.gerir');
      exigirPositivo(dados.rendimentoKmL, 'rendimentoKmL', 'Rendimento');
      return emTransacao(pool, async (db) => {
        const novo = {
          placa: limpar(dados.placa).toUpperCase(), descricao: opcional(dados.descricao),
          rendimentoKmL: dados.rendimentoKmL,
        };
        const id = await repo.inserirVeiculo(db, novo);
        await registrarAuditoria(db, { usuarioId: usuario.id, entidade: 'veiculo', entidadeId: id, acao: 'criar', novo });
        return repo.buscarVeiculo(db, id);
      });
    },

    // Alterar o rendimento não muda roteiros já montados (cópia no roteiro, P04).
    async atualizarVeiculo(usuario, id, dados) {
      garantir(usuario, 'veiculo.gerir');
      exigirPositivo(dados.rendimentoKmL, 'rendimentoKmL', 'Rendimento');
      return emTransacao(pool, async (db) => {
        const atual = naoEncontrado(await repo.buscarVeiculo(db, id, { bloquear: true }), 'Veículo não encontrado.');
        const novo = {
          placa: limpar(dados.placa).toUpperCase(), descricao: opcional(dados.descricao),
          rendimentoKmL: dados.rendimentoKmL, ativo: dados.ativo,
        };
        await repo.atualizarVeiculo(db, id, novo);
        await registrarAuditoria(db, {
          usuarioId: usuario.id, entidade: 'veiculo', entidadeId: id, acao: novo.ativo ? 'alterar' : 'inativar',
          anterior: atual, novo,
        });
        return repo.buscarVeiculo(db, id);
      });
    },
  };
}
