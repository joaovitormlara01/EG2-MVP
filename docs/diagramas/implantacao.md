# Diagrama de implantação e execução — RotaClara

Sem etapa de build: o mesmo processo Node.js serve a API e os arquivos do frontend (mesma
origem, sem CORS). Editável: altere os blocos Mermaid.

## Desenvolvimento e demonstração (Windows 11)

```mermaid
flowchart LR
  B["Navegador<br/>http://localhost:3000"]
  subgraph PC["Máquina local"]
    A["Node.js 24 — npm run dev / npm start<br/>Fastify :3000 → /api/v1 + public/"]
    P[("PostgreSQL 17 :5432<br/>rotaclara_dev · rotaclara_test · rotaclara_demo")]
    S["scripts: db:migrate · db:criar-admin<br/>dados:demo · dados:desempenho · medir:api"]
  end
  B -- "HTTP" --> A
  A -- "pg (TCP)" --> P
  S --> P
```

## Homologação / produção (hospedagem a definir)

```mermaid
flowchart LR
  D["Celular ou desktop"]
  subgraph S["Servidor"]
    R["Proxy HTTPS (TLS)"]
    A["Node.js 24 — processo único<br/>NODE_ENV=production · cookie Secure<br/>trustProxy ativo"]
    P[("PostgreSQL 17")]
  end
  D -- "HTTPS" --> R --> A --> P
```

Sequência de implantação: `npm ci --omit=dev` → `npm run db:migrate` (aplica pendentes; nunca
apaga) → `npm run db:criar-admin` (primeira vez) → `npm start`.
