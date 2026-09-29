import { iniciarCadastro } from '../cadastro.js';
import { formatarDecimal } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { seloAtivo } from '../rotulos.js';

const usuario = await iniciarPagina({ funcao: 'veiculos' });
if (usuario) {
  const cadastro = iniciarCadastro({
    url: '/veiculos',
    chaveLista: 'veiculos',
    chaveItem: 'veiculo',
    nome: 'veículo',
    colunas: [
      { titulo: 'Placa', valor: (v) => v.placa },
      { titulo: 'Descrição', valor: (v) => v.descricao ?? '—' },
      { titulo: 'Rendimento', valor: (v) => `${formatarDecimal(v.rendimentoKmL, 2)} km/l` },
      { titulo: 'Situação', valor: (v) => seloAtivo(v.ativo) },
    ],
    preencher(form, v) {
      form.elements.namedItem('placa').value = v.placa;
      form.elements.namedItem('descricao').value = v.descricao ?? '';
      form.elements.namedItem('rendimentoKmL').value = formatarDecimal(v.rendimentoKmL, 2);
    },
    lerFormulario(form) {
      const v = (c) => form.elements.namedItem(c).value.trim();
      return { placa: v('placa'), descricao: v('descricao') || null, rendimentoKmL: v('rendimentoKmL').replace(',', '.') };
    },
  });
  await cadastro.iniciar();
}
