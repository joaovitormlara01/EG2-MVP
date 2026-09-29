// Monta a aplicação: API em /api/v1 e frontend estático na mesma origem.

import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRepositorioAuth } from './modules/auth/repositorio.js';
import { rotasAuth } from './modules/auth/rotas.js';
import { criarServicoAuth } from './modules/auth/servico.js';
import { rotasCadastros } from './modules/cadastros/rotas.js';
import { criarServicoCadastros } from './modules/cadastros/servico.js';
import { rotasAuditoria } from './modules/auditoria/rotas.js';
import { rotasConsultas } from './modules/consultas/rotas.js';
import { criarServicoConsultas } from './modules/consultas/servico.js';
import { rotasHealth } from './modules/health/rotas.js';
import { rotasParametros } from './modules/parametros/rotas.js';
import { criarServicoParametros } from './modules/parametros/servico.js';
import { rotasPontos } from './modules/pontos/rotas.js';
import { criarServicoPontos } from './modules/pontos/servico.js';
import { rotasRoteiros } from './modules/roteiros/rotas.js';
import { criarServicoRoteiros } from './modules/roteiros/servico.js';
import { segurancaApi } from './plugins/seguranca-api.js';
import { corpoErro, tratadorDeErros } from './shared/erros.js';

const PASTA_PUBLICA = fileURLToPath(new URL('../../public/', import.meta.url));
const PASTA_CHARTJS = path.dirname(createRequire(import.meta.url).resolve('chart.js'));

/**
 * @param {object} opcoes
 * @param {object} opcoes.config        resultado de carregarConfig()
 * @param {object} opcoes.pool          pg.Pool (ou objeto com query())
 * @param {object} [opcoes.repositorios] substitui repositórios (testes)
 * @param {Function} [opcoes.agora]       relógio do servidor (testes)
 * @param {Function} [opcoes.rotasAdicionais] registra rotas extras no escopo /api/v1 (testes)
 */
export async function construirApp({ config, pool, repositorios = {}, rotasAdicionais, agora }) {
  const app = Fastify({
    logger: { level: config.logNivel },
    trustProxy: config.ambiente === 'production',
    // Não aceita text/plain nem outros formatos no corpo; só JSON.
    bodyLimit: 1024 * 1024,
    // Campos não previstos no esquema são rejeitados (400), não descartados em silêncio.
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.removeContentTypeParser('text/plain');

  app.setErrorHandler(tratadorDeErros);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.cookieSeguro ? [] : null,
      },
    },
  });

  const servicoAuth = criarServicoAuth({
    repositorio: repositorios.auth ?? criarRepositorioAuth(pool),
    sessaoDuracaoMin: config.sessaoDuracaoMin,
  });

  await app.register(
    async (api) => {
      await segurancaApi(api, { servicoAuth, config });
      await api.register(rotasHealth, { pool });
      await api.register(rotasAuth, { servicoAuth });
      const contexto = { pool, fusoHorario: config.fusoHorario, ...(agora ? { agora } : {}) };
      await api.register(rotasCadastros, { servico: criarServicoCadastros(contexto) });
      await api.register(rotasPontos, { servico: criarServicoPontos(contexto) });
      await api.register(rotasParametros, { servico: criarServicoParametros(contexto) });
      await api.register(rotasRoteiros, { servico: criarServicoRoteiros(contexto) });
      await api.register(rotasConsultas, { servico: criarServicoConsultas(contexto) });
      await api.register(rotasAuditoria, contexto);
      if (rotasAdicionais) await api.register(rotasAdicionais);
    },
    { prefix: '/api/v1' },
  );

  // Frontend: HTML, CSS e módulos JS servidos sem etapa de build.
  await app.register(fastifyStatic, { root: PASTA_PUBLICA, index: ['index.html'] });
  // Chart.js (build UMD) servido a partir de node_modules, na mesma origem.
  await app.register(fastifyStatic, {
    root: PASTA_CHARTJS,
    prefix: '/vendor/chart.js/',
    decorateReply: false,
    allowedPath: (caminho) => caminho === '/chart.umd.min.js',
  });

  app.setNotFoundHandler((requisicao, resposta) => {
    if (requisicao.url.startsWith('/api/')) {
      return resposta.status(404).send(corpoErro('NAO_ENCONTRADO', 'Rota não encontrada.'));
    }
    return resposta.status(404).type('text/html; charset=utf-8').sendFile('404.html');
  });

  return app;
}
