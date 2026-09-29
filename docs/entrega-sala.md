# Entrega em sala — RotaClara

> **RotaClara — Cada parada conta.**
> Apresentação: **João Vitor Martins e Lara** e **Gabriel Fonseca Saliba**.
> Fonte dos comandos: `docs/roteiro-demonstracao.md` (sequência verificada em 29/09/2026).
> Roteiro completo (15–20 min): `docs/roteiro-demonstracao.md`. Resultados: `docs/relatorio-aceite.md`.

## 1. Preparação e início (PowerShell, na pasta do projeto)

Regras:

- Não apague bancos existentes nem edite o `.env`: tudo abaixo usa um banco **exclusivo**
  (`rotaclara_demo`) e variáveis **só desta janela** do terminal.
- Troque os marcadores antes de executar:
  - `<SENHA_BANCO_DEMO>`: senha do usuário de banco `rotaclara_demo` (usada 2 vezes).
  - `<SENHA_DEMO>`: senha dos usuários da aplicação (mínimo 8 caracteres).
- Não grave essas senhas no `.env` nem em configuração de produção.

### 1.1 Pré-requisitos (Node.js 24 e PostgreSQL 17 instalados)

```powershell
npm ci
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
```

### 1.2 Banco exclusivo da demo (somente se ainda não existir)

Verifique primeiro (pede a senha do superusuário `postgres`):

```powershell
& $psql -U postgres -h localhost -c "\l rotaclara_demo"
```

Se a lista vier vazia, crie o usuário e o banco:

```powershell
& $psql -U postgres -h localhost -c "CREATE ROLE rotaclara_demo LOGIN PASSWORD '<SENHA_BANCO_DEMO>'"
& $psql -U postgres -h localhost -c "CREATE DATABASE rotaclara_demo OWNER rotaclara_demo"
```

Se o banco já existir com dados da demo, pule para 1.3 e depois só rode `npm start` (o gerador
recusa bancos que já têm roteiros; nada é sobrescrito).

### 1.3 Configurar esta janela do terminal

```powershell
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://rotaclara_demo:<SENHA_BANCO_DEMO>@localhost:5432/rotaclara_demo"
$env:DEMO_SENHA = "<SENHA_DEMO>"
```

### 1.4 Migrações, dados fictícios e servidor

```powershell
npm run db:migrate
npm run dados:demo
npm start
```

Abrir <http://localhost:3000>. `dados:demo` cria 60 dias de histórico terminando **ontem**.

Para o celular do Gabriel acessar pela mesma rede, inicie assim em vez de `npm start`:

```powershell
$env:HOST = "0.0.0.0"
npm start
```

e abra `http://<IP_DO_COMPUTADOR>:3000` no celular.

## 2. Contas de demonstração

- Administrador: `admin@demo.rotaclara`
- Gerente (Equipe Centro): `gerente1@demo.rotaclara`
- Motorista (Equipe Centro, "Ana"): documento `DEMO00001`

Todas usam a senha definida localmente em `$env:DEMO_SENHA` **no momento em que
`npm run dados:demo` foi executado**. Não há senha padrão no código: sem `DEMO_SENHA`, o
gerador não roda. Se esquecer a senha, recrie o banco da demo e gere os dados de novo.

## 3. Roteiro de 5–7 minutos

**João — abertura (0:00–0:40).** Apresenta o problema: tempo parado por ponto, custo e
histórico. Entra como `admin@demo.rotaclara` e mostra o menu por perfil.

**João — parâmetros (0:40–1:30).** Parâmetros → nova versão vigente **hoje**: jornada 480,
combustível 6,00. Abre um roteiro de ontem e mostra que ele mantém a versão anterior.

**João — montagem e custo (1:30–2:40).** Sai e entra como `gerente1@demo.rotaclara`.
- Veículos → cadastra placa `CTS6A26`, rendimento 12.
- Roteiros → roteiro A com data de **ontem** para *Ana* (2 pontos).
- Roteiro B para **hoje**: *Ana*, veículo `CTS6A26`, 120 km, 3 pontos.
- Abre o roteiro B e mostra o custo.

**Gabriel — coleta no celular (2:40–4:00).**
- Entra com o documento `DEMO00001` → Meus roteiros → roteiro B.
- Registra a chegada na partida (0 min), depois a chegada e a saída na parada 1.
- Abre `/parametros.html` pelo endereço e mostra "Acesso negado".
- No roteiro A: registra as chegadas e a saída da parada 1, depois **Encerrar roteiro**.

**João — correção e auditoria (4:00–5:00).**
- Como gerente, roteiro A → Corrigir horários, em qualquer ordem:
  parada 1 09:00–09:15 e partida 08:00–08:20 (data de ontem), motivo "Demonstração CT01".
