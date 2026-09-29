# Decisões — RotaClara

Fontes: **ER** = Especificação de Requisitos (oficial, 5 p.); **PP** = Projeto Preliminar (35 p.).
Regra geral: vale a ER; detalhes compatíveis do PP são adotados. Status: **Tecnologia**, **Confirmada**,
**Proposta** (aguarda aprovação da equipe) ou **Em aberto** (sem proposta fechada; bloqueia o comportamento afetado).

## Tecnologia

| ID | Decisão | Data |
|---|---|---|
| T01 | **Stack aprovada:** frontend em HTML5, CSS3 e JavaScript ES modules, sem framework e sem build; backend Node.js + Fastify em JavaScript; PostgreSQL com `pg` e migrações SQL; gráficos com Chart.js; Vitest e ESLint. API e frontend servidos pela mesma origem. Não usar TypeScript, React, JSX, React Router nem framework de frontend. **Substitui** a proposta anterior (TypeScript 6 + React 19 + Vite 8 + react-chartjs-2), que não chegou a ser implementada. Escopo, RN01–RN10, permissões e requisitos de histórico não mudam. Detalhes em `arquitetura.md` §2. | 28/09/2026 |

## Confirmadas

| ID | Decisão | Fonte |
|---|---|---|
| D01 | Adota-se a numeração RN01–RN10 do PP. RN01–RN07 refinam as RN01–RN07 da ER sem contradição; RN08–RN10 são acréscimos do PP. | ER p.2; PP p.4 |
| D02 | `Ponto` (endereço reutilizável) é separado de `RoteiroPonto` (ocorrência: ordem, chegada, saída, tempo parado). Diverge do modelo da ER, que põe horários em "Ponto", mas preserva o mesmo conteúdo. | ER p.4; PP p.3, p.28 |
| D18 | Distância total do roteiro é informada (não calculada); sem roteirização. | ER p.2; PP p.3 |
| D19 | Roteiro exige ≥ 2 pontos; ordem 1 é a partida. | PP p.13, p.29 |
| D20 | Estados do roteiro: Planejado → Em execução → Encerrado; Cancelado antes do encerramento. Motorista não edita roteiro encerrado. | PP p.30 |
| D21 | Registros referenciados são inativados, nunca excluídos fisicamente; auditoria é imutável. | PP p.10, p.30 |
| D22 | Endereço histórico preservado: a ocorrência não muda quando o `Ponto` é alterado (PP fala em "nova versão lógica"). Proposta de implementação em P03. | PP p.12 |
| D23 | Parâmetros guardam vigência; o roteiro guarda a versão usada no custo. | PP p.18–19, p.30 |
| D24 | Exportação (RF12, prioridade baixa) entra no MVP. | ER p.4; PP p.3 |
| D25 | "Dono da transportadora" (ER p.4) é tratado como perfil gerente/coordenador; não há quarto perfil (RNF04 lista três). | ER p.4 |

## Propostas (aguardam aprovação)

| ID | Proposta | Fonte |
|---|---|---|
| P01 | Horários registrados pelo motorista usam o relógio do servidor no momento da ação (UC06 "o sistema grava data e hora"); horários informados manualmente só na correção auditada. | PP p.14 |
| P02 | Roteiro passa a "Em execução" na primeira chegada registrada; encerramento é ação explícita (motorista ou gerente). | PP p.30 |
| P03 | `RoteiroPonto` guarda cópia do endereço e das coordenadas no momento da montagem; alterações em `Ponto` não afetam roteiros já montados. | PP p.12, p.28 |
| P04 | Roteiro guarda `veiculo_id` e cópia do rendimento, valor do combustível e custo/km usados (classe `Roteiro` "usa" `Veiculo`). | PP p.22, p.28 |
| P05 | Percentual exibido com até 3 casas decimais (CT02 = 15,625%). | PP p.31 |
| P13 | O "módulo de entrada de pedidos" da ER é atendido pelo cadastro de pontos e pela montagem do roteiro; não será criada entidade `Pedido`. | ER p.5; PP p.3 |

## Conflitos e definições em aberto

