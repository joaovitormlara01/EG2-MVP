import { iniciarCadastro } from '../cadastro.js';
import { formatarDecimal } from '../formatacao.js';
import { iniciarPagina } from '../layout.js';
import { seloAtivo } from '../rotulos.js';

const usuario = await iniciarPagina({ funcao: 'pontos' });
if (usuario) {
  const coordenada = (texto) => texto.trim().replace(',', '.');
  const cadastro = iniciarCadastro({
    url: '/pontos',
    chaveLista: 'pontos',
    chaveItem: 'ponto',
    nome: 'ponto',
    colunas: [
      { titulo: 'Nome', valor: (p) => p.nome ?? '—' },
      { titulo: 'Endereço', valor: (p) => p.endereco },
      { titulo: 'Coordenadas', valor: (p) => `${formatarDecimal(p.latitude)}; ${formatarDecimal(p.longitude)}` },
      { titulo: 'Situação', valor: (p) => seloAtivo(p.ativo) },
    ],
    preencher(form, p) {
      form.elements.namedItem('nome').value = p.nome ?? '';
      form.elements.namedItem('endereco').value = p.endereco;
      form.elements.namedItem('latitude').value = formatarDecimal(p.latitude);
      form.elements.namedItem('longitude').value = formatarDecimal(p.longitude);
    },
    lerFormulario(form) {
      const v = (c) => form.elements.namedItem(c).value;
      return {
        nome: v('nome').trim() || null, endereco: v('endereco').trim(),
        latitude: coordenada(v('latitude')), longitude: coordenada(v('longitude')),
      };
    },
  });
  await cadastro.iniciar();
}
