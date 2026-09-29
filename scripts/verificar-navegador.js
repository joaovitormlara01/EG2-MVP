/* global document, getComputedStyle -- funções passadas a page.evaluate rodam no navegador */
// Verificação em navegador real (Chrome) — opcional, fora das dependências do projeto.
//   npm i --no-save puppeteer-core     (usa o Chrome já instalado; nada é baixado)
//   node scripts/verificar-navegador.js --modo tempo  → RNF03: tempo até dados/gráficos (12 meses)
//   node scripts/verificar-navegador.js --modo telas --saida pasta → 360 px e desktop: estouro
//        horizontal, violações de CSP, erros de JS, alvos de toque e capturas de tela.
// Variáveis: MEDIR_URL, MEDIR_LOGIN, DEMO_SENHA, MEDIR_FIM, MEDIR_REPETICOES, CHROME_PATH,
//            MOTORISTA_LOGIN (tela de coleta), ROTEIRO_COLETA (id do roteiro para a coleta).

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { modo: { type: 'string', default: 'tempo' }, saida: { type: 'string', default: 'capturas' } } });
let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  console.error('Instale temporariamente: npm i --no-save puppeteer-core');
  process.exit(1);
}

const BASE = process.env.MEDIR_URL || 'http://127.0.0.1:3000';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SENHA = process.env.DEMO_SENHA;
if (!SENHA) {
  console.error('Defina DEMO_SENHA (senha dos usuários de demonstração).');
  process.exit(1);
}
const N = Number(process.env.MEDIR_REPETICOES || 5);
const fim = process.env.MEDIR_FIM || new Date().toISOString().slice(0, 10);
const i0 = new Date(`${fim}T12:00:00Z`);
i0.setUTCDate(i0.getUTCDate() - 364);
const inicio = i0.toISOString().slice(0, 10);

const PERFIS = {
  desktop: { width: 1366, height: 768, deviceScaleFactor: 1 },
  celular360: { width: 360, height: 740, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });

async function novaPagina(viewport, login) {
  const contexto = await navegador.createBrowserContext();
  const pagina = await contexto.newPage();
  await pagina.setViewport(viewport);
  const problemas = [];
  pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(`console: ${m.text()}`); });
  pagina.on('pageerror', (e) => problemas.push(`js: ${e.message}`));
  await pagina.evaluateOnNewDocument(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await pagina.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await pagina.type('#login', login.usuario);
  await pagina.type('#senha', login.senha);
  await Promise.all([pagina.waitForNavigation({ waitUntil: 'networkidle0' }), pagina.click('#form-login button[type=submit]')]);
  return { pagina, contexto, problemas };
}

const admin = { usuario: process.env.MEDIR_LOGIN || 'admin@demo.rotaclara', senha: SENHA };
const quantil = (o, q) => o[Math.min(o.length - 1, Math.ceil(q * o.length) - 1)];

