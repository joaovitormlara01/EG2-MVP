# Arquitetura — RotaClara

> **Status: proposta aguardando aprovação da equipe.** O repositório não tinha código nem stack;
> nada foi instalado. Diagramas editáveis (Mermaid): `diagramas/componentes.md` e
> `diagramas/implantacao.md`.

## 1. Situação encontrada

- Repositório sem commits, apenas os dois PDFs. Nenhuma stack a manter.
- Ferramentas já instaladas na máquina de desenvolvimento (Windows 11): Node.js 24.19.0 (LTS "Krypton"),
  npm 11.17, PostgreSQL 17.6, Docker 29.7, JDK 17 e Maven 3.9.

## 2. Stack proposta (uma opção)

TypeScript em frontend e backend, **monólito modular**, um único banco relacional. Aproveita o que já
está instalado e mantém uma única linguagem para a dupla.

| Camada | Tecnologia | Versão (verificada em 24/09/2026) | Motivo |
|---|---|---|---|
| Runtime | Node.js | 24 LTS (instalado 24.19.0; atual 24.21.0) | LTS ativo, já instalado |
| Linguagem | TypeScript | 6.0.x (6.0.3) | TS 7.0 ainda incompatível com typescript-eslint (`<6.1.0`) |
| Backend HTTP | Fastify | 5.x (5.12.5) | Leve, validação e logs embutidos |
| Validação | Zod | 4.x (4.6.5) | Esquemas compartilháveis front/back |
| Banco | PostgreSQL | 17 (instalado 17.6; recomendável atualizar para 17.11) | `numeric`, `timestamptz`, índices para 12 meses |
| Acesso a dados | `pg` (node-postgres) | 8.x (8.23.0) | SQL explícito, sem ORM; ORM Prisma está com `latest` em RC (8.0.0-rc) |
| Aritmética decimal | big.js | 7.x (7.0.1) | Custo sem erro de ponto flutuante |
| Frontend | React + Vite + React Router | 19.x / 8.x / 8.x | SPA responsiva; proxy de dev evita CORS |
| Gráficos | Chart.js + react-chartjs-2 | 4.x / 5.x | Barras/linhas por dia, mês e período |
| Testes | Vitest | 5.x | Um executor para API e web |
| Análise estática | `tsc --noEmit`, ESLint 10 + typescript-eslint 8 | — | Checagem de tipos e lint |
| Senhas | `node:crypto` scrypt | nativo | Sem dependência nativa extra |

Alternativa descartada: Spring Boot (JDK 17/Maven instalados) + React. Seriam duas linguagens e
dois builds, sem ganho para o escopo.

Estrutura (npm workspaces, um `package-lock.json`):

```
apps/api/src/{config,db,shared(auth,auditoria,erros),modules/<modulo>}/
apps/api/migrations/NNNN_descricao.sql
apps/web/src/{pages,components,api}/
```

## 3. Módulos (alinhados aos controladores dos diagramas de robustez, PP p.22–27)

| Módulo | Controlador (PP) | Casos de uso | Entidades |
|---|---|---|---|
| `auth` | — | UC01 | Usuario, Sessao |
| `cadastros` | — | UC02, UC03 | Motorista, Gerente, Equipe*, Veiculo |
| `pontos` | — | UC04 | Ponto |
| `roteiros` | Controlador de roteiro | UC05, UC11 | Roteiro, RoteiroPonto |
| `coleta` | Controlador de parada | UC06, UC07 | RoteiroPonto, Roteiro |
| `parametros` | Controlador de parâmetros | UC10 | ParametroSistema |
| `consultas` | Controladores de consulta, indicadores e exportação | UC08, UC09, UC12 | leitura |
| `auditoria` | — | transversal | RegistroAuditoria |

\* `Equipe` depende da decisão D07.

Regra de dependência: rotas → serviço (regras) → repositório (SQL). Módulos só se comunicam por
serviços; nenhuma regra de negócio no frontend nem em rotas.

## 4. Fronteira da API

REST/JSON em `/api/v1`, mesma origem da SPA. Decimais trafegam como string; datas em ISO 8601.

