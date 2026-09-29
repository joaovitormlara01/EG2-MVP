// npm run medir:api — mede o tempo de resposta HTTP das consultas de 12 meses (RNF03/CT09).
// Pré-requisito: servidor rodando (npm start) sobre um banco gerado por `npm run dados:desempenho`.
// Variáveis: MEDIR_URL (padrão http://127.0.0.1:3000), MEDIR_LOGIN (padrão admin@demo.rotaclara),
// DEMO_SENHA, MEDIR_REPETICOES (padrão 10), MEDIR_FIM (padrão: hoje).
// Método: 1 aquecimento + N medições sequenciais por consulta, do envio ao último byte recebido.

import os from 'node:os';

if (!process.env.DEMO_SENHA) throw new Error('Defina DEMO_SENHA (senha dos usuários de demonstração).');
const BASE = process.env.MEDIR_URL || 'http://127.0.0.1:3000';
const N = Number(process.env.MEDIR_REPETICOES || 10);
const fim = process.env.MEDIR_FIM || new Date().toISOString().slice(0, 10);
const inicioDate = new Date(`${fim}T12:00:00Z`);
inicioDate.setUTCDate(inicioDate.getUTCDate() - 364);
const inicio = inicioDate.toISOString().slice(0, 10);

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: process.env.MEDIR_LOGIN || 'admin@demo.rotaclara', senha: process.env.DEMO_SENHA }),
});
if (!login.ok) throw new Error(`Login falhou: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];

const consultas = [
  ['Dashboard 12 meses — por dia', `/api/v1/dashboard?inicio=${inicio}&fim=${fim}&recorte=dia`],
  ['Dashboard 12 meses — por mês', `/api/v1/dashboard?inicio=${inicio}&fim=${fim}&recorte=mes`],
  ['Dashboard 12 meses — período', `/api/v1/dashboard?inicio=${inicio}&fim=${fim}&recorte=periodo`],
  ['Histórico 12 meses — 1ª página (50)', `/api/v1/historico?inicio=${inicio}&fim=${fim}&pagina=1&tamanho=50`],
  ['CSV 12 meses — arquivo completo', `/api/v1/relatorios/historico.csv?inicio=${inicio}&fim=${fim}`],
];

const quantil = (ordenado, q) => ordenado[Math.min(ordenado.length - 1, Math.ceil(q * ordenado.length) - 1)];

console.log(`Ambiente: ${os.cpus()[0].model} (${os.cpus().length} threads), ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM, ${os.type()} ${os.release()}, Node ${process.version}`);
console.log(`Período: ${inicio} a ${fim} · ${N} medições após 1 aquecimento\n`);
console.log('| Consulta | Tamanho | mín (ms) | mediana (ms) | p95 (ms) | máx (ms) |');
console.log('|---|---|---|---|---|---|');
for (const [nome, caminho] of consultas) {
  const tempos = [];
  let bytes = 0;
  for (let i = 0; i <= N; i += 1) {
    const t0 = performance.now();
    const r = await fetch(`${BASE}${caminho}`, { headers: { cookie } });
    const corpo = await r.arrayBuffer();
    const t = performance.now() - t0;
    if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
    bytes = corpo.byteLength;
    if (i > 0) tempos.push(t);
  }
  tempos.sort((a, b) => a - b);
  const f = (x) => x.toFixed(0);
  console.log(`| ${nome} | ${(bytes / 1024).toFixed(0)} KiB | ${f(tempos[0])} | ${f(quantil(tempos, 0.5))} | ${f(quantil(tempos, 0.95))} | ${f(tempos.at(-1))} |`);
}
