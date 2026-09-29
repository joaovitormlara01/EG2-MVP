// Utilitários de interface reutilizáveis: mensagens, estados, erros de campo e envio único.

import { ErroApi } from './api.js';
import { el } from './dom.js';
import { PAGINA_LOGIN } from './sessao.js';

export function mostrarMensagem(elemento, texto, tipo = 'erro') {
  elemento.className = `alerta alerta-${tipo}`;
  elemento.textContent = texto;
}

export function limparMensagem(elemento) {
  elemento.className = 'alerta';
  elemento.textContent = '';
}

// Estados de uma área de conteúdo: carregando, vazio, erro, proibido.
export function mostrarEstado(container, tipo, texto) {
  const padrao = {
    carregando: 'Carregando…',
    vazio: 'Nenhum registro encontrado.',
    erro: 'Não foi possível carregar os dados.',
    proibido: 'Você não tem permissão para acessar esta área.',
  };
  container.replaceChildren(
    el('p', {
      classe: `estado${tipo === 'erro' || tipo === 'proibido' ? ' estado-erro' : ''}`,
      role: tipo === 'carregando' ? 'status' : undefined,
      texto: texto ?? padrao[tipo],
    }),
  );
}

// Espera a convenção: <input id="x"> + <span id="x-erro" class="campo-erro">.
export function limparErrosCampos(formulario) {
  for (const campo of formulario.querySelectorAll('[aria-invalid]')) {
    campo.removeAttribute('aria-invalid');
  }
  for (const erro of formulario.querySelectorAll('.campo-erro')) {
    erro.textContent = '';
  }
}

export function mostrarErrosCampos(formulario, campos) {
  let primeiro = null;
  for (const [nome, mensagem] of Object.entries(campos ?? {})) {
    const campo = formulario.elements.namedItem(nome);
    const erro = formulario.querySelector(`#${CSS.escape(formulario.id ? `${formulario.id}-${nome}` : nome)}-erro`)
      ?? formulario.querySelector(`#${CSS.escape(nome)}-erro`);
    if (!erro) continue;
    campo?.setAttribute?.('aria-invalid', 'true');
    erro.textContent = mensagem;
    primeiro ??= campo?.focus ? campo : erro;
  }
  primeiro?.focus?.();
  return primeiro !== null;
}

export function definirOcupado(botao, ocupado, textoOcupado = 'Aguarde…') {
  if (ocupado) {
    botao.dataset.textoOriginal = botao.textContent;
    botao.textContent = textoOcupado;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
  } else {
    botao.textContent = botao.dataset.textoOriginal ?? botao.textContent;
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  }
}

// Mensagem adequada para cada tipo de falha. 401 leva ao login.
export function descreverErro(erro) {
  if (!(erro instanceof ErroApi)) return 'Erro inesperado. Recarregue a página.';
  if (erro.status === 401 && erro.codigo === 'NAO_AUTENTICADO') {
    window.location.replace(PAGINA_LOGIN);
    return 'Sessão expirada. Redirecionando para o login…';
  }
  if (erro.status === 0) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  if (erro.status === 403 && erro.codigo === 'PROIBIDO') return 'Você não tem permissão para esta operação.';
  return erro.message;
}

export function tratarErro(erro, mensagem, formulario) {
  mostrarMensagem(mensagem, descreverErro(erro));
  if (formulario && erro instanceof ErroApi) mostrarErrosCampos(formulario, erro.campos);
  mensagem.scrollIntoView?.({ block: 'nearest' });
}

// Executa a ação uma única vez por vez: o botão fica desabilitado até a resposta,
// evitando envios duplicados por clique repetido.
export async function executarUmaVez(botao, textoOcupado, acao) {
  if (botao.disabled) return undefined;
  definirOcupado(botao, true, textoOcupado);
  try {
    return await acao();
  } finally {
    if (botao.isConnected) definirOcupado(botao, false);
  }
}
