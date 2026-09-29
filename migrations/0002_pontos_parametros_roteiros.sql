-- 0002 — Pontos, parâmetros versionados, roteiros e ocorrências (RoteiroPonto).
-- Decisões aplicadas (docs/decisoes.md): D02, D19, D20, D22/P03 (cópia do endereço),
-- D23/P04 (valores de custo copiados no roteiro), D04 (coordenadas opcionais, proposta),
-- D08 (ponto "não visitado", proposta), D03 (custo/km derivado, proposta).

-- Endereço reutilizável (UC04). Coordenadas ausentes = pendência (D04).
create table ponto (
  id            bigint generated always as identity primary key,
  nome          text,
  endereco      text          not null,
  latitude      numeric(9, 6),
  longitude     numeric(9, 6),
  ativo         boolean       not null default true,
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),
  constraint ponto_endereco_valido check (length(btrim(endereco)) between 1 and 300),
  constraint ponto_latitude_faixa check (latitude between -90 and 90),
  constraint ponto_longitude_faixa check (longitude between -180 and 180),
  constraint ponto_coordenadas_completas check ((latitude is null) = (longitude is null))
);

-- Parâmetros versionados com data de vigência (PP p.29–30). Rendimento fica no veículo (D03).
-- valor_combustivel nulo = ainda não informado; o custo do roteiro fica "não disponível".
create table parametro_sistema (
  id                bigint generated always as identity primary key,
  versao            integer        not null unique,
  vigente_desde     date           not null unique,
  jornada_min       integer        not null,
  valor_combustivel numeric(10, 3),
  criado_por        bigint         references usuario (id),
  criado_em         timestamptz    not null default now(),
  constraint parametro_versao_positiva check (versao > 0),
  constraint parametro_jornada_positiva check (jornada_min > 0),
  constraint parametro_combustivel_positivo check (valor_combustivel > 0)
);

-- Versão inicial: jornada de 480 minutos (RN04, RF10), válida desde sempre.
insert into parametro_sistema (versao, vigente_desde, jornada_min, valor_combustivel)
values (1, '-infinity', 480, null);

create table roteiro (
  id                bigint generated always as identity primary key,
  motorista_id      bigint         not null references motorista (usuario_id),
  -- Equipe do motorista no momento da montagem: preserva o escopo histórico do gerente.
  equipe_id         bigint         not null references equipe (id),
  data              date           not null,
  situacao          text           not null default 'planejado',
  distancia_km      numeric(9, 2),
  veiculo_id        bigint         references veiculo (id),
  -- Valores usados no cálculo do custo (D23/P04): não mudam com alterações posteriores.
  parametro_id      bigint         not null references parametro_sistema (id),
  valor_combustivel numeric(10, 3),
  rendimento_km_l   numeric(6, 2),
  custo_estimado    numeric(12, 2),
  -- Total parado em segundos (RN03), gravado na escrita para o dashboard (RNF03).
  total_parado_seg  integer        not null default 0,
  criado_por        bigint         not null references usuario (id),
  criado_em         timestamptz    not null default now(),
  atualizado_em     timestamptz    not null default now(),
  iniciado_em       timestamptz,
  encerrado_em      timestamptz,
  cancelado_em      timestamptz,
  constraint roteiro_situacao_valida
    check (situacao in ('planejado', 'em_execucao', 'encerrado', 'cancelado')),
  constraint roteiro_distancia_valida check (distancia_km >= 0),
  constraint roteiro_rendimento_positivo check (rendimento_km_l > 0),
  constraint roteiro_combustivel_positivo check (valor_combustivel > 0),
  constraint roteiro_custo_valido check (custo_estimado >= 0),
  constraint roteiro_total_valido check (total_parado_seg >= 0),
  constraint roteiro_encerrado_com_data check (situacao <> 'encerrado' or encerrado_em is not null),
  constraint roteiro_cancelado_com_data check (situacao <> 'cancelado' or cancelado_em is not null)
);

create index roteiro_data_idx on roteiro (data);
create index roteiro_motorista_data_idx on roteiro (motorista_id, data);
create index roteiro_equipe_data_idx on roteiro (equipe_id, data);

-- Ocorrência do ponto no roteiro (D02): ordem, cópia do endereço, horários e tempo parado.
create table roteiro_ponto (
  id               bigint generated always as identity primary key,
  roteiro_id       bigint        not null references roteiro (id),
  ponto_id         bigint        not null references ponto (id),
  ordem            integer       not null,
  endereco         text          not null,
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),
  chegada          timestamptz,
  saida            timestamptz,
  nao_visitado     boolean       not null default false,
  tempo_parado_seg integer,
  constraint roteiro_ponto_ordem_unica unique (roteiro_id, ordem),
  constraint roteiro_ponto_ordem_positiva check (ordem > 0),
  -- RN08: saída exige chegada e não pode antecedê-la.
  constraint roteiro_ponto_saida_apos_chegada
    check (saida is null or (chegada is not null and saida >= chegada)),
  -- D08: ponto não visitado não tem horários.
  constraint roteiro_ponto_nao_visitado_sem_horario
    check (not nao_visitado or (chegada is null and saida is null)),
  constraint roteiro_ponto_tempo_valido check (tempo_parado_seg >= 0),
  -- RN01: a partida (ordem 1) tem tempo parado zero.
  constraint roteiro_ponto_partida_sem_tempo check (ordem <> 1 or coalesce(tempo_parado_seg, 0) = 0)
);

create index roteiro_ponto_ponto_idx on roteiro_ponto (ponto_id);

-- RN06 + D19: ao final de cada transação, as ordens do roteiro são 1..n contínuas e n >= 2.
create function roteiro_verificar_ordens() returns trigger
language plpgsql as $$
declare
  alvo bigint;
  quantidade integer;
  menor integer;
  maior integer;
begin
  if tg_table_name = 'roteiro' then
    alvo := new.id;
  elsif tg_op = 'DELETE' then
    alvo := old.roteiro_id;
  else
    alvo := new.roteiro_id;
  end if;

  select count(*), min(ordem), max(ordem) into quantidade, menor, maior
    from roteiro_ponto where roteiro_id = alvo;

  if not exists (select 1 from roteiro where id = alvo) then
    return null;
  end if;

  if quantidade < 2 then
    raise exception 'Roteiro % deve ter pelo menos 2 pontos (tem %).', alvo, quantidade
      using errcode = '23514';
  end if;
  if menor <> 1 or maior <> quantidade then
    raise exception 'Ordens do roteiro % devem ser contínuas de 1 a %.', alvo, quantidade
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger roteiro_ordens_validas
  after insert on roteiro
  deferrable initially deferred
  for each row execute function roteiro_verificar_ordens();

create constraint trigger roteiro_ponto_ordens_validas
  after insert or update or delete on roteiro_ponto
  deferrable initially deferred
  for each row execute function roteiro_verificar_ordens();
