-- 0004 — Decisões confirmadas (D04, D05) e índices para histórico/dashboard (RNF03).
-- As restrições são NOT VALID: valem para toda linha nova ou alterada, sem reescrever nem
-- rejeitar registros antigos que já existam em algum banco (preservação histórica).

-- D04 confirmada: pontos operacionais exigem coordenadas.
alter table ponto
  add constraint ponto_coordenadas_obrigatorias
  check (latitude is not null and longitude is not null) not valid;

-- D05 confirmada: o motorista pode ser cadastrado sem veículo, mas todo roteiro operacional
-- precisa de veículo (o rendimento copiado no roteiro é preservado).
alter table roteiro
  add constraint roteiro_veiculo_obrigatorio check (veiculo_id is not null) not valid;

-- Consultas por período (histórico, dashboard, exportação) filtram situação e data do roteiro.
-- (roteiro_ponto já tem índice único em (roteiro_id, ordem).)
create index roteiro_situacao_data_idx on roteiro (data, situacao);
