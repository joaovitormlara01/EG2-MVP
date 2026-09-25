# Rastreabilidade — RotaClara

Etapas (I1–I11) definidas em `escopo.md`. CT01–CT10 vêm do PP p.31. Itens marcados com
**⚠ Dxx** dependem de uma definição pendente em `decisoes.md`.

## Requisitos funcionais (ER p.3–4; PP p.5)

| ID | Requisito | Prior. | UC | Etapa | Verificação de aceite |
|---|---|---|---|---|---|
| RF01 | Cadastrar motorista/motoboy (nome, telefone, documento, veículo) | Alta | UC02 | I5 | Documento único; duplicado rejeitado; motorista com histórico é inativado, não excluído. ⚠ D05 |
| RF02 | Cadastrar gerente/coordenador (nome, telefone, e-mail) | Alta | UC03 | I5 | Somente admin cadastra; e-mail válido e único. ⚠ D07 |
| RF03 | Cadastrar pontos com endereço e coordenadas | Alta | UC04 | I5 | Endereço obrigatório; lat ∈ [-90,90], lon ∈ [-180,180]. ⚠ D04 |
| RF04 | Montar roteiro diário: pontos ordenados, motorista, data | Alta | UC05 | I6 | ≥ 2 pontos; ordens 1..n contínuas; ordem 1 = partida. ⚠ D12 |
| RF05 | Registrar chegada e saída em cada ponto | Alta | UC06 | I7 | Horários gravados na ocorrência (`RoteiroPonto`); saída < chegada rejeitada (CT07) |
| RF06 | Calcular tempo parado por ponto e total | Alta | UC06, UC07 | I7 | CT01 (partida 0; 15 min; total 15) e CT02 (total 75 min) |
| RF07 | Histórico por período com endereços | Alta | UC08 | I9 | CT04: endereço, data, chegada, saída e duração exibidos |
| RF08 | Dashboard por dia, mês e período | Alta | UC09 | I9 | CT03: três recortes com os mesmos dados de origem. ⚠ D09 |
| RF09 | Parametrizar combustível, rendimento, custo/km | Média | UC10, UC11 | I8 | Alteração sem mudar código; valores ≤ 0 rejeitados. ⚠ D03 |
| RF10 | Parametrizar regras de tempo parado e jornada (480 min) | Média | UC07, UC10 | I8 | CT05: jornada 420 aplicada sem mudar código. ⚠ D10, D11 |
| RF11 | Calcular custo estimado do roteiro | Média | UC05, UC11 | I8 | CT06: R$ 6,00; 12 km/l; 120 km → R$ 0,50/km; R$ 60,00 |
| RF12 | Exportar relatório do período consultado | Baixa | UC12 | I10 | Arquivo usa os mesmos filtros da consulta; exportação registrada; período vazio informado. ⚠ D16 |

## Requisitos não funcionais (ER p.4; PP p.6)

| ID | Requisito | UC | Etapa | Verificação de aceite |
|---|---|---|---|---|
| RNF01 | Persistência em banco; histórico completo | UC02, UC04, UC08 | I3–I7 | Dados sobrevivem ao reinício; registros referenciados só são inativados |
| RNF02 | Web responsiva (desktop e celular do entregador) | todos | I3, I7, I9 | Telas de coleta e dashboard utilizáveis em 360 px sem rolagem horizontal |
| RNF03 | Dashboard < 3 s para até 12 meses | UC08, UC09 | I9, I11 | CT09: medição com massa de 12 meses em homologação |
| RNF04 | Acesso por perfil (motorista, gerente, admin) | UC01, UC03, UC08, UC12 | I4 | CT10: motorista não altera parâmetros (403); escopo por equipe/propriedade. ⚠ D06, D07 |
| RNF05 | Auditoria de alterações em pontos e horários | UC02–UC04, UC10 | I4, I7 | CT08: usuário, data/hora, entidade, operação, antes/depois; registro imutável |
| RNF06 | LGPD | UC01, UC02, UC12 | I4, I11 | Dados pessoais restritos por perfil; acessos administrativos registrados. ⚠ D17 |

## Regras de negócio (PP p.4; RN01–RN07 também na ER p.2)