| ID | Questão | Fontes | Proposta inicial |
|---|---|---|---|
| D03 | **Custo/km: parâmetro ou derivado?** A ER lista "custo por km" e "km/litro do veículo" como parâmetros e põe rendimento no motorista; o PP deriva custo/km (RN07) e põe rendimento em `Veiculo`. | ER p.3–4 (RF09, modelo); PP p.4, p.28–29 | Custo/km sempre derivado e exibido; rendimento no veículo; sem valor manual de custo/km. |
| D04 | **Coordenadas obrigatórias?** RF03 exige coordenadas; UC04 permite só endereço com "pendência". | ER p.3; PP p.12 | Opcionais, com indicador de pendência (não são usadas em cálculo). |
| D05 | **Veículo obrigatório?** RF01 inclui veículo; modelo do PP usa 0..1 ("pode ter veículo"). | ER p.3; PP p.28–29 | Opcional no cadastro; obrigatório para calcular custo (senão "não disponível"). |
| D06 | **Motorista acessa histórico/dashboard?** Matriz permite "próprio roteiro"; UC08/UC09 e diagrama de UC só têm gerente/admin. | PP p.7, p.8, p.16–17 | Motorista vê apenas histórico dos próprios roteiros; sem dashboard. |
| D07 | **Equipe**: permissões dependem de "equipe", mas o modelo só tem `Gerente.equipe` e não liga motorista à equipe. | PP p.7, p.11, p.28 | Entidade `Equipe` com um gerente responsável; motorista pertence a uma equipe. (Muda o modelo conceitual.) |
| D08 | **Pontos não visitados no encerramento**: RN10 cita "pontos visitados", mas não define o destino dos demais. | PP p.4 | ~~Marcar "não visitado"~~ **Substituída** pela decisão registrada: todos os pontos exigem chegada; todos exceto a partida, saída (ver Conciliação). |
| D09 | **Denominador do percentual** em recortes com vários dias/motoristas. Fórmula do PP é por roteiro. | ER p.2 (RN04); PP p.4, p.17 | Jornada × nº de pares distintos (motorista, data) no recorte. |
| D10 | **Mudança de parâmetro × cálculos históricos**: UC10 admite "só novos cálculos" ou "registrar versão"; CT05 não diz se 420 vale para roteiros antigos. | PP p.18, p.30–31 | Custo: versão gravada no roteiro, sem recálculo. Percentual: jornada vigente na data do roteiro. |
| D11 | **Regras configuráveis × RN obrigatórias**: RF10 e `regraTempo` sugerem regras parametrizáveis; RN01–RN03 são fixas. | ER p.4; PP p.4, p.28 | RN01–RN03 fixas; configurável apenas a jornada. `regraTempo` fica sem efeito até ser definida. |
| D12 | **Roteiro incompatível**: UC05 manda alertar, sem definir; RN05 não impede vários roteiros por motorista/dia. | PP p.4, p.13 | Alerta (não bloqueio) quando o motorista já tem roteiro não cancelado na mesma data. |
| D16 | **Formato de exportação** "definido pelo MVP". | PP p.20 | CSV UTF-8 com BOM, separador `;` (abre no Excel pt-BR). |
| D17 | **Retenção LGPD**: política citada sem prazo. | ER p.4; PP p.6, p.30 | Definir prazo com a equipe; MVP registra acessos e usa inativação. |

## Conciliação das etapas 6–8 (28/09/2026)

As propostas refletidas no código foram comparadas **pelo significado** com as decisões passadas
pela equipe nas instruções das etapas (a numeração não foi usada como critério). Nenhuma proposta
foi dada como aprovada sem instrução correspondente.

