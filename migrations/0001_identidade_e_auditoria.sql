-- 0001 — Usuários, equipes, veículos, motoristas, sessões e auditoria imutável.
-- Decisões aplicadas (docs/decisoes.md): D07 (equipe, proposta), D05 (veículo opcional, proposta),
-- D21 (inativação em vez de exclusão física), RNF05 (auditoria imutável).

create table usuario (
  id            bigint generated always as identity primary key,
  nome          text        not null,
  email         text,
  telefone      text,
  perfil        text        not null,
  senha_hash    text        not null,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuario_nome_valido check (length(btrim(nome)) between 1 and 150),
  constraint usuario_perfil_valido check (perfil in ('motorista', 'gerente', 'admin')),
  -- Gerente (RF02) e administrador entram por e-mail; motorista pode entrar pelo documento.
  constraint usuario_email_obrigatorio check (perfil = 'motorista' or email is not null),
  constraint usuario_email_formato check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index usuario_email_unico on usuario (lower(email)) where email is not null;

create table equipe (
  id            bigint generated always as identity primary key,
  nome          text        not null,
  gerente_id    bigint      references usuario (id),
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint equipe_nome_valido check (length(btrim(nome)) between 1 and 100)
);

create unique index equipe_nome_unico on equipe (lower(nome));
create index equipe_gerente_idx on equipe (gerente_id);

create table veiculo (
  id              bigint generated always as identity primary key,
  placa           text         not null,
  descricao       text,
  rendimento_km_l numeric(6, 2) not null,
  ativo           boolean      not null default true,
  criado_em       timestamptz  not null default now(),
  atualizado_em   timestamptz  not null default now(),
  constraint veiculo_rendimento_positivo check (rendimento_km_l > 0)
);

create unique index veiculo_placa_unica on veiculo (upper(placa));

create table motorista (
  usuario_id bigint primary key references usuario (id),
  documento  text   not null,
  equipe_id  bigint not null references equipe (id),
  veiculo_id bigint references veiculo (id),
  constraint motorista_documento_valido check (length(btrim(documento)) between 1 and 30)
);

create unique index motorista_documento_unico on motorista (documento);
create index motorista_equipe_idx on motorista (equipe_id);

-- Sessões opacas: o banco guarda apenas o SHA-256 do token entregue no cookie.
create table sessao (
  id          bigint generated always as identity primary key,
  token_hash  bytea       not null unique,
  usuario_id  bigint      not null references usuario (id),
  criada_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  revogada_em timestamptz,
  constraint sessao_expiracao_valida check (expira_em > criada_em)
);

create index sessao_usuario_idx on sessao (usuario_id);

-- Auditoria (RNF05, RN09): quem, quando, entidade, operação, antes e depois.
create table registro_auditoria (
  id             bigint generated always as identity primary key,
  ocorrido_em    timestamptz not null default now(),
  usuario_id     bigint      references usuario (id),
  entidade       text        not null,
  entidade_id    text,
  acao           text        not null,
  valor_anterior jsonb,
  valor_novo     jsonb
);

create index registro_auditoria_entidade_idx on registro_auditoria (entidade, entidade_id);
create index registro_auditoria_ocorrido_idx on registro_auditoria (ocorrido_em);

create function registro_auditoria_bloquear_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'registro_auditoria é imutável: operação % não permitida', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger registro_auditoria_sem_update_delete
  before update or delete on registro_auditoria
  for each row execute function registro_auditoria_bloquear_alteracao();

create trigger registro_auditoria_sem_truncate
  before truncate on registro_auditoria
  for each statement execute function registro_auditoria_bloquear_alteracao();