| Recurso | Operações principais |
|---|---|
| `/health` | GET — status da API e do banco (sem autenticação) |
| `/auth` | POST `login`, POST `logout`, GET `me` |
| `/motoristas`, `/gerentes`, `/equipes`, `/veiculos` | CRUD com inativação (sem DELETE físico) |
| `/pontos` | CRUD com inativação |
| `/roteiros` | POST montar; GET por data/motorista; POST `/:id/encerrar`, `/:id/cancelar` |
| `/roteiros/:id/pontos/:ordem` | POST `chegada`, POST `saida` (motorista); PATCH correção (gerente/admin, auditada) |
| `/parametros` | GET vigente e histórico; POST nova versão (admin) |
| `/historico`, `/dashboard` | GET com `inicio`, `fim`, `recorte=dia\|mes\|periodo`, filtros |
| `/relatorios/historico.csv` | GET com os mesmos filtros de `/historico` |
| `/auditoria` | GET (admin) |

Erros: `{ "erro": { "codigo", "mensagem", "campos"? } }` com 400/401/403/404/409/422.

## 5. Regras no servidor

Todo cálculo e validação ocorre no serviço, dentro de transação: RN01–RN03 e RN08 (tempo),
RN06 (ordens, com `UNIQUE (roteiro_id, ordem)`), RN07 (custo), RN09 (correção + auditoria na mesma
transação) e RN10 (encerramento). O frontend apenas exibe o que a API devolve.

## 6. Autenticação e autorização

- Login por e-mail/documento e senha (hash scrypt com sal). Sessão opaca em tabela `sessao`,
  cookie `HttpOnly`, `SameSite=Lax`, `Secure` fora do ambiente local; expiração configurável.
- Mutações exigem `Content-Type: application/json` (mitiga CSRF junto com `SameSite`).
- Autorização em duas camadas: **perfil** (motorista, gerente, admin) + **escopo**:
  admin → tudo; gerente → motoristas/roteiros da própria equipe; motorista → apenas roteiros
  próprios e não encerrados para registro. Política central `pode(usuario, acao, recurso)` testada
  contra a matriz do PP p.7.

## 7. Dados, migrações e auditoria

- Migrações SQL versionadas, só para frente, aplicadas por script (`db:migrate`) com tabela
  `schema_migrations`. Nunca há reset automático do banco.
- `RoteiroPonto` guarda cópia de endereço/coordenadas (P03); `Roteiro` guarda versão e valores de
  parâmetros usados (D23, P04).
- `registro_auditoria`: data/hora, usuário, entidade, identificador, ação, `valor_anterior` e
  `valor_novo` (jsonb). Gatilho no banco bloqueia UPDATE/DELETE (imutável). Acessos
  administrativos a dados pessoais também são registrados (RNF06).
- Índices: `roteiro(data)`, `roteiro(motorista_id, data)`, `roteiro_ponto(ponto_id)`.

## 8. Tempo, unidades e dinheiro

| Tema | Convenção |
|---|---|
| Instantes | `timestamptz` (UTC no banco); fuso operacional `America/Sao_Paulo` (config `APP_TIMEZONE`) |
| Data do roteiro | `date` local; recortes dia/mês/período agrupam pela data do roteiro, não pelo horário |
| Durações | Inteiro em **segundos** no banco; exibidas em minutos ou `h:mm` |
| Jornada | Inteiro em **minutos** (inicial 480) |
| Percentual | `total_seg / (jornada_min × 60) × 100`, exibido com até 3 casas |
| Combustível | `numeric(10,3)` R$/L |
| Rendimento | `numeric(6,2)` km/L, > 0 |
| Distância | `numeric(9,2)` km |
| Custo/km | calculado com big.js; exibido com 4 casas |
| Custo estimado | `distância × combustível ÷ rendimento`, arredondado **uma vez** para `numeric(12,2)` (meio para cima) |

## 9. Desempenho (RNF03)

Tempos por ponto e totais por roteiro são gravados na escrita (e recalculados na correção), de
modo que o dashboard agrega apenas colunas indexadas em SQL. Verificação com massa de 12 meses (I11).

## 10. Execução

- **Desenvolvimento:** Vite (:5173) com proxy `/api` → Fastify (:3000) → PostgreSQL 17 local (:5432),
  banco `rotaclara_dev`; testes de integração em `rotaclara_test`.
- **Apresentação/homologação:** `npm run build`; Fastify serve a SPA compilada e a API em um único
  processo. Hospedagem externa não está definida (fora desta proposta).

## 11. Escolhas registradas para a apresentação

Pendentes de aprovação: Node.js 24 LTS, TypeScript 6.0, Fastify 5, PostgreSQL 17, node-postgres,
React 19 + Vite 8, Chart.js 4, Vitest 5, ESLint 10. Após aprovação, esta seção passa a registrar as
versões efetivamente fixadas no `package-lock.json`.
