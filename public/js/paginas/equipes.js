import { api } from '../api.js';
import { iniciarCadastro } from '../cadastro.js';
import { el, preencherSelect } from '../dom.js';
import { iniciarPagina } from '../layout.js';
import { seloAtivo } from '../rotulos.js';

const usuario = await iniciarPagina({ funcao: 'equipes' });
if (usuario) {
  const cadastro = iniciarCadastro({
    url: '/equipes',
    chaveLista: 'equipes',
    chaveItem: 'equipe',
    nome: 'equipe',
    colunas: [
      { titulo: 'Equipe', valor: (e) => e.nome },
      { titulo: 'Gerente', valor: (e) => e.gerenteNome ?? 'Sem gerente' },
      { titulo: 'Motoristas', valor: (e) => e.totalMotoristas },
      { titulo: 'Situação', valor: (e) => seloAtivo(e.ativo, 'a') },
    ],
    async antesDeCarregar(form) {
      const { gerentes } = await api.get('/gerentes');
      preencherSelect(form.elements.namedItem('gerenteId'), gerentes.filter((g) => g.ativo), {
        valor: (g) => g.id, rotulo: (g) => `${g.nome} (${g.email})`, vazio: 'Sem gerente',
      });
    },
    preencher(form, e) {
      form.elements.namedItem('nome').value = e.nome;
      const select = form.elements.namedItem('gerenteId');
      // Mantém o gerente atual como opção mesmo que esteja inativo.
      if (e.gerenteId && ![...select.options].some((o) => o.value === String(e.gerenteId))) {
        select.append(el('option', { value: e.gerenteId, texto: `${e.gerenteNome} (inativo)` }));
      }
      select.value = e.gerenteId ?? '';
    },
    lerFormulario(form) {
      const gerenteId = form.elements.namedItem('gerenteId').value;
      return { nome: form.elements.namedItem('nome').value.trim(), gerenteId: gerenteId ? Number(gerenteId) : null };
    },
  });
  await cadastro.iniciar();
}
