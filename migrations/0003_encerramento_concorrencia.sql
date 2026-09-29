-- 0003 — Ajustes das etapas 6–7.
-- 1) Decisão de encerramento registrada (substitui a proposta D08 "não visitado"): todos os pontos
--    planejados precisam de chegada e todos, exceto a partida, de saída. A coluna nao_visitado
--    deixa de existir (nenhum dado de produção existia; migração somente para frente).
-- 2) Controle de concorrência otimista (versao) e idempotência na criação de roteiros.
-- 3) Ordem única passa a ser verificada ao fim da transação, permitindo reordenar pontos
--    em várias linhas dentro de uma mesma transação.

alter table roteiro_ponto drop constraint roteiro_ponto_nao_visitado_sem_horario;
alter table roteiro_ponto drop column nao_visitado;

alter table roteiro_ponto drop constraint roteiro_ponto_ordem_unica;
alter table roteiro_ponto
  add constraint roteiro_ponto_ordem_unica unique (roteiro_id, ordem) deferrable initially deferred;

alter table roteiro add column versao integer not null default 1;
alter table roteiro add constraint roteiro_versao_positiva check (versao > 0);

-- Chave gerada pelo navegador a cada montagem: reenvio (duplo clique, nova tentativa) devolve
-- o mesmo roteiro em vez de criar outro.
alter table roteiro add column chave_idempotencia uuid;
create unique index roteiro_chave_idempotencia_unica on roteiro (chave_idempotencia)
  where chave_idempotencia is not null;

-- Jornada limitada a um dia (evita valores absurdos na parametrização).
alter table parametro_sistema
  add constraint parametro_jornada_maxima check (jornada_min <= 1440);
