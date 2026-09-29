# Relatório de aceite e desempenho — RotaClara (29/09/2026)

Resultados obtidos nesta data. Onde algo não foi executado ou não foi comprovado, está dito.

## 1. Testes automatizados

Comando: `npm run verificar` (verificação de sintaxe + ESLint + Vitest).

| Situação | Arquivos | Testes | Resultado |
|---|---|---|---|
| Com `TEST_DATABASE_URL` (PostgreSQL 17.6 isolado, recriado do zero) | 9 | 121 | **121 aprovados, 0 falhas, 0 pulados** |
| Sem `TEST_DATABASE_URL` | 9 (6 executados, 3 pulados) | 121 | **60 aprovados, 61 pulados** (testes de integração) |

Cobertura: unidade (cálculos, autorização, senha/token, CSV, configuração, migrações), HTTP sem
banco (autenticação, autorização, CSRF/origem, CORS, arquivos estáticos, RN05) e integração com
PostgreSQL (restrições, cadastros, montagem, coleta, correções em qualquer ordem, parâmetros,
histórico, dashboard, CSV, auditoria, persistência após reinício, fluxo completo). Mapeamento por
requisito: `rastreabilidade.md`.

## 2. Critérios CT01–CT10

| CT | Resultado | Evidência principal |
|---|---|---|
| CT01 | Aprovado | Partida 08:00–08:20 = 0; 09:00–09:15 = 15 min; total 15 (testes e demonstração) |
| CT02 | Aprovado | 15 + 10 + 50 = 75 min; 15,625% de 480 |
| CT03 | Aprovado | Somas de dia = mês = período |
| CT04 | Aprovado | Endereço histórico, data, chegada, saída e duração no histórico e no CSV |
| CT05 | Aprovado | 420 min a partir de uma data: 75 min = 17,857%; dias anteriores mantêm 480 |
| CT06 | Aprovado | R$ 6,00; 12 km/l; 120 km → R$ 0,5000/km e R$ 60,00 |
| CT07 | Aprovado | Saída antes da chegada: 422 e restrição no banco |
| CT08 | Aprovado | Correção com usuário, data/hora, antes/depois e motivo; registro imutável |
| **CT09** | **Parcial — não comprovado de forma incondicional** | Desktop e celular 360 px: todas as medições < 1 s. Celular com CPU 4× mais lenta: excede 3 s (seção 3) |
| CT10 | Aprovado | Motorista e gerente recebem 403; tela "Acesso negado" |

## 3. Desempenho (RNF03 / CT09)

**Ambiente (tudo na mesma máquina, sem latência de rede real):** notebook Intel Core 7 150U
(12 threads), 15,7 GiB RAM, Windows 11 Pro (10.0.26200), Node.js 24.19.0, PostgreSQL 17.6 (cluster
isolado, configuração padrão), Chrome 154 headless via `puppeteer-core`, servidor em
`NODE_ENV=production`. A máquina mostrou **variação alta entre execuções** (mesmo código e mesma
massa: diferenças de até ~1 s no cenário de CPU reduzida).

**Massa reprodutível:** `npm run dados:desempenho -- --fim 2026-09-29` (semente 20260929) em banco
vazio: 12 meses, 50 motoristas, 5 equipes, 150 pontos, **15.169 roteiros** e **128.970
ocorrências**, duas versões de parâmetros. Perfil **administrador** (todos os dados), 30/09/2025 a
29/09/2026.

### 3.1 API (HTTP, envio → último byte; 1 aquecimento + 10 medições) — `npm run medir:api`

| Consulta | Tamanho | Sessão 1: mediana / máx | Sessão 2: mín / mediana / p95 / máx |
|---|---|---|---|
| Dashboard — por dia | 85 KiB | 98 / 135 ms | 119 / 132 / 180 / 180 ms |
| Dashboard — por mês | 7 KiB | 103 / 204 ms | 121 / 144 / 174 / 174 ms |
| Dashboard — período | 4 KiB | 133 / 159 ms | 178 / 187 / 235 / 235 ms |
| Histórico — 1ª página | 16 KiB | 85 / 100 ms | 100 / 105 / 120 / 120 ms |
| CSV completo 12 meses | 20,8 MB | 6.202 / 6.589 ms | 6.041 / 9.394 / 10.457 / 10.457 ms |

### 3.2 Navegador: início da navegação → dados e 3 gráficos exibidos (1 aquecimento + 10 carregamentos)

Medido com `scripts/verificar-navegador.js --modo tempo` (marca `rotaclara:graficos-exibidos`).
Valores: **mín / mediana / máx** em ms.

