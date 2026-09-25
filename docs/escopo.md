# Escopo do MVP — RotaClara

> "Cada parada conta." Autores: João Vitor Martins e Lara; Gabriel Fonseca Saliba.
> Fontes: `base/Especificação de Requisitos — Trabalho2.pdf` (**ER**, oficial) e
> `base/Projeto_Preliminar_RotaClara_…pdf` (**PP**). Em conflito, prevalece a ER; ver `decisoes.md`.

## Objetivo

Registrar chegada e saída de motoristas/motoboys em cada ponto do roteiro diário, calcular o tempo
parado (exceto na partida), manter histórico com endereços, exibir dashboard por dia/mês/período e
estimar o custo de combustível do roteiro (ER p.1; PP p.3).

## Entregáveis (ER p.4–5; PP p.32)

| # | Entregável | Requisitos |
|---|---|---|
| E-1 | Dashboard com gráficos de tempo parado por dia, mês e período | RF08 |
| E-2 | Histórico de pontos e tempos parados por período, com endereços | RF07 |
| E-3 | Módulo de coleta (chegada/saída por ocorrência do ponto) e identificação dos endereços do roteiro | RF03–RF06 |
| E-4 | Parâmetros de custo (combustível, rendimento, custo/km) | RF09, RF11 |
| E-5 | Parâmetros de cálculo do tempo parado, jornada inicial 480 min | RF10 |
| E-6 | Persistência: pontos, roteiros, motoristas, gerentes, parâmetros e auditoria | RNF01, RNF05 |
| E-7 | Exportação do relatório do período consultado (prioridade baixa, **incluída**) | RF12 |
| E-8 | Documento de especificação (entregue: Projeto Preliminar) | — |

## Incluído

- Autenticação e controle de acesso por perfil: motorista/motoboy, gerente/coordenador, administrador.
- Cadastros: motoristas (com veículo), gerentes, pontos (endereço + coordenadas), roteiros.
- `Ponto` (endereço reutilizável) separado de `RoteiroPonto` (ocorrência com ordem, chegada, saída e
  tempo parado).
- Registro de chegada/saída em interface web responsiva (celular do entregador).
- Cálculos no servidor: tempo por ponto, total do roteiro, percentual da jornada, custo/km e custo estimado.
- Parâmetros versionados com vigência; roteiro guarda a versão/valores usados.
- Preservação histórica: endereço e parâmetros usados no roteiro não mudam com edições posteriores.
- Correção auditada de pontos/horários encerrados (gerente/admin); inativação em vez de exclusão física.
- Histórico, dashboard (dia, mês, período) e exportação.
- Requisitos de LGPD: minimização, acesso por perfil, rastreabilidade.

## Excluído (ER p.2; PP p.3)

- Roteirização automática ou otimização de rotas (a distância é informada, não calculada).
- Integração com ERP ou folha de pagamento.
- Rastreamento em tempo real e telemetria embarcada.
- Aplicativo nativo publicado em lojas.

## Etapas de implementação

Referenciadas em `rastreabilidade.md`.

| Etapa | Conteúdo |
|---|---|
| I1 | Requisitos (este documento, rastreabilidade, decisões) |
| I2 | Arquitetura (`arquitetura.md`) |
| I3 | Fundação executável: estrutura, banco de dev, health check, testes e lint |
| I4 | Autenticação, perfis, equipes, auditoria base |
| I5 | Cadastros: motoristas/veículos, gerentes, pontos |
| I6 | Montagem de roteiro (ordem, partida, estados) |
| I7 | Coleta de chegada/saída, cálculos de tempo, encerramento, correções auditadas |
| I8 | Parâmetros versionados e custo estimado |
| I9 | Histórico e dashboard (dia, mês, período) |
| I10 | Exportação de relatório |
| I11 | Verificação final: desempenho (12 meses < 3 s), LGPD, CT01–CT10 |