- Entra como admin → roteiro A → "Ver auditoria deste roteiro".

**João — histórico, dashboard e CSV (5:00–6:30).**
- Histórico do dia de ontem → clica no nº do roteiro A.
- Dashboard (últimos 60 dias) → Por dia, Por mês, Período inteiro.
- Histórico → Exportar CSV → abre no Excel.

**Gabriel — fechamento (6:30–7:00).** Lê a seção 5 (limitações) em uma frase cada.

## 4. Os nove pontos demonstrados

**1. Partida conta zero**
- Tela: `roteiro.html` (roteiro A, após a correção; e roteiro B na coleta).
- Ação: ver o ponto 1.
- Esperado: selo "Não conta no tempo parado" e "0 min (partida)".

**2. Chegada/saída e totais corretos**
- Tela: `roteiro.html`.
- Ação: registrar chegada e saída; depois ver o roteiro A corrigido.
- Esperado: confirmação "registrada às HH:MM… salvo no servidor"; parada 1 = 15 min;
  total = 15 min (CT01).

**3. Histórico ligado a endereços e horários**
- Tela: `historico.html`.
- Ação: período de ontem; clicar no nº do roteiro A.
- Esperado: endereço histórico, data, chegada, saída e duração; o link abre o ponto no roteiro.

**4. Gráficos por dia, mês e período**
- Tela: `dashboard.html`.
- Ação: alternar os três recortes; clicar numa barra.
- Esperado: três gráficos desenhados em cada recorte, com os mesmos totais; o clique abre o histórico.

**5. Custo de combustível (RN07)**
- Tela: `roteiro.html` (roteiro B).
- Ação: ver "Custo estimado".
- Esperado: R$ 0,5000/km e R$ 60,00 (6,00 ÷ 12 × 120).

**6. Parâmetros sem mudar código nem o histórico**
- Tela: `parametros.html`, depois um roteiro de ontem.
- Ação: criar versão vigente hoje.
- Esperado: mensagem de versão criada; o roteiro de ontem continua com a versão anterior.

**7. Operação proibida rejeitada**
- Tela: `parametros.html` com o login do motorista.
- Ação: abrir a página pelo endereço.
- Esperado: "Acesso negado" (a API responde 403).

**8. Correção autorizada com auditoria**
- Tela: `roteiro.html` (gerente) e `auditoria.html` (admin).
- Ação: corrigir horários com motivo; abrir a auditoria do roteiro.
- Esperado: registros "corrigir" com usuário, data/hora, antes, depois e motivo.

**9. CSV do período selecionado**
- Tela: `historico.html`.
- Ação: Exportar CSV do mesmo período.
- Esperado: o arquivo tem o mesmo número de paradas do histórico, um bloco de totais e acentos corretos.

## 5. Limitações (declaração honesta)

- **RNF03 parcialmente atendido.** Dashboard de 12 meses abaixo de 1 s em desktop e em
  celular 360 px nesta máquina. Com CPU 4× mais lenta (celular modesto simulado), passou de
  3 s em parte das execuções (máximo de 3,33 s numa sessão). Não medido em servidor e rede reais.
- **Retenção de dados pessoais (LGPD) indefinida.** Nada é apagado automaticamente. O sistema
  não afirma conformidade legal automática.
- **Correção de parâmetro no mesmo dia.** Só existe uma versão por data de vigência. Um valor
  lançado errado hoje é corrigido com nova versão a partir de amanhã. Roteiros já montados
  mantêm a versão que capturaram.

## 6. Checklist antes da aula

- [ ] Banco disponível: `& $psql -U postgres -h localhost -c "\l rotaclara_demo"` lista o banco.
- [ ] Terminal configurado: as três variáveis da seção 1.3 definidas nesta janela.
- [ ] Aplicação inicia: `npm start` sem erro; <http://localhost:3000/api/v1/health> mostra `"banco":"ok"`.
- [ ] Logins funcionam: admin, gerente1 e `DEMO00001` entram com `<SENHA_DEMO>`.
- [ ] Dados de demo existem: Roteiros com a data de ontem lista roteiros; Histórico não está vazio.
- [ ] Hoje sem roteiro para *Ana* (senão o custo usa a versão já capturada no dia).
- [ ] Gráficos carregam: Dashboard mostra três gráficos em Por dia, Por mês e Período.
- [ ] CSV baixa: Histórico → Exportar CSV gera o arquivo e abre no Excel.
- [ ] Celular do Gabriel acessa pelo IP (se usar a rede) ou janela anônima pronta.