| Tema (IDs) | Instrução recebida | Código anterior | Situação | Ação |
|---|---|---|---|---|
| Encerramento e pontos não visitados (D08, RN10) | "Todos os pontos planejados precisam de chegada; todos, exceto o primeiro, de saída." | Proposta D08: marcar "não visitado" | **Divergente → corrigido** | `migrations/0003` remove `roteiro_ponto.nao_visitado`; encerramento exige as duas condições |
| Vários roteiros por motorista/data (D12) | Permitir; avisar sobre roteiros não cancelados, sem restrição de agenda | Igual | Confirmado | Aviso na montagem e na edição |
| Endereço, rendimento e parâmetros históricos (D22, D23, P03, P04) | Preservar | Igual | Confirmado | Cópias no roteiro; recálculo só de roteiros **planejados** |
| Custo/km derivado com rendimento do veículo (D03) | "custo/km = combustível ÷ rendimento"; rendimento do veículo | Igual | Confirmado | Sem campo manual de custo/km |
| Jornada por motorista/data (D09) | "Aplicar a política documentada de jornada por motorista/data" | Proposta D09 | Aplicado por instrução | `jornadaDoDia` = soma dos roteiros não cancelados do motorista na data ÷ jornada |
| Mudança de parâmetros (D10) | Versionar; mudanças prospectivas; sem alterar histórico | Proposta D10 | **Revisada na etapa 9** | Vigência a partir de hoje; nenhum roteiro existente é recalculado (ver "Decisões confirmadas na etapa 9") |
| RN obrigatórias (D11) | Não podem ser desativadas | Igual | Confirmado | Só jornada e combustível são parâmetros |
| Equipe (D07) | "Atribuição mínima de equipe" | Proposta D07 | Aplicado por instrução | Equipe com gerente; motorista com equipe |
| Coordenadas (D04) | — | Proposta: opcionais | **Confirmada na etapa 9** | Obrigatórias (API + restrição NOT VALID) |
| Veículo do motorista (D05) | — | Proposta: opcional | **Confirmada na etapa 9** | Cadastro sem veículo permitido; roteiro exige veículo |
| Motorista no histórico/dashboard (D06) | — | Proposta: sem dashboard | **Confirmada na etapa 9 (diferente da proposta)** | Motorista vê histórico e dashboard próprios; exportação só gerente/admin |
| Horário do servidor na coleta (P01) e início na 1ª chegada (P02) | Não confiar no navegador | Proposta | Coerente com a instrução | Mantido; P02 segue como proposta |

### Regras de implementação registradas

- **Sequência de coleta:** chegada no ponto *k* exige o ponto *k−1* com chegada (e saída, se *k−1* > 1);
  saída exige chegada e o ponto seguinte ainda sem chegada. Registro só a partir da data do roteiro.
- **Idempotência e concorrência:** chegada/saída repetidas não sobrescrevem (`jaRegistrado`); a
  montagem aceita `chaveIdempotencia`; demais escritas usam `versao` + bloqueio da linha.
- **Arredondamento:** tempo em segundos inteiros (truncado); percentual com 3 casas; custo/km com
  4 casas (exibição); custo estimado calculado do valor exato e arredondado uma vez (2 casas, meio
  para cima). Aritmética inteira (BigInt), sem ponto flutuante — a biblioteca big.js não foi necessária.
- **CSRF:** validação de `Origin`/`Sec-Fetch-Site` + JSON obrigatório + SameSite=Lax; sem CORS.

## Decisões confirmadas na etapa 9 (29/09/2026)

| ID | Decisão confirmada | Implementação |
|---|---|---|
| D04 | Pontos operacionais exigem coordenadas. | API valida; `migrations/0004` acrescenta `ponto_coordenadas_obrigatorias` (NOT VALID: linhas antigas preservadas, toda linha nova/alterada verificada). |
| D05 | Motorista pode ser cadastrado sem veículo; roteiro operacional exige veículo. Histórico de veículo/rendimento do roteiro preservado. | Montagem usa o veículo informado ou, se omitido, o atribuído ao motorista; sem nenhum → 422. `roteiro_veiculo_obrigatorio` (NOT VALID). Rendimento copiado na montagem. |
| D06 | Motorista vê o próprio histórico e dashboard; gerente, as equipes; admin, tudo. Exportação só gerente/admin. | `historico.consultar` e `dashboard.consultar` para todos com `escopoDeConsulta`; `relatorio.exportar` gerente/admin. |
| D10 (revisada) | "Amanhã no mínimo" **não** foi pedido: a configuração inicial pode valer **hoje**. Versões e cópias históricas são preservadas; **nenhum** roteiro existente é recalculado (nem planejados). | Vigência ≥ hoje e > última vigência. Removido o recálculo de planejados (a regra "a partir de amanhã" e o recálculo automático da etapa 7 foram desfeitos). |
| D09 | Percentual = minutos parados ÷ (jornada somada uma vez por par motorista/data elegível). | Dashboard/histórico/CSV; ver `modelo-dados.md` e `api.md`. |

