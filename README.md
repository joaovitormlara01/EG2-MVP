# RotaClara

> **Cada parada conta.**

Aplicação web para registrar chegada e saída de motoristas e motoboys em cada ponto do roteiro,
calcular o tempo parado (a partida não conta), manter histórico com endereços, exibir dashboard
por dia, mês e período, exportar relatório e estimar o custo de combustível.

Trabalho de Engenharia de Software II — **João Vitor Martins e Lara** e **Gabriel Fonseca Saliba**.

## Tecnologias

| Camada | Tecnologia (versão fixada no `package-lock.json`) |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES modules — sem framework e sem build |
| Backend | Node.js ≥ 24 (testado em 24.19.0) + Fastify 5.12.5 (`@fastify/static` 10.1.5, `cookie` 11.1.2, `helmet` 13.1.1, `rate-limit` 11.2.0) |
| Banco | PostgreSQL 17 (testado em 17.6) + `pg` 8.23.0, migrações SQL próprias |
| Gráficos | Chart.js 4.5.1 (servido da própria aplicação) |
| Qualidade | Vitest 5.0.2, ESLint 10.11.0 (`@eslint/js` 10.0.1, `globals` 17.12.0) |

API e páginas saem do mesmo processo, na mesma origem. Justificativas: `docs/arquitetura.md`.

## Pré-requisitos (Windows 11)

- Node.js 24 LTS (npm 11) e PostgreSQL 17 instalados.
- Terminal PowerShell na pasta do projeto.

## Instalação e primeira execução

1. **Dependências**
   ```powershell
   npm ci
   ```
2. **Banco** — crie um usuário e os bancos (uma vez), com o `psql` do PostgreSQL:
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "create role rotaclara login password 'troque-esta-senha'" -c "create database rotaclara_dev owner rotaclara" -c "create database rotaclara_test owner rotaclara"
   ```
   `rotaclara_test` é opcional (testes de integração) e **tem o schema apagado e recriado** a cada execução.
3. **Ambiente**
   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }   # nunca sobrescreve um .env existente
   notepad .env      # ajuste DATABASE_URL e TEST_DATABASE_URL
   ```
   O `.env` não é versionado nem enviado ao navegador. Variáveis: veja `.env.example`
   (`PORT`, `HOST`, `APP_TIMEZONE`, `SESSAO_DURACAO_MIN`, `COOKIE_SECURE`, `APP_ORIGENS`).
4. **Migrações** (somente para frente; nunca apagam dados):
   ```powershell
   npm run db:migrate
   ```
5. **Primeiro administrador** (pergunta nome, e-mail e senha; a senha não fica em arquivo):
   ```powershell
   npm run db:criar-admin
   ```
6. **Executar** e abrir <http://localhost:3000>:
   ```powershell
   npm run dev      # recarrega ao alterar arquivos
   npm start        # sem recarga
   ```
   Saúde: <http://localhost:3000/api/v1/health>.

Fluxo inicial sugerido: admin cria gerente → equipe com esse gerente → versão de parâmetros com o
valor do combustível (pode valer **hoje**) → gerente cadastra veículo, pontos (com coordenadas) e
motoristas → monta roteiros → motorista entra com o documento e registra as paradas.

## Dados de demonstração e de desempenho

Sequência completa e verificada (banco exclusivo, variáveis só na sessão do terminal, sem tocar
no `.env`): **`docs/roteiro-demonstracao.md` → Preparação**.

Os geradores usam `DADOS_DATABASE_URL` ou, na falta dele, `DATABASE_URL`; aplicam as migrações;
exigem `DEMO_SENHA` na sessão (sem valor padrão); e **recusam** bancos com roteiros e
`NODE_ENV=production`. Dados fictícios e reprodutíveis (semente fixa).

```powershell
npm run dados:demo          # 60 dias terminando ontem (4 motoristas)
npm run dados:desempenho    # 12 meses, 50 motoristas (~15 mil roteiros) — use outro banco, ex.: rotaclara_perf
```

Usuários criados: `admin@demo.rotaclara`, `gerente1@demo.rotaclara`, motoristas `DEMO00001`…
(documento), todos com a senha de `DEMO_SENHA`. Nunca coloque `DEMO_SENHA` no `.env` de produção.

## Testes e verificações

```powershell
npm run verificar    # sintaxe (node --check + imports do frontend) + ESLint + Vitest
npm test             # só Vitest
```

Sem `TEST_DATABASE_URL`, os testes de integração aparecem como **pulados**. Para rodá-los,
aponte `TEST_DATABASE_URL` para um banco cujo nome termine em `_test` (nunca o de desenvolvimento).

Medições (servidor rodando sobre a massa de desempenho):
```powershell
npm run medir:api                                        # tempos da API, 12 meses
npm i --no-save puppeteer-core                           # opcional; usa o Chrome instalado
node scripts/verificar-navegador.js --modo tempo         # tempo até os gráficos (desktop/360 px)
node scripts/verificar-navegador.js --modo telas --saida capturas   # 360 px e desktop
```
Resultados obtidos: `docs/relatorio-aceite.md`.

## Telas

| Página | Perfis | Função |
|---|---|---|
| `/` | todos | Login (e-mail ou documento) |
| `/inicio.html` | todos | Funções liberadas para o perfil |
| `/roteiros.html` | todos | Roteiros do dia (motorista: os próprios); montagem (gerente/admin) |
| `/roteiro.html?id=` | dono, gerente da equipe, admin | Coleta, totais, custo, encerramento, cancelamento, correção auditada |
| `/historico.html` | todos (escopo do perfil) | Paradas por período, paginação; **Exportar CSV** (gerente/admin) |
| `/dashboard.html` | todos (escopo do perfil) | Gráficos por dia, mês e período; maiores paradas |
| `/motoristas.html`, `/veiculos.html`, `/pontos.html` | gerente, admin | Cadastros com inativação |
| `/equipes.html`, `/gerentes.html`, `/parametros.html`, `/auditoria.html` | admin | Equipes, gerentes, parâmetros, auditoria |

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/escopo.md` | Escopo, entregáveis e etapas |
| `docs/decisoes.md` | Decisões, conciliações e pontos sinalizados |
| `docs/arquitetura.md` | Arquitetura, tecnologias e justificativas, segurança |
| `docs/modelo-dados.md` | Modelo de dados e correspondência com o Projeto Preliminar |
| `docs/api.md` | Referência da API e matriz de permissões |
| `docs/rastreabilidade.md` | RF/RNF/RN → implementação → testes |
| `docs/relatorio-aceite.md` | CT01–CT10, testes, desempenho, verificação em navegador, limitações |
| `docs/roteiro-demonstracao.md` | Roteiro da apresentação |
| `docs/diagramas/` | Componentes e implantação (Mermaid) |
| `base/` | Especificação de requisitos e Projeto Preliminar (PDF, referência) |

## Limitações

Retenção de dados pessoais (LGPD) ainda sem prazo definido pela equipe; o sistema aplica
minimização, controle de acesso e registro de acessos, mas não afirma conformidade legal
automática. Demais limitações: `docs/relatorio-aceite.md`.
