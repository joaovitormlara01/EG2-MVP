import { api } from '../api.js';
import { el, selecionar } from '../dom.js';
import { formatarData, formatarDataHora, formatarDecimal } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import {
  executarUmaVez, limparErrosCampos, limparMensagem, mostrarErrosCampos, mostrarEstado, mostrarMensagem, tratarErro,
} from '../ui.js';

const usuario = await iniciarPagina({ funcao: 'parametros' });
if (usuario) {
  const mensagem = selecionar('#mensagem');
  const vigente = selecionar('#vigente');
  const versoes = selecionar('#versoes');
  const form = selecionar('#form-parametro');
  const botao = selecionar('button[type="submit"]', form);
  const combustivel = (v) => (v ? `R$ ${formatarDecimal(v)}/L` : 'Não informado');

  async function carregar() {
    mostrarEstado(vigente, 'carregando');
    mostrarEstado(versoes, 'carregando');
    try {
      const dados = await api.get('/parametros');
      const v = dados.vigente;
      vigente.replaceChildren(
        el('dl', { classe: 'resumo' },
          el('div', {}, el('dt', { texto: 'Versão' }), el('dd', { texto: String(v.versao) })),
          el('div', {}, el('dt', { texto: 'Jornada' }), el('dd', { texto: `${v.jornadaMin} min` })),
          el('div', {}, el('dt', { texto: 'Combustível' }), el('dd', { texto: combustivel(v.valorCombustivel) })),
          el('div', {}, el('dt', { texto: 'Vigente desde' }), el('dd', { texto: formatarData(v.vigenteDesde) }))),
      );
      const campoData = form.elements.namedItem('vigenteDesde');
      campoData.min = dados.hoje;
      if (!form.elements.namedItem('jornadaMin').value) form.elements.namedItem('jornadaMin').value = v.jornadaMin;
      versoes.replaceChildren(
        el('table', { classe: 'tabela' },
          el('thead', {}, el('tr', {}, ...['Versão', 'Vigente desde', 'Jornada', 'Combustível', 'Criada por', 'Criada em'].map((t) => el('th', { scope: 'col', texto: t })))),
          el('tbody', {}, ...dados.versoes.map((p) => el('tr', {},
            el('td', { 'data-rotulo': 'Versão', texto: String(p.versao) }),
            el('td', { 'data-rotulo': 'Vigente desde', texto: formatarData(p.vigenteDesde) }),
            el('td', { 'data-rotulo': 'Jornada', texto: `${p.jornadaMin} min` }),
            el('td', { 'data-rotulo': 'Combustível', texto: combustivel(p.valorCombustivel) }),
            el('td', { 'data-rotulo': 'Criada por', texto: p.criadoPor ?? 'Sistema (instalação)' }),
            el('td', { 'data-rotulo': 'Criada em', texto: formatarDataHora(p.criadoEm) }))))),
      );
    } catch (erro) {
      tratarErro(erro, mensagem);
      mostrarEstado(vigente, 'erro');
      mostrarEstado(versoes, 'erro');
    }
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparMensagem(mensagem);
    limparErrosCampos(form);
    const v = (n) => form.elements.namedItem(n).value.trim();
    const campos = {};
    if (!v('vigenteDesde')) campos.vigenteDesde = 'Informe a data de início.';
    if (!/^\d+$/.test(v('jornadaMin'))) campos.jornadaMin = 'Informe minutos inteiros.';
    if (v('valorCombustivel') && !/^\d{1,7}([.,]\d{1,3})?$/.test(v('valorCombustivel'))) campos.valorCombustivel = 'Use até 3 casas decimais.';
    if (Object.keys(campos).length) {
      mostrarMensagem(mensagem, 'Revise os campos destacados.');
      mostrarErrosCampos(form, campos);
      return;
    }
    await executarUmaVez(botao, 'Salvando…', async () => {
      try {
        const r = await api.post('/parametros', {
          vigenteDesde: v('vigenteDesde'),
          jornadaMin: Number(v('jornadaMin')),
          valorCombustivel: v('valorCombustivel') ? v('valorCombustivel').replace(',', '.') : null,
        });
        mostrarMensagem(mensagem,
          `Versão ${r.parametro.versao} criada, vigente a partir de ${formatarData(r.parametro.vigenteDesde)}. Vale para roteiros montados a partir de agora; roteiros existentes mantêm os valores já gravados.`,
          'sucesso');
        form.reset();
        await carregar();
      } catch (erro) {
        tratarErro(erro, mensagem, form);
      }
    });
  });

  await carregar();
}
