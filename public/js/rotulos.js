// Textos e selos de exibição em português para valores vindos da API.

import { el } from './dom.js';
import { SITUACOES_ROTEIRO } from './formatacao.js';

export const ROTULOS_PERFIL = Object.freeze({
  motorista: 'Motorista / motoboy',
  gerente: 'Gerente / coordenador',
  admin: 'Administrador',
});

export function rotuloPerfil(perfil) {
  return ROTULOS_PERFIL[perfil] ?? perfil;
}

// genero: 'o' (Ativo/Inativo) ou 'a' (Ativa/Inativa)
export function seloAtivo(ativo, genero = 'o') {
  return el('span', {
    classe: ativo ? 'selo selo-encerrado' : 'selo selo-inativo',
    texto: ativo ? `Ativ${genero}` : `Inativ${genero}`,
  });
}

export function seloSituacao(situacao) {
  return el('span', { classe: `selo selo-${situacao}`, texto: SITUACOES_ROTEIRO[situacao] ?? situacao });
}