if (args.modo === 'tempo') {
  console.log(`Chrome ${await navegador.version()} · período ${inicio} a ${fim} · ${N} carregamentos por cenário (após 1 aquecimento)\n`);
  console.log('| Cenário | Recorte | Dados recebidos — mediana (ms) | Gráficos exibidos — mín / mediana / máx (ms) |');
  console.log('|---|---|---|---|');
  const cenarios = [['Desktop 1366 px', PERFIS.desktop, 1], ['Celular 360 px', PERFIS.celular360, 1], ['Celular 360 px, CPU 4× mais lenta', PERFIS.celular360, 4]];
  for (const [nome, viewport, cpu] of cenarios) {
    const { pagina, contexto } = await novaPagina(viewport, admin);
    await pagina.emulateCPUThrottling(cpu);
    for (const recorte of ['dia', 'mes', 'periodo']) {
      const exibidos = [];
      const recebidos = [];
      for (let i = 0; i <= N; i += 1) {
        await pagina.goto(`${BASE}/dashboard.html?inicio=${inicio}&fim=${fim}&recorte=${recorte}`, { waitUntil: 'domcontentloaded' });
        await pagina.waitForFunction(() => performance.getEntriesByName('rotaclara:graficos-exibidos').length > 0, { timeout: 60_000 });
        // startTime das marcas é relativo ao início da navegação (inclui HTML, CSS, JS, sessão e API).
        const [r, g] = await pagina.evaluate(() => ['rotaclara:dados-recebidos', 'rotaclara:graficos-exibidos']
          .map((n) => performance.getEntriesByName(n)[0].startTime));
        if (i > 0) { recebidos.push(r); exibidos.push(g); }
      }
      exibidos.sort((a, b) => a - b);
      recebidos.sort((a, b) => a - b);
      const f = (x) => x.toFixed(0);
      console.log(`| ${nome} | ${recorte} | ${f(quantil(recebidos, 0.5))} | ${f(exibidos[0])} / ${f(quantil(exibidos, 0.5))} / ${f(exibidos.at(-1))} |`);
    }
    await contexto.close();
  }
} else {
  const saida = path.resolve(args.saida);
  mkdirSync(saida, { recursive: true });
  const paginas = [
    ['inicio', '/inicio.html'], ['roteiros', `/roteiros.html?data=${fim}`], ['roteiro', `/roteiro.html?id=${process.env.ROTEIRO_COLETA || 1}`],
    ['historico', `/historico.html?inicio=${fim.slice(0, 8)}01&fim=${fim}`], ['dashboard', `/dashboard.html?inicio=${inicio}&fim=${fim}&recorte=mes`],
    ['motoristas', '/motoristas.html'], ['pontos', '/pontos.html'], ['parametros', '/parametros.html'],
    ['auditoria', '/auditoria.html'], ['roteiros-montagem', `/roteiros.html?data=${fim}#secao-montagem`],
  ];
  const conta = [['admin', admin, paginas]];
  if (process.env.MOTORISTA_LOGIN) {
    conta.push(['motorista', { usuario: process.env.MOTORISTA_LOGIN, senha: SENHA }, [
      ['coleta', `/roteiro.html?id=${process.env.ROTEIRO_COLETA || 1}`], ['meus-roteiros', `/roteiros.html?data=${fim}`],
      ['dashboard', `/dashboard.html?inicio=${fim.slice(0, 8)}01&fim=${fim}&recorte=dia`]]]);
  }
  console.log('| Perfil | Viewport | Página | Estouro horizontal | Alvos < 44 px (visíveis) | Problemas (CSP/JS) |');
  console.log('|---|---|---|---|---|---|');
  for (const [nomeViewport, viewport] of Object.entries(PERFIS)) {
    for (const [perfil, login, lista] of conta) {
      const { pagina, contexto, problemas } = await novaPagina(viewport, login);
      for (const [nome, url] of lista) {
        problemas.length = 0;
        await pagina.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 300));
        const medida = await pagina.evaluate(() => {
          const largura = document.documentElement.clientWidth;
          const estouro = document.documentElement.scrollWidth - largura;
          const pequenos = [...document.querySelectorAll('button, a, input, select, textarea')]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              const visivel = r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
              const emTexto = e.tagName === 'A' && e.closest('td, p, figcaption, caption');
              return visivel && !emTexto && e.type !== 'radio' && e.type !== 'checkbox' && r.height < 44;
            })
            .map((e) => `${e.tagName.toLowerCase()}:${(e.textContent || e.id || e.name).trim().slice(0, 20)}(${Math.round(e.getBoundingClientRect().height)})`);
          return { estouro, pequenos };
        });
        await pagina.screenshot({ path: path.join(saida, `${nomeViewport}-${perfil}-${nome}.png`), fullPage: true });
        console.log(`| ${perfil} | ${nomeViewport} | ${nome} | ${medida.estouro > 0 ? `SIM (+${medida.estouro} px)` : 'não'} | ${medida.pequenos.length ? medida.pequenos.join(', ') : '—'} | ${problemas.length ? problemas.join(' / ') : '—'} |`);
      }
      await contexto.close();
    }
  }
}
await navegador.close();
