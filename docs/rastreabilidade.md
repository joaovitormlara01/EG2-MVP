# Rastreabilidade — RotaClara

Requisito → implementação → teste/evidência. Fontes: **ER** (Especificação de Requisitos,
oficial) e **PP** (Projeto Preliminar). Testes (Vitest):

- **U** = `tests/unidade/` (sem banco) · **A** = `tests/app/auth-e-autorizacao.test.js` (HTTP, sem banco)
- **IB** = `tests/integracao/banco.test.js` · **IR** = `tests/integracao/roteiros.test.js` ·
  **IC** = `tests/integracao/consultas.test.js` (PostgreSQL real)
- **N** = verificação em navegador real (Chrome) · **M** = medição (`relatorio-aceite.md`)

## Requisitos funcionais

| ID | Requisito | Implementação | Evidência |
|---|---|---|---|
| RF01 | Cadastrar motorista (nome, telefone, documento, veículo) | `cadastros/*`, `motoristas.html` | IR "gerente cadastra motorista…", "D05…"; N cadastro |
| RF02 | Cadastrar gerente (nome, telefone, e-mail) | `cadastros/*`, `gerentes.html`, `equipes.html` | IR "admin cadastra gerentes e equipes…"; N |
| RF03 | Pontos com endereço e coordenadas | `pontos/*`, `pontos.html`, restrições 0002/0004 | IR "pontos exigem endereço e coordenadas"; IB "D04/D05…" |
| RF04 | Montar roteiro diário | `roteiros/servico.js#criar/editar`, `roteiros.html` | IR "montagem de roteiro (etapa 6)"; IB ordens; N montagem |
| RF05 | Registrar chegada e saída | `roteiros/servico.js#registrar`, `roteiro.html` | IR "CT01…", "repetir a mesma ação…"; N coleta 360 px |
| RF06 | Tempo parado por ponto e total | `shared/calculos.js` | U `calculos` CT01/CT02; IR CT01/CT02 |
| RF07 | Histórico com endereços | `consultas/*`, `historico.html` | IC "CT04…", "fronteira inclusiva…"; N histórico |
| RF08 | Dashboard dia/mês/período | `consultas/*`, `dashboard.html` (Chart.js) | IC "recorte diário…", "CT03…"; N gráficos; M |
| RF09 | Parâmetros de combustível e rendimento | `parametros/*`, `parametros.html`, rendimento no veículo (D03) | IR "configuração inicial com vigência HOJE…" |
| RF10 | Parâmetros de jornada (480) | `parametro_sistema` v1 = 480 | IB "cria a jornada inicial de 480"; IR "CT05 prospectivo" |
| RF11 | Custo estimado | `calcularCusto` (BigInt) | U CT06 e arredondamento; IR/IC CT06 = R$ 60,00 |
| RF12 | Exportar relatório | `consultas/csv.js`, rota `.csv` | U `csv`; IC "exportação CSV (UC12)"; N download |

## Requisitos não funcionais

| ID | Requisito | Implementação | Evidência |
|---|---|---|---|
| RNF01 | Persistência / histórico completo | PostgreSQL, migrações, sem DELETE | IC "persistência após reinício"; N recarregar página |
| RNF02 | Responsivo (desktop e celular) | CSS mobile-first, tabelas em cartões, alvos ≥ 44 px | N 26 páginas×viewport sem estouro (360 px e 1366 px) |
| RNF03 | Dashboard < 3 s (12 meses) | Agregação SQL sem junção de pontos, índices, gráfico com amostragem de rótulos | M: 15.169 roteiros / 128.970 ocorrências — **parcial**: < 1 s em desktop e 360 px; > 3 s em parte das execuções com CPU 4× mais lenta |
| RNF04 | Acesso por perfil | `shared/autorizacao.js`, `seguranca-api.js` | U `autorizacao`; A; IR/IC escopos; N telas "Acesso negado" |
| RNF05 | Auditoria | `shared/auditoria.js`, gatilhos imutáveis, `auditoria.html` | IB "auditoria é imutável"; IR/IC correção e consulta de auditoria |
| RNF06 | LGPD | Minimização no CSV, registro de acessos de gerente/admin, sessão segura | IC "escopo…registra consulta", CSV sem documento/telefone; retenção **pendente** (D17) |

## Regras de negócio

| ID | Regra | Implementação | Evidência |
|---|---|---|---|
| RN01 | Partida = 0 | `tempoParadoSeg`, restrição `roteiro_ponto_partida_sem_tempo` | U CT01; IR CT01; IB; N demo "0 min (partida)" |
| RN02 | Tempo = saída − chegada | `tempoParadoSeg` | U CT01; IR CT01 |
| RN03 | Total exclui a partida | `totaisDoRoteiro` | U CT02; IR CT02 |
| RN04 | Jornada 480 configurável; percentual | `percentualJornada`, D09 por par motorista/data | U CT02/CT05; IR CT05; IC percentual por par |
| RN05 | Um motorista e uma data por roteiro | Esquema da rota + `not null` | A "RN05…"; IR vários roteiros no mesmo dia permitidos |
| RN06 | Ordens 1..n únicas e contínuas | Montagem ordenada + restrição única adiável + gatilho | IB "rejeita roteiro com 1 ponto, lacuna…", "reordenar"; IR "reordena pontos de forma atômica" |
| RN07 | Custo/km e custo estimado | `calcularCusto`, cópias no roteiro | U CT06; IR/IC CT06; N demo R$ 60,00 |
| RN08 | Saída não antecede chegada | Serviço + restrição | U RN08; IR correção inválida; IB CT07 |
| RN09 | Só gerente/admin corrigem, com auditoria | `coleta.corrigir` + auditoria na transação | IR "correção: motorista e gerente de outra equipe recebem 403", "correção autorizada…"; IC auditoria |
| RN10 | Encerramento: chegada em todos; saída exceto partida | `roteiros/servico.js#encerrar` | IR "não encerra com ponto incompleto"; N demo |

## Critérios de aceitação (PP p.31)

| CT | Resultado esperado | Evidência | Resultado |
|---|---|---|---|
| CT01 | Partida 0; 15 min; total 15 | U, IR, N (demonstração) | Aprovado |
| CT02 | 75 min; 15,625% | U, IR | Aprovado |
| CT03 | Três recortes com os mesmos dados | IC "CT03", N | Aprovado |
| CT04 | Endereço, data, chegada, saída e duração | IC "CT04", N | Aprovado |
| CT05 | Jornada 420 sem mudar código | U (17,857%), IR "CT05 prospectivo" | Aprovado |
| CT06 | R$ 0,50/km; R$ 60,00 | U, IR, IC, N | Aprovado |
| CT07 | Saída antes da chegada rejeitada | U, IR, IB | Aprovado |
| CT08 | Correção com usuário, data, antes e depois | IR, IC auditoria, N | Aprovado |
| CT09 | Dashboard 12 meses < 3 s | M | **Parcial**: < 1 s em desktop e 360 px; excede 3 s com CPU 4× mais lenta (ver relatório) |
| CT10 | Motorista não altera parâmetros | A, IR, N | Aprovado |

## Critérios oficiais (ER p.5)

| Critério | Cobertura |
|---|---|
| Partida não computa tempo parado | RN01 / CT01 |
| Dashboard com dia, mês e período | RF08 / CT03 |
| Todo tempo parado vinculado a endereço e data/hora | RF07 / CT04 (endereço histórico copiado) |
| Parâmetros de custo e jornada alteráveis sem mudar código | RF09, RF10 / CT05, CT06 |