| Cenário | Recorte | Sessão 1 (etapa 10) | Sessão 2 — antes da otimização | Sessão 2 — depois (execução A) | Sessão 2 — depois (execução B) |
|---|---|---|---|---|---|
| Desktop 1366 px | dia | 358 / 382 / 477 | 456 / 508 / 816 | 400 / 465 / 494 | 504 / 521 / 575 |
| Desktop 1366 px | mês | 342 / 359 / 472 | 457 / 474 / 606 | 410 / 422 / 455 | 456 / 481 / 523 |
| Desktop 1366 px | período | 343 / 378 / 425 | 429 / 475 / 564 | 394 / 413 / 470 | 452 / 494 / 585 |
| Celular 360 px | dia | 404 / 415 / 527 | 496 / 531 / 597 | 433 / 453 / 482 | 518 / 525 / 572 |
| Celular 360 px | mês | 367 / 390 / 443 | 445 / 463 / 568 | 382 / 420 / 548 | 472 / 501 / 536 |
| Celular 360 px | período | 352 / 376 / 463 | 432 / 467 / 519 | 386 / 396 / 572 | 469 / 487 / 529 |
| 360 px, CPU 4× mais lenta | dia | 2.227 / 2.564 / **3.334** | 1.266 / 3.963 / 4.409 | 2.798 / 3.288 / 4.712 | 3.642 / 4.164 / 4.931 |
| 360 px, CPU 4× mais lenta | mês | 1.803 / 2.221 / 2.779 | 2.235 / 3.121 / 4.376 | 1.919 / 2.272 / 3.132 | 2.116 / 2.462 / 3.877 |
| 360 px, CPU 4× mais lenta | período | 1.228 / 2.156 / 2.649 | 2.368 / 3.490 / 5.703 | 2.397 / 3.169 / 5.402 | 1.705 / 2.064 / 2.978 |

**Sessão 1:** no recorte diário com CPU 4× mais lenta, o máximo foi **3,33 s** e **1 de 10**
carregamentos passou de 3 s. Na sessão 2 o mesmo cenário excedeu 3 s em mais execuções.

### 3.3 Otimizações e efeito medido

- Etapa 10: consulta em paralelo com as listas de filtros; tabela de 365 linhas montada só ao abrir;
  `ticks.sampleSize` no Chart.js.
- Entrega (sessão 2): consulta inicial, verificação de sessão e download do Chart.js iniciados em
  paralelo; `modulepreload` dos módulos; densidade de pixels do gráfico limitada a 2×.
  Nenhum dado é omitido e nenhum cálculo mudou.
- **Efeito:** desktop e 360 px seguem abaixo de 1 s em todas as execuções. No cenário de CPU 4× mais
  lenta a diferença antes/depois ficou **dentro do ruído** da máquina (medianas do recorte diário
  3,96 s antes; 3,29 s e 4,16 s depois) — **não há ganho comprovado** para esse cenário. Mesmo o
  recorte "período" (uma barra) passa de 3 s em parte das execuções, o que indica que o custo
  restante é a inicialização da página em CPU lenta, não o desenho dos gráficos.

### 3.4 Conclusão sobre o RNF03

- **Atendido** nas condições medidas de desktop e celular 360 px desta máquina: todas as 240
  medições dessas condições (4 execuções × 6 cenários × 10) ficaram abaixo de 0,82 s; a API do dashboard abaixo de 0,24 s.
- **Não atendido de forma incondicional:** com CPU 4× mais lenta (aparelho modesto simulado), o
  tempo até os gráficos excede 3 s em parte das execuções (sessão 1: máx 3,33 s, 1/10; sessão 2:
  medianas de até 4,16 s).
- Não medido: servidor e rede reais de homologação, aparelhos físicos. Repetir `npm run medir:api`
  e o script de navegador no ambiente de homologação antes de declarar o RNF03 aceito.
- CSV de 12 meses completos (20,8 MB): 6–10,5 s. UC12 não fixa tempo; é o ponto mais lento.

## 4. Verificação em navegador real

- Chrome 154 com emulação de dispositivo: 13 páginas × 2 viewports (360×740 com toque; 1366×768),
  perfis admin e motorista — **0 estouros horizontais, 0 alvos < 44 px, 0 violações de CSP, 0 erros
  de JS**, repetido após a otimização final; capturas conferidas visualmente.
- Demonstração ensaiada pela interface sobre banco novo e isolado (ver `roteiro-demonstracao.md`).
- **Não executado:** leitores de tela reais e aparelhos físicos.

## 5. Limitações conhecidas

- Retenção LGPD (D17) **sem prazo definido**; nada é apagado ou anonimizado automaticamente. O
  sistema **não afirma conformidade legal automática**.
- RNF03 sem comprovação em CPU lenta, servidor e rede reais (seção 3.4).
- Uma versão de parâmetros por data de vigência: correção de valor lançado por engano no mesmo dia
  exige nova versão com a data seguinte (ver `decisoes.md`).
- Sem recuperação de senha por e-mail; listas de cadastros sem paginação.
- Hospedagem, HTTPS e backup fora do MVP.
