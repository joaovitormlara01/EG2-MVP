// npm run check — verifica a sintaxe de todo JavaScript do projeto com `node --check`
// (substitui a checagem de tipos do TypeScript) e confere que o frontend só importa
// módulos relativos existentes, já que não há etapa de build.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PASTAS = ['src', 'public', 'scripts', 'tests'];

function listarJs(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return listarJs(caminho);
    return nome.endsWith('.js') ? [caminho] : [];
  });
}

const arquivos = PASTAS.flatMap((p) => listarJs(path.join(RAIZ, p)));
const falhas = [];

for (const arquivo of arquivos) {
  const resultado = spawnSync(process.execPath, ['--check', arquivo], { encoding: 'utf8' });
  if (resultado.status !== 0) falhas.push(`${path.relative(RAIZ, arquivo)}\n${resultado.stderr}`);
}

// Frontend: imports devem ser relativos, terminar em .js e apontar para arquivo existente.
const PADRAO_IMPORT = /\bimport\s[^'"]*?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const arquivo of listarJs(path.join(RAIZ, 'public'))) {
  const codigo = readFileSync(arquivo, 'utf8');
  for (const [, estatico, dinamico] of codigo.matchAll(PADRAO_IMPORT)) {
    const especificador = estatico ?? dinamico;
    const relativo = path.relative(RAIZ, arquivo);
    if (!especificador.startsWith('./') && !especificador.startsWith('../')) {
      falhas.push(`${relativo}: import "${especificador}" não é relativo (sem build no frontend).`);
    } else if (!existsSync(path.resolve(path.dirname(arquivo), especificador))) {
      falhas.push(`${relativo}: import "${especificador}" não encontrado.`);
    }
  }
}

if (falhas.length) {
  console.error(falhas.join('\n'));
  console.error(`\n${falhas.length} problema(s) em ${arquivos.length} arquivo(s).`);
  process.exit(1);
}
console.log(`Sintaxe OK em ${arquivos.length} arquivo(s) JavaScript.`);
