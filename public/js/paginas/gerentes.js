import { iniciarCadastro } from '../cadastro.js';
import { iniciarPagina } from '../layout.js';
import { seloAtivo } from '../rotulos.js';

const usuario = await iniciarPagina({ funcao: 'gerentes' });
if (usuario) {
  const cadastro = iniciarCadastro({
    url: '/gerentes',
    chaveLista: 'gerentes',
    chaveItem: 'gerente',
    nome: 'gerente',
    colunas: [
      { titulo: 'Nome', valor: (g) => g.nome },
      { titulo: 'E-mail', valor: (g) => g.email },
      { titulo: 'Telefone', valor: (g) => g.telefone ?? '—' },
      { titulo: 'Equipes', valor: (g) => (g.equipes.length ? g.equipes.map((e) => e.nome).join(', ') : 'Nenhuma') },
      { titulo: 'Situação', valor: (g) => seloAtivo(g.ativo) },
    ],
    aoMudarModo(form, item) {
      form.elements.namedItem('senha').required = !item;
    },
    preencher(form, g) {
      for (const campo of ['nome', 'email', 'telefone']) form.elements.namedItem(campo).value = g[campo] ?? '';
    },
    lerFormulario(form, editando) {
      const v = (c) => form.elements.namedItem(c).value.trim();
      const corpo = { nome: v('nome'), email: v('email'), telefone: v('telefone') || null };
      const senha = form.elements.namedItem('senha').value;
      if (senha || !editando) corpo.senha = senha;
      return corpo;
    },
  });
  await cadastro.iniciar();
}
