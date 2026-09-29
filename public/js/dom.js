// Criação de elementos com texto sempre tratado como texto (nunca HTML): dados vindos da API
// ou digitados pelo usuário não são interpretados pelo navegador.

export function el(tag, props = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'classe') elemento.className = valor;
    else if (chave === 'texto') elemento.textContent = valor;
    else if (chave === 'dados') Object.assign(elemento.dataset, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') {
      elemento.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else if (valor === true) elemento.setAttribute(chave, '');
    else elemento.setAttribute(chave, String(valor));
  }
  elemento.append(...filhos.flat().filter((f) => f !== null && f !== undefined && f !== false));
  return elemento;
}

export function selecionar(seletor, raiz = document) {
  const elemento = raiz.querySelector(seletor);
  if (!elemento) throw new Error(`Elemento não encontrado: ${seletor}`);
  return elemento;
}

// Preenche um <select> com opções; `vazio` adiciona a primeira opção sem valor.
export function preencherSelect(select, itens, { valor, rotulo, vazio, selecionado } = {}) {
  const opcoes = itens.map((item) =>
    el('option', { value: valor(item), texto: rotulo(item) }),
  );
  if (vazio !== undefined) opcoes.unshift(el('option', { value: '', texto: vazio }));
  select.replaceChildren(...opcoes);
  if (selecionado !== undefined && selecionado !== null) select.value = String(selecionado);
}

// Identificador único para envio idempotente (funciona também fora de contexto seguro).
export function gerarChave() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // contexto não seguro: segue para a alternativa
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
