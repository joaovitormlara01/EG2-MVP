# API — RotaClara (`/api/v1`)

REST/JSON na mesma origem das páginas. Decimais trafegam como **texto** (`"6.000"`), datas como
`AAAA-MM-DD`, instantes em ISO 8601 (UTC). Campos não previstos são rejeitados (400).

## Convenções

- **Sessão:** cookie `rotaclara_sessao` (HttpOnly, SameSite=Lax, Secure em produção). Toda rota
  exige sessão, exceto `health`, `auth/login` e `auth/logout`.
- **Requisições que alteram estado** (POST/PUT): `Content-Type: application/json` (senão 415);
  `Origin` igual à própria origem ou a `APP_ORIGENS` (senão 403 `ORIGEM_INVALIDA`); sem `Origin`,
  `Sec-Fetch-Site` precisa ser `same-origin`/`none`. Não há CORS, nem rotas DELETE, nem GET que
  altere dados (GETs apenas registram acesso em auditoria quando exigido pela RNF06).
- **Concorrência:** edição de roteiro, cancelamento, encerramento e correção exigem `versao`
  (a lida no detalhe) → 409 `VERSAO_DESATUALIZADA` se mudou. Chegada/saída repetidas são
  idempotentes (`jaRegistrado: true`). Montagem aceita `chaveIdempotencia` (UUID).
- **Erros:** `{ "erro": { "codigo", "mensagem", "campos"? } }`.

| Status | Código | Quando |
|---|---|---|
| 400 | `VALIDACAO` | Formato, obrigatoriedade, data inexistente ou final antes da inicial |
| 401 | `NAO_AUTENTICADO`, `CREDENCIAIS_INVALIDAS` | Sem sessão / login inválido (sem revelar o campo) |
| 403 | `PROIBIDO`, `USUARIO_INATIVO`, `ORIGEM_INVALIDA` | Perfil, equipe ou dono não autorizados; outra origem |
| 404 | `NAO_ENCONTRADO` | Registro ou rota inexistente |
| 409 | `CONFLITO`, `VERSAO_DESATUALIZADA`, `CONCORRENCIA` | Duplicidade (e-mail, documento, placa) ou versão |
| 415 | `REQUISICAO_INVALIDA` | Corpo que não é JSON |
| 422 | `REGRA_NEGOCIO`, `SEM_DADOS` | RN violada; exportação sem conteúdo (UC12) |
| 429 | `MUITAS_TENTATIVAS` | Mais de 10 logins/min por IP |

## Matriz de permissões (PP p.7 + decisões D06/D07)

| Operação | Motorista | Gerente | Administrador |
|---|---|---|---|
| Registrar chegada/saída | Próprio roteiro não encerrado, a partir da data do roteiro | — | — |
| Corrigir horários (auditado) | Não | Roteiros da equipe | Todos |
| Montar, editar, cancelar roteiro | Não | Motoristas da equipe | Todos |
| Encerrar roteiro | Próprio roteiro | Equipe | Todos |
| Consultar roteiro | Próprio | Equipe | Todos |
| Histórico e dashboard | Próprios roteiros | Equipe(s) | Todos |
| Exportar CSV | Não | Equipe(s) | Todos |
| Parâmetros | Não | Consulta | Consulta e alteração |
| Motoristas | Não | Da equipe (inclusive inativar) | Todos |
| Veículos, pontos | Não | Sim | Sim |
| Gerentes, equipes | Não | Consulta das próprias equipes | Sim |
| Auditoria | Não | Não | Consulta |

Implementação: `src/server/shared/autorizacao.js` (`pode`, `garantir`, `escopoDeConsulta`).

## Autenticação

| Método e rota | Perfis | Descrição |
|---|---|---|
| `GET /health` | público | `{ status, banco }` (200 / 503) |
| `POST /auth/login` | público | `{ login, senha }` (e-mail ou documento) → cookie + `{ usuario }` com `funcoes` do menu |
| `POST /auth/logout` | público | Revoga a sessão (204) |
| `GET /auth/me` | todos | Usuário atual e funções liberadas |

## Cadastros

Escritas geram auditoria na mesma transação. Inativar = `PUT` com `"ativo": false`.

| Método e rota | Perfis | Corpo / observações |
|---|---|---|
| `GET /equipes` | admin (todas), gerente (as suas) | |
| `POST /equipes`, `PUT /equipes/:id` | admin | `{ nome, gerenteId?, ativo* }` |
| `GET /gerentes` | admin | Acesso registrado (RNF06) |
| `POST /gerentes`, `PUT /gerentes/:id` | admin | `{ nome, email, telefone?, senha (obrigatória no POST), ativo* }` |
| `GET /motoristas[?ativos=true]` | admin, gerente (equipe) | Acesso registrado (RNF06) |
| `POST /motoristas`, `PUT /motoristas/:id` | admin, gerente (equipe atual e de destino) | `{ nome, documento, equipeId, veiculoId?, telefone?, email?, senha, ativo* }` |
| `GET /veiculos[?ativos=true]` | admin, gerente | |
| `POST /veiculos`, `PUT /veiculos/:id` | admin, gerente | `{ placa, descricao?, rendimentoKmL (> 0), ativo* }` |
| `GET /pontos[?ativos=true]` | admin, gerente | |
| `POST /pontos`, `PUT /pontos/:id` | admin, gerente | `{ nome?, endereco, latitude [-90,90], longitude [-180,180], ativo* }` — coordenadas obrigatórias (D04) |