**Política motorista/data para versões de parâmetros.** Todos os roteiros não cancelados de um
motorista numa data usam a mesma versão: o primeiro roteiro do par captura a versão vigente na
data no momento da montagem; os seguintes do mesmo par reutilizam essa versão. Assim o
denominador da jornada é único por par e nada muda retroativamente. Consequência a comunicar na
demonstração: se uma nova versão passar a valer hoje e o motorista já tiver roteiro hoje, os
novos roteiros dele hoje continuam com a versão já capturada.

**Roteiros elegíveis para indicadores, histórico e CSV:** em execução e encerrados. Cancelados
ficam fora; planejados ainda não têm paradas. Roteiros em execução entram com total **parcial** e
são sinalizados (contagem de não encerrados). Custo ausente não é somado como zero: aparece como
"não disponível" (nenhum custo) ou "parcial" (alguns roteiros sem custo).

**Período de consulta (revisado na entrega):** sem limite máximo. O RNF03 fixa uma meta de
desempenho para 12 meses, não um teto de período, e nenhum limite operacional foi definido
pela equipe (UC08 apenas prevê a hipótese). O histórico é paginado (até 100 linhas por página),
o dashboard devolve agregados e o CSV exporta o resultado completo, sem truncar. O limite de
366 dias adotado na etapa 9 foi removido.

## Escolhas de implementação revisadas na entrega

| Tema | Comportamento final | Fonte / justificativa |
|---|---|---|
| Veículo do roteiro | Padrão: veículo atribuído ao motorista. O gerente pode **selecionar explicitamente outro veículo ativo** (substituição). O roteiro guarda o veículo e a cópia do rendimento usados; alterar o cadastro do veículo depois não muda o roteiro. | Escolha de implementação (D05 exige veículo; não proíbe substituição). |
| Coleta normal (relógio do servidor) | Motorista registra chegada/saída com o horário do servidor (P01). Recusada em roteiro cuja data ainda não chegou. Chegada no ponto *k* exige o ponto *k−1* com chegada (e saída, se não for a partida); saída exige chegada e o ponto seguinte ainda sem chegada. | Instrução da etapa 7 ("route ownership/date and point sequence remain valid"), RN06 (ordem de visita) e RN08. |
| Correção autorizada de horários históricos | Gerente da equipe ou admin informa chegada/saída de qualquer ponto, **em qualquer ordem**, para roteiros em execução ou encerrados. Validações: RN08 (saída ≥ chegada), RN10 (roteiro encerrado mantém saída nos pontos após a partida), horário não pode estar no futuro, versão atual do roteiro. Grava auditoria (antes/depois/motivo) na mesma transação. | RN08, RN09, RN10, RNF05. A regra cronológica entre pontos da etapa 7 **foi removida** por não ter fonte documentada (impedia restaurar horários históricos fora de ordem). |
| Uma versão de parâmetros por data de vigência | Mantida. Cada versão é imutável e referenciada pelos roteiros que a capturaram; nunca é sobrescrita. | Suporta a configuração acordada (vigência hoje ou futura, sem retroatividade). **Limitação:** para ajustar um valor lançado por engano no mesmo dia, é preciso criar nova versão com a data seguinte; roteiros já montados com a versão errada continuam com ela (ajuste só por nova montagem). |
| Consulta de auditoria | Tela e rota somente leitura, só admin, com filtros e paginação. Sem edição, exclusão ou exportação. | PP p.7: administrador acessa "auditoria". |
| Período de histórico/dashboard/CSV | Sem limite máximo; paginação no histórico; CSV completo. | RNF03 é meta de desempenho para 12 meses, não teto. |

## Pendência não técnica

| Tema | Situação |
|---|---|
| Retenção LGPD (D17) | **Sem prazo definido.** Nada é apagado ou anonimizado automaticamente. O sistema aplica minimização, controle de acesso e registro de acessos, mas não afirma conformidade legal automática. |
