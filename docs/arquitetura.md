# Arquitetura — RotaClara

> **Status:** stack aprovada em 28/09/2026 (decisão **T01** em `decisoes.md`). Etapas I1–I11
> concluídas. Contrato da API e permissões: `api.md`; modelo de dados: `modelo-dados.md`;
> resultados de aceite e desempenho: `relatorio-aceite.md`.
> Diagramas editáveis (Mermaid): `diagramas/componentes.md` e `diagramas/implantacao.md`.

## 1. Ambiente de desenvolvimento

Windows 11 com Node.js 24.19.0 (LTS "Krypton"), npm 11.17 e PostgreSQL 17.6 instalados.

## 2. Stack

JavaScript em frontend e backend, **monólito modular**, um único banco relacional. Sem TypeScript,
sem React/JSX, sem framework de frontend e **sem etapa de build**: o Fastify serve a API e os
arquivos do frontend na **mesma origem**.

| Camada | Tecnologia | Versão fixada (`package-lock.json`) | Motivo |
|---|---|---|---|
| Runtime | Node.js | ≥ 24 (LTS) | LTS ativo, já instalado; `--env-file` nativo |
| Linguagem | JavaScript (ES modules) | ES2024+ | Uma linguagem para a dupla, sem compilação |
| Backend HTTP | Fastify | 5.12.5 | Leve, validação JSON Schema e logs embutidos |
| Plugins | @fastify/static, /cookie, /helmet, /rate-limit | 10.1.5 / 11.1.2 / 13.1.1 / 11.2.0 | Arquivos estáticos, cookie de sessão, cabeçalhos de segurança (CSP), limite de tentativas de login |
| Banco | PostgreSQL | 17 | `numeric`, `timestamptz`, índices para 12 meses |
| Acesso a dados | `pg` (node-postgres) | 8.23.0 | SQL explícito, sem ORM |
| Migrações | SQL puro + executor próprio (`src/server/db/migrador.js`) | — | Somente para frente, com checksum e lock |
| Frontend | HTML5, CSS3, JavaScript ES modules | — | Páginas separadas; módulos JS reutilizáveis; `fetch` |
| Gráficos | Chart.js (build UMD, servido de `node_modules`) | 4.5.1 | Barras/linhas por dia, mês e período |
| Testes | Vitest | 5.0.2 | Unidade, rotas HTTP (`inject`) e integração com PostgreSQL |
| Análise estática | ESLint + `@eslint/js` + `globals`; `node --check` | 10.11.0 / 10.0.1 / 17.12.0 | Lint e verificação de sintaxe/imports (substitui `tsc`) |
| Senhas | `node:crypto` scrypt | nativo | Sem dependência nativa extra |

Aritmética decimal (RN07, RN04): inteiros BigInt em `src/server/shared/calculos.js`, sem ponto
flutuante e sem dependência extra (big.js não foi necessária).

Estrutura (um único `package.json` e `package-lock.json`):

```
migrations/NNNN_descricao.sql        migrações SQL versionadas
public/                              frontend (servido como está)
  index.html, inicio.html, 404.html  páginas
  css/base.css, css/layout.css       estilos (tokens, formulários, layout responsivo)
  js/api.js, sessao.js, ui.js, rotulos.js   módulos reutilizáveis
  js/paginas/<pagina>.js             script de cada página
src/server/
  app.js, server.js, config.js
  db/{pool,migrador}.js, db/cli/{migrar,criar-admin}.js
  plugins/seguranca-api.js           sessão, CSRF, política por rota
  shared/{autorizacao,auditoria,erros,senha,token}.js
  modules/<modulo>/{rotas,servico,repositorio}.js
scripts/verificar-sintaxe.js
tests/{unidade,app,integracao,apoio}/
```

## 3. Módulos (alinhados aos controladores dos diagramas de robustez, PP p.22–27)

