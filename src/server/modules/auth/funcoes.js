// Funções apresentadas após o login (UC01, passo 3), derivadas da política de acesso.
// O menu é só apresentação: cada rota continua verificando a permissão no servidor.
// Só entram funções com página implementada. A exportação fica dentro do histórico.

import { pode } from '../../shared/autorizacao.js';

const FUNCOES = [
  { id: 'roteiros', titulo: 'Meus roteiros', pagina: '/roteiros.html', perfis: ['motorista'] },
  { id: 'roteiros', titulo: 'Roteiros', pagina: '/roteiros.html', acao: 'roteiro.gerir' },
  { id: 'historico', titulo: 'Histórico', pagina: '/historico.html', acao: 'historico.consultar' },
  { id: 'dashboard', titulo: 'Dashboard', pagina: '/dashboard.html', acao: 'dashboard.consultar' },
  { id: 'motoristas', titulo: 'Motoristas', pagina: '/motoristas.html', acao: 'motorista.gerir' },
  { id: 'veiculos', titulo: 'Veículos', pagina: '/veiculos.html', acao: 'veiculo.gerir' },
  { id: 'pontos', titulo: 'Pontos', pagina: '/pontos.html', acao: 'ponto.gerir' },
  { id: 'equipes', titulo: 'Equipes', pagina: '/equipes.html', acao: 'equipe.gerir' },
  { id: 'gerentes', titulo: 'Gerentes', pagina: '/gerentes.html', acao: 'gerente.gerir' },
  { id: 'parametros', titulo: 'Parâmetros', pagina: '/parametros.html', acao: 'parametros.alterar' },
  { id: 'auditoria', titulo: 'Auditoria', pagina: '/auditoria.html', acao: 'auditoria.consultar' },
];

export function funcoesDoUsuario(usuario) {
  // Ações que dependem de equipe: considera a primeira equipe do usuário.
  const recurso = { equipeId: usuario.equipeIds[0] };
  return FUNCOES.filter((f) =>
    f.perfis ? f.perfis.includes(usuario.perfil) : pode(usuario, f.acao, recurso),
  ).map(({ id, titulo, pagina }) => ({ id, titulo, pagina }));
}