| ID | Regra | UC | Etapa | Verificação de aceite |
|---|---|---|---|---|
| RN01 | Ponto de ordem 1 (partida) tem tempo parado zero, mesmo com horários | UC05–UC07 | I7 | CT01: partida 08:00–08:20 → 0 min |
| RN02 | Demais pontos concluídos: tempo = saída − chegada | UC06, UC07 | I7 | CT01: 09:00–09:15 → 15 min |
| RN03 | Total do roteiro exclui a partida | UC06, UC07 | I7 | CT01 total 15 min; CT02 total 75 min |
| RN04 | Jornada inicial 480 min, configurável; base do percentual | UC07, UC09, UC10 | I8, I9 | CT02: 75/480 = 15,625%; CT05 com 420. ⚠ D09, D10 |
| RN05 | Cada roteiro tem exatamente um motorista e uma data (não impede vários roteiros por motorista/dia) | UC05 | I6 | Roteiro sem motorista ou data rejeitado; 2º roteiro no mesmo dia permitido. ⚠ D12 |
| RN06 | Ordens inteiras, positivas, únicas e contínuas a partir de 1 | UC05 | I6 | Lacuna ou repetição rejeitada; restrição única (roteiro, ordem) no banco |
| RN07 | Custo/km = combustível ÷ rendimento; custo = distância × custo/km | UC05, UC10, UC11 | I8 | CT06; rendimento 0/ausente → custo "não disponível" |
| RN08 | Saída não antecede chegada; horários pertencem à ocorrência | UC06 | I7 | CT07; mesmo `Ponto` em datas diferentes mantém horários distintos |
| RN09 | Só gerente/admin autorizados corrigem pontos/horários encerrados; com auditoria | UC06 | I4, I7 | CT08; motorista recebe 403 em roteiro encerrado |
| RN10 | Encerramento exige chegada nos pontos visitados e saída, exceto na partida | UC06 | I7 | Encerrar com saída faltante é rejeitado. ⚠ D08 |

## Casos de uso (PP p.8–21)

| UC | Nome | Ator(es) | Requisitos/regras (PP p.21) | Etapa | Verificação de aceite |
|---|---|---|---|---|---|
| UC01 | Autenticar-se | Todos | RNF04, RNF06 | I4 | Credencial inválida sem revelar campo; usuário inativo negado; acesso registrado |
| UC02 | Manter motoristas e motoboys | Admin, gerente | RF01, RNF01, RNF05, RNF06 | I5 | Documento duplicado bloqueado; alteração auditada; inativação |
| UC03 | Manter gerentes e coordenadores | Admin | RF02, RNF04, RNF05 | I5 | E-mail duplicado bloqueado; gerente não acessa |
| UC04 | Manter pontos | Gerente, admin | RF03, RNF01, RNF05 | I5 | Ponto usado em roteiro preserva o endereço histórico |
| UC05 | Montar roteiro diário | Gerente, admin | RF04, RF11, RN01, RN05, RN06, RN07 | I6, I8 | < 2 pontos bloqueia; ordem 1 marcada como partida; custo calculado |
| UC06 | Registrar chegada e saída | Motorista (correção: gerente/admin) | RF05, RF06, RN01–RN03, RN08, RN09 | I7 | CT01, CT07, CT08 |
| UC07 | Calcular tempos parados | Sistema | RF06, RF10, RN01–RN04 | I7, I8 | CT01, CT02; ponto sem saída fica "em andamento"; jornada 0 bloqueia percentual |
| UC08 | Consultar histórico | Gerente, admin | RF07, RNF01, RNF03, RNF04 | I9 | CT04; período vazio sem erro |
| UC09 | Visualizar dashboard | Gerente, admin | RF08, RN04, RNF03 | I9 | CT03, CT09 |
| UC10 | Parametrizar sistema | Admin | RF09, RF10, RN04, RN07, RNF05 | I8 | CT05, CT10; valor inválido mantém parâmetros anteriores |
| UC11 | Calcular custo estimado | Sistema | RF09, RF11, RN07 | I8 | CT06; custo guarda a versão dos parâmetros |
| UC12 | Exportar relatório | Gerente, admin | RF12, RNF04, RNF06 | I10 | Mesmos filtros do histórico; ação registrada |

## Critérios de aceite oficiais (ER p.5)

| Critério | Cobertura |
|---|---|
| Partida não computa tempo parado | RN01, CT01 |
| Dashboard com dia, mês e período | RF08, CT03 |
| Todo tempo parado vinculado a endereço e data/hora | RN08, RF07, CT04 |
| Parâmetros de custo e jornada alteráveis sem mudar código | RF09, RF10, CT05 |