| Módulo | Controlador (PP) | Casos de uso | Entidades | Situação |
|---|---|---|---|---|
| `health` | — | — | — | Implementado |
| `auth` | — | UC01 | Usuario, Sessao | Implementado |
| `cadastros` | — | UC02, UC03 | Usuario, Motorista, Equipe*, Veiculo | Implementado |
| `pontos` | — | UC04 | Ponto | Implementado |
| `roteiros` (inclui coleta) | Controladores de roteiro e de parada | UC05–UC07, UC11 | Roteiro, RoteiroPonto | Implementado |
| `parametros` | Controlador de parâmetros | UC10 | ParametroSistema | Implementado |
| `consultas` | Controladores de consulta, indicadores e exportação | UC08, UC09, UC12 | leitura | Implementado |
| `auditoria` | — | transversal | RegistroAuditoria | Implementado (registro + consulta admin) |

\* `Equipe` segue a proposta da decisão D07.

Regra de dependência: rotas → serviço (regras) → repositório (SQL). Módulos só se comunicam por
serviços; nenhuma regra de negócio no frontend nem em rotas. O frontend só exibe o que a API devolve.

## 4. Fronteira da API

REST/JSON em `/api/v1`, mesma origem das páginas. Decimais trafegam como string; datas em ISO 8601.

| Recurso | Operações principais | Situação |
|---|---|---|
| `/health` | GET — status da API e do banco (sem autenticação) | Implementado |
| `/auth` | POST `login`, POST `logout`, GET `me` | Implementado |
| `/motoristas`, `/gerentes`, `/equipes`, `/veiculos` | GET/POST/PUT com inativação (sem DELETE físico) | Implementado |
| `/pontos` | GET/POST/PUT com inativação | Implementado |
| `/roteiros` | POST montar; GET lista/detalhe; PUT editar; POST `/:id/encerrar`, `/:id/cancelar` | Implementado |
| `/roteiros/:id/pontos/:ordem` | POST `chegada`, POST `saida` (motorista); PUT correção (gerente/admin, auditada) | Implementado |
| `/parametros` | GET vigente e histórico; POST nova versão (admin) | Implementado |
| `/historico`, `/dashboard` | GET com `inicio`, `fim`, `recorte=dia\|mes\|periodo`, filtros | Implementado |
| `/relatorios/historico.csv` | GET com os mesmos filtros de `/historico` | Implementado |
| `/auditoria` | GET (admin) | Implementado |

Erros: `{ "erro": { "codigo", "mensagem", "campos"? } }` com 400/401/403/404/409/415/422/429.
Campos fora do esquema são rejeitados (400), não descartados.

## 5. Regras no servidor

Todo cálculo e validação ocorre no serviço, dentro de transação: RN01–RN03 e RN08 (tempo),
RN06 (ordens), RN07 (custo), RN09 (correção + auditoria na mesma transação) e RN10 (encerramento).
O banco reforça as regras verificáveis por restrição (defesa em profundidade):

| Regra | Restrição no banco (`migrations/0002…`) |
|---|---|
| RN01 | `roteiro_ponto_partida_sem_tempo`: ordem 1 com tempo 0 |
| RN06, D19 | `unique (roteiro_id, ordem)` + gatilho adiado: ordens 1..n contínuas e n ≥ 2 ao fim da transação |
| RN08 | `roteiro_ponto_saida_apos_chegada` |
| RN07 | rendimento e combustível > 0 |
| RNF05 | gatilhos bloqueiam UPDATE/DELETE/TRUNCATE em `registro_auditoria` |

## 6. Autenticação e autorização (implementado)

- **Login** (`POST /api/v1/auth/login`) por e-mail (qualquer perfil) ou documento (motorista) e
  senha. Hash **scrypt** (N=2¹⁵, r=8, p=1, sal de 16 bytes). Credencial inválida devolve sempre
  "Usuário ou senha inválidos." com tempo equivalente mesmo para usuário inexistente; usuário
  inativo só é informado após senha correta, orientando procurar o administrador (UC01).
  Limite de 10 tentativas/min por IP.
