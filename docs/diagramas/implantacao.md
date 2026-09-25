# Diagrama de implantação e execução — RotaClara (proposta)

Editável: altere os blocos Mermaid abaixo.

## Desenvolvimento (Windows 11)

```mermaid
flowchart LR
  B["Navegador<br/>localhost:5173"]
  subgraph PC["Máquina de desenvolvimento"]
    V["Vite dev server :5173<br/>(apps/web)"]
    A["Fastify :3000<br/>(apps/api, Node.js 24 LTS)"]
    P[("PostgreSQL 17 :5432<br/>rotaclara_dev / rotaclara_test")]
  end
  B --> V
  V -- "proxy /api" --> A
  A -- "pg (TCP)" --> P
```

## Apresentação / homologação

```mermaid
flowchart LR
  D["Celular ou desktop"]
  subgraph S["Servidor (a definir)"]
    A["Node.js 24 — processo único<br/>Fastify: /api/v1 + SPA compilada"]
    P[("PostgreSQL 17")]
  end
  D -- "HTTPS" --> A
  A --> P
```

Fluxo de execução: `npm run db:migrate` (aplica migrações pendentes, nunca reseta) →
`npm run build` → `npm start`.