\* `ativo` apenas no `PUT`.

## Roteiros e coleta

| Método e rota | Perfis | Descrição |
|---|---|---|
| `GET /roteiros?data=&motoristaId=` | todos (escopo) | Lista resumida |
| `GET /roteiros/:id` | dono, gerente da equipe, admin | Detalhe: pontos, totais, jornada do dia, custo, `permissoes` |
| `POST /roteiros` | gerente (equipe do motorista), admin | `{ motoristaId, data, veiculoId?, distanciaKm?, pontoIds[≥2], chaveIdempotencia? }`. Sem `veiculoId` usa o veículo atribuído ao motorista; outro veículo ativo pode ser escolhido explicitamente (substituição, com cópia do rendimento); sem nenhum → 422 (D05). → 201 `{ roteiro, avisos }`; mesma chave → 200 `repetido: true` |
| `PUT /roteiros/:id` | gerente, admin | `{ versao, data?, veiculoId?, distanciaKm?, pontoIds? }`. Planejado: tudo; em execução: só veículo e distância. A versão de parâmetros capturada só muda se a data mudar |
| `POST /roteiros/:id/cancelar` | gerente, admin | `{ versao }` — planejado ou em execução |
| `POST /roteiros/:id/encerrar` | dono, gerente, admin | `{ versao }` — todos com chegada; todos exceto a partida com saída (RN10) |
| `POST /roteiros/:id/pontos/:ordem/chegada` | motorista dono | `{}` — horário do servidor; repetir → `jaRegistrado: true` |
| `POST /roteiros/:id/pontos/:ordem/saida` | motorista dono | idem |
| `PUT /roteiros/:id/pontos/:ordem` | gerente da equipe, admin | Correção auditada `{ versao, chegada, saida|null, motivo }` — roteiro em execução ou encerrado; pontos em qualquer ordem; valida RN08, RN10 e horário não futuro |

Ponto: `tempoParadoSeg` = `0` na partida, `null` quando incompleto (≠ zero), senão `saída − chegada`
em segundos. `totais.percentualJornada` e `jornadaDoDia.percentual` com 3 casas. `custo`:
`disponivel`, `motivo`, `custoKm` (4 casas), `custoEstimado` (2 casas, arredondado uma vez).

## Histórico, dashboard e exportação

Filtros comuns: `inicio`, `fim` (data do roteiro, inclusivo, sem limite máximo; histórico paginado, CSV completo), `motoristaId?`,
`equipeId?` — sempre combinados com o escopo do perfil. Roteiros elegíveis: em execução e
encerrados (cancelados e planejados ficam fora).

| Método e rota | Perfis | Descrição |
|---|---|---|
| `GET /historico?...&pagina=&tamanho=` | todos (escopo) | `{ total, paginas, ocorrencias[], totais }`. Ocorrência: data, roteiro, situação, motorista, equipe, ordem, endereço histórico, chegada, saída, `tempoParadoSeg`, situação do ponto |
| `GET /dashboard?...&recorte=dia|mes|periodo` | todos (escopo) | `{ series[], totais, maioresParadas[] }` |
| `GET /relatorios/historico.csv?...` | gerente, admin | CSV completo do filtro (sem paginação); 422 `SEM_DADOS` se vazio; exportação auditada |

Indicador (série ou total): `roteiros`, `roteirosIncompletos`, `parcial`, `totalParadoSeg`
(soma dos totais gravados nos roteiros), `paresMotoristaData`, `jornadaMinTotal` (jornada somada
**uma vez por par motorista/data**, com a versão preservada no roteiro), `percentualJornada`
(`null` sem dados), `custo { estimado (null = nenhum disponível), roteirosComCusto,
roteirosSemCusto, parcial }`. A agregação de roteiros não faz junção com os pontos (custo nunca é
multiplicado pelo número de pontos).

CSV: UTF-8 com BOM, `;`, CRLF, vírgula decimal, horários no fuso `APP_TIMEZONE`, campos de texto
iniciados por `= + - @` tab ou CR prefixados com `'`, sem documento/telefone/e-mail; bloco
"TOTAIS DO PERÍODO" identificado.

## Parâmetros e auditoria

| Método e rota | Perfis | Descrição |
|---|---|---|
| `GET /parametros` | admin, gerente | `{ hoje, vigente, versoes }` |
| `POST /parametros` | admin | `{ vigenteDesde (≥ hoje e > última vigência), jornadaMin (1–1440), valorCombustivel? }` → `{ parametro }`. Nenhum roteiro existente é recalculado |
| `GET /auditoria?entidade=&entidadeId=&inicio=&fim=&pagina=` | admin | Registros (50 por página). `entidade=roteiro` + id inclui as ocorrências do roteiro |