- **Sessão opaca**: token aleatório de 32 bytes no cookie `rotaclara_sessao` (`HttpOnly`,
  `SameSite=Lax`, `Secure` em produção); o banco guarda só o SHA-256. Expiração configurável
  (`SESSAO_DURACAO_MIN`, padrão 12 h). Logout revoga no servidor. Inativar o usuário invalida
  as sessões abertas.
- **CSRF** (camadas, revisado nas etapas 6–8): em POST/PUT, `Origin` precisa ser a própria origem
  (ou `APP_ORIGENS`), `"null"` é recusado; sem `Origin`, `Sec-Fetch-Site` precisa ser
  `same-origin`/`none` (403 `ORIGEM_INVALIDA`). Além disso, `Content-Type: application/json`
  obrigatório (415), cookie `SameSite=Lax`, nenhuma resposta CORS e nenhuma rota GET que altere
  dados (GETs só leem e, no máximo, registram o acesso em auditoria).
- **Concorrência**: escritas bloqueiam a linha do roteiro (`FOR UPDATE`); edições e correções
  exigem `versao` (409 se mudou); chegada/saída repetidas são idempotentes; montagem aceita
  `chaveIdempotencia`.
- **Cabeçalhos**: CSP `default-src 'self'` (sem scripts/estilos inline), `frame-ancestors 'none'`
  e demais cabeçalhos do Helmet.
- **Autorização em duas camadas**, sempre no servidor:
  1. *Seguro por padrão*: toda rota em `/api/v1` exige sessão, salvo as marcadas `publico`.
  2. *Política central* `pode(usuario, acao, recurso)` (`src/server/shared/autorizacao.js`),
     escrita a partir da matriz do PP p.7: perfil + escopo (admin → tudo; gerente → equipes
     pelas quais responde; motorista → só roteiros próprios e não encerrados para registro).
     Rotas declaram `config.acao` para a checagem por perfil; serviços chamam
     `garantir(usuario, acao, recurso)` quando a decisão depende do registro (equipe, dono,
     situação). `escopoDeConsulta(usuario)` filtra histórico/dashboard/exportação.
- **Auditoria de acesso** (UC01, RNF06): login, logout e negações de usuários existentes são
  gravados em `registro_auditoria`, sem guardar o texto digitado no login nem a senha.
- O frontend nunca vê o token, não guarda dados em `localStorage`/`sessionStorage` (regra de lint)
  e não tem credenciais de banco: `.env` fica apenas no servidor.

## 7. Dados, migrações e auditoria

- Migrações SQL versionadas, só para frente, aplicadas por `npm run db:migrate`, registradas em
  `schema_migrations` com checksum (editar uma migração já aplicada é erro) e protegidas por
  `pg_advisory_lock`. Nunca há reset automático do banco de desenvolvimento.
- `0001_identidade_e_auditoria.sql`: `usuario`, `equipe`, `veiculo`, `motorista`, `sessao`,
  `registro_auditoria` (imutável).
- `0002_pontos_parametros_roteiros.sql`: `ponto`, `parametro_sistema` (versão 1: jornada 480 min),
  `roteiro`, `roteiro_ponto`.
- `0003_encerramento_concorrencia.sql`: remove `nao_visitado` (decisão de encerramento), unicidade
  de ordem verificada no commit (reordenação atômica), `roteiro.versao`, `chave_idempotencia` e
  limite de jornada (≤ 1440 min).
- `RoteiroPonto` guarda cópia de endereço/coordenadas (P03); `Roteiro` guarda a versão e os
  valores de parâmetros usados (D23, P04) e a equipe do motorista na montagem (escopo histórico do
  gerente mesmo que o motorista mude de equipe).
- `registro_auditoria`: data/hora, usuário, entidade, identificador, ação, `valor_anterior` e
  `valor_novo` (jsonb, sem campos de senha/token). Acessos administrativos a dados pessoais
  também serão registrados (RNF06).
- Índices: `roteiro(data)`, `roteiro(motorista_id, data)`, `roteiro(equipe_id, data)`,
  `roteiro_ponto(ponto_id)`.
