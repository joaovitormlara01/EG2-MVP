# Diagrama de componentes — RotaClara

Estado final (etapas I1–I11). Boundaries do PP (p.22–27) → páginas HTML; controladores →
módulos da API; entidades → tabelas. Editável: altere o bloco Mermaid.

```mermaid
flowchart LR
  subgraph Navegador["Navegador (desktop / celular) — HTML, CSS, ES modules, sem build"]
    direction TB
    P1["index.html · inicio.html"]
    P2["roteiros.html · roteiro.html<br/>(Tela de roteiro / Tela de ponto atual)"]
    P3["motoristas · veiculos · pontos<br/>equipes · gerentes"]
    P4["historico.html (+ CSV)"]
    P5["dashboard.html<br/>Chart.js 4 (UMD)"]
    P6["parametros.html · auditoria.html"]
    M["js/api.js (fetch) · sessao.js · layout.js<br/>ui.js · dom.js · formatacao.js · consultas.js · cadastro.js"]
    P1 & P2 & P3 & P4 & P5 & P6 --> M
  end

  subgraph APP["Node.js 24 — processo único (Fastify 5)"]
    direction TB
    ST["@fastify/static<br/>public/ + /vendor/chart.js/"]
    subgraph API["/api/v1 — monólito modular"]
      direction TB
      SEG["seguranca-api<br/>sessão · Origin/Sec-Fetch-Site · JSON · pode()"]
      HL[health]
      AU[auth]
      CA[cadastros]
      PO[pontos]
      RO["roteiros<br/>Controladores de roteiro e parada"]
      PA["parametros<br/>Controlador de parâmetros"]
      CO["consultas<br/>consulta · indicadores · exportação CSV"]
      AD["auditoria (leitura)"]
      CALC["shared/calculos.js<br/>RN01–RN04, RN07 (BigInt)"]
      AUT["shared/autorizacao.js<br/>matriz PP p.7"]
      REG["shared/auditoria.js"]
      SEG --> AU & CA & PO & RO & PA & CO & AD
      RO & CO --> CALC
      SEG --> AUT
      CA & PO & RO & PA & CO & AU --> REG
    end
  end

  subgraph BD["PostgreSQL 17"]
    T1[("usuario · sessao · equipe")]
    T2[("motorista · veiculo · ponto")]
    T3[("roteiro · roteiro_ponto")]
    T4[("parametro_sistema")]
    T5[("registro_auditoria (imutável)")]
    T6[("schema_migrations")]
  end

  Navegador -- "GET páginas/CSS/JS" --> ST
  M -- "HTTPS JSON + cookie HttpOnly (mesma origem)" --> SEG
  AU --> T1
  CA --> T1 & T2
  PO --> T2
  RO --> T3 & T4
  PA --> T4
  CO --> T3 & T4
  AD & REG --> T5
  HL --> BD
```
