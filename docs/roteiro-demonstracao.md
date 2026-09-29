# Roteiro de demonstração — RotaClara

> **RotaClara — Cada parada conta.**
> Apresentação: **João Vitor Martins e Lara** (gerente e administrador, no computador) e
> **Gabriel Fonseca Saliba** (motorista, no celular ou no navegador em modo celular).
> Duração sugerida: 15–20 min. O roteiro foi ensaiado de ponta a ponta pela interface em 29/09/2026.

## Preparação (antes da apresentação)

Sequência verificada em 29/09/2026 num PostgreSQL 17 novo e isolado. Em PowerShell, na pasta do
projeto. Nada disto altera o `.env` nem o serviço do PostgreSQL além de criar um usuário e um
banco **só para a demo**. As variáveis ficam apenas nesta janela do terminal (têm precedência
sobre um `.env` existente) e **não** devem ir para configuração de produção.

```powershell
# 0. Pré-requisitos: Node.js 24 e PostgreSQL 17 instalados; na pasta do projeto:
npm ci

# 1. Usuário e banco exclusivos da demo (pede a senha do superusuário "postgres")
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE rotaclara_demo LOGIN PASSWORD 'troque-esta-senha-demo'" -c "CREATE DATABASE rotaclara_demo OWNER rotaclara_demo"

# 2. Configurar ESTA sessão antes de migrar ou gerar dados
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://rotaclara_demo:troque-esta-senha-demo@localhost:5432/rotaclara_demo"
$env:DEMO_SENHA = "escolha-uma-senha-so-para-a-demo"

# 3. Migrações, dados fictícios (60 dias terminando ONTEM) e servidor
npm run db:migrate
npm run dados:demo
npm start            # http://localhost:3000
```

O gerador recusa: banco que já tenha roteiros, `NODE_ENV=production` e `DEMO_SENHA` ausente
(ou com menos de 8 caracteres). Para repetir a demo do zero, recrie o banco (troque o passo 1 por
`-c "DROP DATABASE rotaclara_demo" -c "CREATE DATABASE rotaclara_demo OWNER rotaclara_demo"`) e
rode os passos 2–3 na mesma janela.

Usuários criados (todos com a senha de `DEMO_SENHA`):

| Papel | Login |
|---|---|
| Administrador | `admin@demo.rotaclara` |
| Gerente da Equipe Centro | `gerente1@demo.rotaclara` |
| Motorista (Equipe Centro) | documento `DEMO00001` |

Deixe abertas duas janelas: uma normal (João) e uma anônima ou o celular na mesma rede (Gabriel).
Para o celular acessar, rode com `$env:HOST = "0.0.0.0"; npm start` e abra `http://<IP do computador>:3000` (mesma rede).

## Roteiro

| # | Quem | Ação | O que mostrar (critério) |
|---|---|---|---|
| 0 | João | Entra como **admin**; mostra o menu por perfil. | Autenticação e perfis (UC01, RNF04) |
| 6a | João | **Parâmetros** → nova versão vigente **hoje**: jornada 480, combustível **6,00**. | Mudança sem alterar código (RF09, RF10). Mensagem: roteiros existentes mantêm os valores |
| 6b | João | Abre um roteiro de **ontem** (Roteiros → data de ontem). | Continua com a versão anterior (6,290/L, 420 min): histórico preservado (D10) |
| — | João | Sai e entra como **gerente1**. **Veículos** → cadastra placa `CTS6A26`, rendimento **12**. | Cadastro com validação |
| — | João | **Roteiros** → monta **roteiro A** com data de **ontem** para *Ana* (2 pontos). Mostra o aviso de outro roteiro no mesmo dia. | Vários roteiros por dia, com aviso (D12) |
| 5 | João | Monta **roteiro B** para **hoje**: *Ana*, veículo `CTS6A26`, **120 km**, 3 pontos. Abre o detalhe. | **RN07 / CT06: R$ 0,5000/km e R$ 60,00**; versão de parâmetros usada |
| 1–2 | Gabriel | Entra com `DEMO00001` no celular → **Meus roteiros** → roteiro B → **Registrar chegada** na partida; depois chegada e saída na parada 1. | Partida com selo **"Não conta no tempo parado"** e **0 min (partida)**; confirmação salva; tempo da parada calculado pelo servidor |
| 7 | Gabriel | Abre `/parametros.html` pelo endereço. | **"Acesso negado"**; a API também responde 403 (CT10) |
| — | Gabriel | Roteiro A (ontem) → registra chegada na partida e na parada 1, saída da parada 1 → **Encerrar roteiro** (confirmação na tela). | Estados planejado → em execução → encerrado; RN10 |
| 8 | João | Roteiro A → **Corrigir horários** (em qualquer ordem): parada 1 **09:00–09:15** e partida **08:00–08:20**, data de ontem, motivo "Demonstração CT01". | **CT01: 0 min / 15 min / total 15 min**; correção só por gerente (RN09) |
| 8 | João | Sai; entra como **admin** → roteiro A → "Ver auditoria deste roteiro". | Usuário, data/hora, antes e depois, motivo (CT08, RNF05) |
| 3 | João | **Histórico** → período de ontem. Clica no nº do roteiro A. | Endereço histórico, data, chegada, saída, duração e link para a ocorrência (CT04) |
| 4 | João | **Dashboard** → últimos 60 dias → **Por dia**, **Por mês**, **Período inteiro**; clica numa barra. | Três recortes com os mesmos dados (CT03); percentual com a base "dias de motorista com roteiro"; custo parcial/indisponível sinalizado; drill-down para o histórico |
| 9 | João | **Histórico** → mesmo período → **Exportar CSV**; abre no Excel. | Linhas = total do histórico; bloco de totais; acentos corretos; exportação registrada na auditoria (UC12) |

## Frases de apoio

- "O primeiro ponto é a partida: mesmo com horário registrado, conta **zero**."
- "O navegador não calcula nada: totais, percentual e custo vêm do servidor."
- "Mudar parâmetro não reescreve o passado: cada roteiro guarda a versão que usou."
- "O percentual divide o tempo parado pela jornada de cada dia de motorista **com roteiro**; dias sem roteiro não entram."

## Se algo der errado

- Hoje já tem roteiro para *Ana* antes do passo 5 → o custo usa a versão já capturada no dia
  (política motorista/data). Use outro motorista sem roteiro hoje.
- Nova versão de parâmetros no mesmo dia → escolha a data seguinte (uma versão por data).
- Horários da correção no futuro são recusados (a correção restaura horários históricos) → use a data de **ontem** no roteiro A.
