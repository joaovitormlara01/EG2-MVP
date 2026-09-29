import { api } from '../api.js';
import { iniciarCadastro } from '../cadastro.js';
import { el, preencherSelect } from '../dom.js';
import { iniciarPagina } from '../layout.js';
import { seloAtivo } from '../rotulos.js';

const usuario = await iniciarPagina({ funcao: 'motoristas' });
if (usuario) {
  const cadastro = iniciarCadastro({
    url: '/motoristas',
    chaveLista: 'motoristas',
    chaveItem: 'motorista',
    nome: 'motorista',
    colunas: [
      { titulo: 'Nome', valor: (m) => m.nome },
      { titulo: 'Documento', valor: (m) => m.documento },
      { titulo: 'Equipe', valor: (m) => m.equipeNome },
      { titulo: 'Veículo', valor: (m) => m.veiculoPlaca ?? 'Sem veículo' },
      { titulo: 'Situação', valor: (m) => seloAtivo(m.ativo) },
    ],
    async antesDeCarregar(form) {
      // O gerente só recebe as próprias equipes; o servidor valida de novo ao salvar.
      const [{ equipes }, { veiculos }] = await Promise.all([api.get('/equipes'), api.get('/veiculos?ativos=true')]);
      preencherSelect(form.elements.namedItem('equipeId'), equipes.filter((e) => e.ativo), {
        valor: (e) => e.id, rotulo: (e) => e.nome, vazio: 'Selecione a equipe',
      });
      preencherSelect(form.elements.namedItem('veiculoId'), veiculos, {
        valor: (v) => v.id, rotulo: (v) => `${v.placa}${v.descricao ? ` — ${v.descricao}` : ''}`, vazio: 'Sem veículo',
      });
    },
    aoMudarModo(form, item) {
      form.elements.namedItem('senha').required = !item;
    },
    preencher(form, m) {
      for (const campo of ['nome', 'documento', 'telefone', 'email']) form.elements.namedItem(campo).value = m[campo] ?? '';
      const garantirOpcao = (nome, id, texto) => {
        const select = form.elements.namedItem(nome);
        if (id && ![...select.options].some((o) => o.value === String(id))) select.append(el('option', { value: id, texto }));
        select.value = id ?? '';
      };
      garantirOpcao('equipeId', m.equipeId, m.equipeNome);
      garantirOpcao('veiculoId', m.veiculoId, m.veiculoPlaca);
    },
    lerFormulario(form, editando) {
      const v = (c) => form.elements.namedItem(c).value.trim();
      const corpo = {
        nome: v('nome'), documento: v('documento'), telefone: v('telefone') || null, email: v('email') || null,
        equipeId: Number(v('equipeId')), veiculoId: v('veiculoId') ? Number(v('veiculoId')) : null,
      };
      const senha = form.elements.namedItem('senha').value;
      if (senha || !editando) corpo.senha = senha;
      return corpo;
    },
  });
  await cadastro.iniciar();
}