- O primeiro administrador é criado por `npm run db:criar-admin` (senha nunca vai para migração).

## 8. Tempo, unidades e dinheiro

| Tema | Convenção |
|---|---|
| Instantes | `timestamptz` (UTC no banco); fuso operacional `America/Sao_Paulo` (config `APP_TIMEZONE`) |
| Data do roteiro | `date` local, lida como texto `AAAA-MM-DD` (sem conversão de fuso); recortes agrupam pela data do roteiro |
| Durações | Inteiro em **segundos** no banco; exibidas em minutos ou `h:mm` |
| Jornada | Inteiro em **minutos** (inicial 480) |
| Percentual | `total_seg / (jornada_min × 60) × 100`, exibido com até 3 casas |
| Combustível | `numeric(10,3)` R$/L |
| Rendimento | `numeric(6,2)` km/L, > 0 |
| Distância | `numeric(9,2)` km |
| Custo/km | derivado (não armazenado); exibido com 4 casas |
| Custo estimado | `distância × combustível ÷ rendimento`, arredondado **uma vez** para `numeric(12,2)` (meio para cima) |

## 9. Desempenho (RNF03)

Tempos por ponto e totais por roteiro são gravados na escrita (e recalculados na correção), de
modo que o dashboard agrega apenas colunas indexadas em SQL. Verificação com massa de 12 meses (I11).

## 10. Execução

- **Desenvolvimento:** `npm run dev` — Fastify (:3000) serve `/api/v1` e `public/` no mesmo
  processo e origem; reinicia ao alterar `src/` ou `public/`. PostgreSQL 17 local (:5432), banco
  `rotaclara_dev`; testes de integração em `rotaclara_test` (schema recriado a cada execução).
- **Apresentação/homologação:** `npm ci --omit=dev` → `npm run db:migrate` → `npm start` com
  `NODE_ENV=production` atrás de HTTPS. Sem etapa de build. Hospedagem externa não está definida.
- **Verificação:** `npm run verificar` (sintaxe + ESLint + Vitest).

## 11. Justificativas das escolhas (resumo)

| Escolha | Motivo |
|---|---|
| JavaScript sem build no frontend | Decisão T01; menos ferramentas para a dupla; CSP estrita (`script-src 'self'`) sem código inline |
| Fastify | Validação por JSON Schema, hooks para sessão/CSRF/autorização por rota, bom desempenho |
| PostgreSQL + SQL explícito (`pg`) | `numeric`/`timestamptz`, restrições e gatilhos como segunda barreira às RN; agregações legíveis |
| Migrações próprias | Poucas linhas, somente para frente, checksum e lock; sem dependência extra |
| BigInt para decimais | Custo e percentual exatos, arredondamento único documentado; dispensou big.js |
| Chart.js UMD servido localmente | Sem CDN (CSP `self`), sem build; `ticks.sampleSize` para 12 meses em celulares |
| Vitest + ESLint + `node --check` | Um executor para unidade/HTTP/integração; lint impede `innerHTML` e `localStorage` no frontend |
| `puppeteer-core` fora das dependências | Só para verificação/medição opcionais com o Chrome já instalado |

## 12. Consultas e indicadores (UC08, UC09, UC12)

- Filtro pela **data do roteiro** (dia local, `date`), intervalo inclusivo, sem limite máximo (histórico paginado; CSV completo, sem truncar).
- Roteiros elegíveis: em execução e encerrados; em execução contam com total parcial e são sinalizados.
- Tempo parado: soma de `roteiro.total_parado_seg`, gravado com as mesmas funções do detalhe.
- Percentual (D09): tempo ÷ (jornada somada **uma vez por par motorista/data**, com a versão de
  parâmetros preservada no roteiro). Sem pares → "não disponível".
- Custo: soma de `roteiro.custo_estimado` sem junção com pontos; ausente ≠ zero ("parcial"/"não disponível").
- Histórico, dashboard e CSV compartilham filtros, escopo e agregação (testado: totais idênticos).
