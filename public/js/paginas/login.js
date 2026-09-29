import { entrar, PAGINA_INICIAL, usuarioAtual } from '../sessao.js';
import {
  definirOcupado,
  limparErrosCampos,
  limparMensagem,
  mostrarErrosCampos,
  mostrarMensagem,
} from '../ui.js';

const formulario = document.querySelector('#form-login');
const mensagem = document.querySelector('#mensagem');
const botaoEnviar = formulario.querySelector('button[type="submit"]');
const campoSenha = formulario.elements.namedItem('senha');
const alternarSenha = document.querySelector('#alternar-senha');

// Já autenticado: vai direto para o início.
usuarioAtual()
  .then((usuario) => {
    if (usuario) window.location.replace(PAGINA_INICIAL);
  })
  .catch(() => {});

alternarSenha.addEventListener('click', () => {
  const mostrando = campoSenha.type === 'text';
  campoSenha.type = mostrando ? 'password' : 'text';
  alternarSenha.textContent = mostrando ? 'Mostrar' : 'Ocultar';
  alternarSenha.setAttribute('aria-pressed', String(!mostrando));
});

function validar(dados) {
  const campos = {};
  if (!dados.login) campos.login = 'Informe seu e-mail ou documento.';
  if (!dados.senha) campos.senha = 'Informe sua senha.';
  return campos;
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limparMensagem(mensagem);
  limparErrosCampos(formulario);

  const dados = {
    login: formulario.elements.namedItem('login').value.trim(),
    senha: campoSenha.value,
  };
  const campos = validar(dados);
  if (mostrarErrosCampos(formulario, campos)) return;

  definirOcupado(botaoEnviar, true, 'Entrando…');
  try {
    await entrar(dados.login, dados.senha);
    window.location.replace(PAGINA_INICIAL);
  } catch (erro) {
    campoSenha.value = '';
    mostrarMensagem(mensagem, erro.message);
    if (erro.campos) mostrarErrosCampos(formulario, erro.campos);
    definirOcupado(botaoEnviar, false);
  }
});
