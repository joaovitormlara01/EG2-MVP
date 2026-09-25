# Decisões — RotaClara

Fontes: **ER** = Especificação de Requisitos (oficial, 5 p.); **PP** = Projeto Preliminar (35 p.).
Regra geral: vale a ER; detalhes compatíveis do PP são adotados. Status: **Confirmada**,
**Proposta** (aguarda aprovação da equipe) ou **Em aberto** (sem proposta fechada; bloqueia o comportamento afetado).

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
| D08 | **Pontos não visitados no encerramento**: RN10 cita "pontos visitados", mas não define o destino dos demais. | PP p.4 | Gerente/motorista marca explicitamente "não visitado"; excluído do total; sem horários. |
| D09 | **Denominador do percentual** em recortes com vários dias/motoristas. Fórmula do PP é por roteiro. | ER p.2 (RN04); PP p.4, p.17 | Jornada × nº de pares distintos (motorista, data) no recorte. |
| D10 | **Mudança de parâmetro × cálculos históricos**: UC10 admite "só novos cálculos" ou "registrar versão"; CT05 não diz se 420 vale para roteiros antigos. | PP p.18, p.30–31 | Custo: versão gravada no roteiro, sem recálculo. Percentual: jornada vigente na data do roteiro. |
| D11 | **Regras configuráveis × RN obrigatórias**: RF10 e `regraTempo` sugerem regras parametrizáveis; RN01–RN03 são fixas. | ER p.4; PP p.4, p.28 | RN01–RN03 fixas; configurável apenas a jornada. `regraTempo` fica sem efeito até ser definida. |
| D12 | **Roteiro incompatível**: UC05 manda alertar, sem definir; RN05 não impede vários roteiros por motorista/dia. | PP p.4, p.13 | Alerta (não bloqueio) quando o motorista já tem roteiro não cancelado na mesma data. |
| D16 | **Formato de exportação** "definido pelo MVP". | PP p.20 | CSV UTF-8 com BOM, separador `;` (abre no Excel pt-BR). |
| D17 | **Retenção LGPD**: política citada sem prazo. | ER p.4; PP p.6, p.30 | Definir prazo com a equipe; MVP registra acessos e usa inativação. |
