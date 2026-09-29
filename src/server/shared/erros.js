// Erros de aplicação com código estável e mensagem em português.
// Formato de resposta: { "erro": { "codigo", "mensagem", "campos"? } }

export class ErroAplicacao extends Error {
  constructor(status, codigo, mensagem, campos) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export const erros = {
  validacao: (mensagem, campos) => new ErroAplicacao(400, 'VALIDACAO', mensagem, campos),
  naoAutenticado: (mensagem = 'Autenticação necessária.') =>
    new ErroAplicacao(401, 'NAO_AUTENTICADO', mensagem),
  credenciaisInvalidas: () =>
    new ErroAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'Usuário ou senha inválidos.'),
  usuarioInativo: () =>
    new ErroAplicacao(
      403,
      'USUARIO_INATIVO',
      'Usuário inativo. Procure o administrador do sistema.',
    ),
  proibido: (mensagem = 'Você não tem permissão para esta operação.') =>
    new ErroAplicacao(403, 'PROIBIDO', mensagem),
  naoEncontrado: (mensagem = 'Recurso não encontrado.') =>
    new ErroAplicacao(404, 'NAO_ENCONTRADO', mensagem),
  conflito: (mensagem, campos) => new ErroAplicacao(409, 'CONFLITO', mensagem, campos),
  versaoDesatualizada: () =>
    new ErroAplicacao(
      409,
      'VERSAO_DESATUALIZADA',
      'O roteiro foi alterado por outra pessoa. Recarregue a página e tente novamente.',
    ),
  origemInvalida: () =>
    new ErroAplicacao(403, 'ORIGEM_INVALIDA', 'Requisição de outra origem não permitida.'),
  regraNegocio: (mensagem, campos) => new ErroAplicacao(422, 'REGRA_NEGOCIO', mensagem, campos),
};

export function corpoErro(codigo, mensagem, campos) {
  const erro = { codigo, mensagem };
  if (campos) erro.campos = campos;
  return { erro };
}

// Converte erros de validação de esquema do Fastify para o formato padrão.
function camposDaValidacao(validacao) {
  const campos = {};
  for (const item of validacao) {
    const caminho =
      item.params?.missingProperty ||
      item.instancePath.replace(/^\//, '').replaceAll('/', '.') ||
      'corpo';
    campos[caminho] ??= 'Valor inválido.';
    if (item.keyword === 'required') campos[caminho] = 'Campo obrigatório.';
  }
  return campos;
}

// Violações de unicidade do banco (23505) viram 409 com o campo correspondente.
const RESTRICOES_UNICAS = {
  usuario_email_unico: ['email', 'E-mail já cadastrado.'],
  motorista_documento_unico: ['documento', 'Documento já cadastrado.'],
  veiculo_placa_unica: ['placa', 'Placa já cadastrada.'],
  equipe_nome_unico: ['nome', 'Já existe uma equipe com este nome.'],
  roteiro_ponto_ordem_unica: ['pontoIds', 'Ordem de ponto repetida no roteiro.'],
};

function erroDoBanco(erro) {
  if (erro.code === '23505') {
    const [campo, mensagem] = RESTRICOES_UNICAS[erro.constraint] ?? [null, 'Registro duplicado.'];
    return erros.conflito(mensagem, campo ? { [campo]: mensagem } : undefined);
  }
  // Mensagens dos gatilhos do projeto já são em português; demais restrições ficam genéricas.
  if (erro.code === '23514' || erro.code === '23503') {
    const propria = /^Roteiro \d+/.test(erro.message ?? '');
    return erros.regraNegocio(propria ? erro.message : 'Os dados violam uma regra de integridade.');
  }
  if (erro.code === '40001' || erro.code === '40P01') {
    return new ErroAplicacao(409, 'CONCORRENCIA', 'Outra alteração ocorreu ao mesmo tempo. Tente novamente.');
  }
  return null;
}

export function tratadorDeErros(erro, requisicao, resposta) {
  const doBanco = typeof erro.code === 'string' && /^[0-9A-Z]{5}$/.test(erro.code) ? erroDoBanco(erro) : null;
  if (doBanco) erro = doBanco;
  if (erro instanceof ErroAplicacao) {
    return resposta.status(erro.status).send(corpoErro(erro.codigo, erro.message, erro.campos));
  }
  if (erro.validation) {
    return resposta
      .status(400)
      .send(corpoErro('VALIDACAO', 'Dados inválidos.', camposDaValidacao(erro.validation)));
  }
  if (erro.statusCode === 429) {
    return resposta
      .status(429)
      .send(corpoErro('MUITAS_TENTATIVAS', 'Muitas tentativas. Aguarde e tente novamente.'));
  }
  if (erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500) {
    return resposta
      .status(erro.statusCode)
      .send(corpoErro('REQUISICAO_INVALIDA', 'Requisição inválida.'));
  }
  requisicao.log.error({ err: erro }, 'Erro interno');
  return resposta.status(500).send(corpoErro('ERRO_INTERNO', 'Erro interno. Tente novamente.'));
}
