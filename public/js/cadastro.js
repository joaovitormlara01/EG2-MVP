// Controlador reutilizável para telas de cadastro (lista + formulário de inclusão/edição).
// Sem exclusão: a edição tem o campo "Ativo" para inativar (histórico preservado).

import { api } from './api.js';
import { el, selecionar } from './dom.js';
import {
  executarUmaVez, limparErrosCampos, limparMensagem, mostrarErrosCampos, mostrarEstado, mostrarMensagem,
  tratarErro,
} from './ui.js';

/**
 * @param {object} cfg
 * @param {string} cfg.url              ex.: '/pontos'
 * @param {string} cfg.chaveLista       ex.: 'pontos'
 * @param {string} cfg.chaveItem        ex.: 'ponto'
 * @param {string} cfg.nome             ex.: 'ponto' (usado nas mensagens)
 * @param {Array<{titulo: string, valor: Function}>} cfg.colunas
 * @param {Function} cfg.lerFormulario  (form, editando) => corpo JSON
 * @param {Function} cfg.preencher      (form, item) => void
 * @param {Function} [cfg.antesDeCarregar] carrega listas auxiliares (selects)
 * @param {Function} [cfg.aoMudarModo]  (form, itemEmEdicao|null) => void
 */
export function iniciarCadastro(cfg) {
  const form = selecionar('#form-cadastro');
  const mensagem = selecionar('#mensagem');
  const lista = selecionar('#lista');
  const titulo = selecionar('#titulo-form');
  const botaoEnviar = selecionar('button[type="submit"]', form);
  const botaoCancelar = selecionar('#cancelar-edicao');
  const campoAtivo = form.querySelector('#campo-ativo');
  let editando = null;

  function modoInclusao() {
    editando = null;
    form.reset();
    limparErrosCampos(form);
    titulo.textContent = `Novo ${cfg.nome}`;
    botaoEnviar.textContent = 'Cadastrar';
    botaoCancelar.hidden = true;
    if (campoAtivo) campoAtivo.hidden = true;
    cfg.aoMudarModo?.(form, null);
  }

  function modoEdicao(item) {
    editando = item;
    form.reset();
    limparErrosCampos(form);
    cfg.preencher(form, item);
    if (campoAtivo) {
      campoAtivo.hidden = false;
      form.elements.namedItem('ativo').checked = item.ativo;
    }
    titulo.textContent = `Editar ${cfg.nome}`;
    botaoEnviar.textContent = 'Salvar alterações';
    botaoCancelar.hidden = false;
    cfg.aoMudarModo?.(form, item);
    form.querySelector('input:not([type=hidden]), select')?.focus();
    form.scrollIntoView?.({ block: 'start' });
  }

  function linha(item) {
    return el(
      'tr',
      { classe: item.ativo === false ? 'linha-inativa' : undefined },
      ...cfg.colunas.map((c) => {
        const valor = c.valor(item);
        return el('td', { 'data-rotulo': c.titulo }, valor instanceof Node ? valor : String(valor ?? '—'));
      }),
      el(
        'td',
        { 'data-rotulo': 'Ações' },
        el('button', {
          type: 'button', classe: 'botao botao-secundario botao-pequeno',
          'aria-label': `Editar ${cfg.nome} ${cfg.colunas[0].valor(item)}`, texto: 'Editar',
          onclick: () => modoEdicao(item),
        }),
      ),
    );
  }

  async function carregar() {
    mostrarEstado(lista, 'carregando');
    try {
      const dados = await api.get(cfg.url);
      const itens = dados[cfg.chaveLista];
      if (!itens.length) return mostrarEstado(lista, 'vazio', `Nenhum ${cfg.nome} cadastrado.`);
      lista.replaceChildren(
        el(
          'table',
          { classe: 'tabela' },
          el('thead', {}, el('tr', {}, ...cfg.colunas.map((c) => el('th', { scope: 'col', texto: c.titulo })), el('th', { scope: 'col', texto: 'Ações' }))),
          el('tbody', {}, ...itens.map(linha)),
        ),
      );
    } catch (erro) {
      tratarErro(erro, mensagem);
      mostrarEstado(lista, 'erro');
    }
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparMensagem(mensagem);
    limparErrosCampos(form);
    if (!form.checkValidity()) {
      const campos = {};
      for (const campo of form.elements) {
        if (campo.willValidate && !campo.checkValidity()) campos[campo.name] = campo.validationMessage;
      }
      mostrarMensagem(mensagem, 'Revise os campos destacados.');
      mostrarErrosCampos(form, campos);
      return;
    }
    await executarUmaVez(botaoEnviar, 'Salvando…', async () => {
      try {
        const corpo = cfg.lerFormulario(form, editando);
        if (editando) corpo.ativo = form.elements.namedItem('ativo').checked;
        const resposta = editando
          ? await api.put(`${cfg.url}/${editando.id}`, corpo)
          : await api.post(cfg.url, corpo);
        const item = resposta[cfg.chaveItem];
        mostrarMensagem(mensagem, editando ? `Alterações salvas (${cfg.nome} nº ${item.id}).` : `Cadastro concluído (${cfg.nome} nº ${item.id}).`, 'sucesso');
        modoInclusao();
        await carregar();
      } catch (erro) {
        tratarErro(erro, mensagem, form);
      }
    });
  });

  botaoCancelar.addEventListener('click', modoInclusao);

  return {
    async iniciar() {
      modoInclusao();
      if (cfg.antesDeCarregar) {
        try {
          await cfg.antesDeCarregar(form);
        } catch (erro) {
          tratarErro(erro, mensagem);
        }
      }
      await carregar();
    },
    recarregar: carregar,
  };
}
