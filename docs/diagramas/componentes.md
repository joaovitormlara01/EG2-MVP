# Diagrama de componentes — RotaClara (proposta)

Editável: altere o bloco Mermaid abaixo. Boundaries do PP (p.22–27) viram páginas da SPA;
controladores viram módulos da API; entidades viram tabelas.

```mermaid
flowchart LR
  subgraph Navegador["Navegador (desktop / celular)"]
    direction TB
    W1[Login]
    W2[Cadastros: motoristas, gerentes, pontos]
    W3[Tela de roteiro]
    W4[Tela de ponto atual]
    W5[Histórico e relatório]
    W6[Dashboard]
    W7[Tela de parâmetros]
    CLI[Cliente HTTP /api/v1]
    W1 & W2 & W3 & W4 & W5 & W6 & W7 --> CLI
  end

  subgraph API["API — monólito modular (Fastify)"]
    direction TB
    MW[Autenticação por sessão + política de acesso]
    M1[auth]
    M2[cadastros]
    M3[pontos]
    M4[roteiros<br/>Controlador de roteiro]
    M5[coleta<br/>Controlador de parada]
    M6[parametros<br/>Controlador de parâmetros]
    M7[consultas<br/>consulta, indicadores, exportação]
    AUD[auditoria]
    CALC[regras de cálculo<br/>RN01–RN10]
    HL[health]
    MW --> M1 & M2 & M3 & M4 & M5 & M6 & M7
    M4 & M5 --> CALC
    M2 & M3 & M4 & M5 & M6 --> AUD
    M4 --> M6
  end

  subgraph BD["PostgreSQL 17"]
    T1[(usuario, sessao, equipe*)]
    T2[(motorista, gerente, veiculo)]
    T3[(ponto)]
    T4[(roteiro, roteiro_ponto)]
    T5[(parametro_sistema)]
    T6[(registro_auditoria)]
  end

  CLI -- "HTTPS JSON + cookie de sessão" --> MW
  M1 --> T1
  M2 --> T2
  M3 --> T3
  M4 & M5 & M7 --> T4
  M6 --> T5
  AUD --> T6
  HL --> BD
```

\* `equipe` depende da decisão D07.
