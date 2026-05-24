begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.agent_strategy as enum ('Macro', 'Sports', 'Contrarian', 'Yield', 'Tech', 'Custom');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agent_status as enum ('draft', 'active', 'paused', 'retired', 'slashed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.wallet_provider as enum (
    'circle_developer_controlled',
    'circle_user_controlled',
    'external'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.wallet_purpose as enum (
    'agent_treasury',
    'user_embedded',
    'delegation_vault',
    'protocol_ops',
    'gateway'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.prediction_status as enum ('draft', 'submitted', 'active', 'resolved', 'void');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.delegation_status as enum ('active', 'withdrawing', 'withdrawn', 'slashed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.vault_transaction_type as enum (
    'stake_deposit',
    'stake_release',
    'delegation_deposit',
    'delegation_withdrawal',
    'slash',
    'fee',
    'payout',
    'call_unlock'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.transaction_status as enum (
    'created',
    'pending',
    'confirmed',
    'failed',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.call_unlock_source as enum ('usdc', 'gateway', 'free', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.risk_severity as enum ('info', 'warning', 'critical');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  wallet_address text,
  role text not null default 'user',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique,
  name text not null,
  strategy public.agent_strategy not null,
  description text,
  status public.agent_status not null default 'draft',
  arc_erc8004_id numeric(78, 0),
  registry_agent_id text unique,
  metadata_uri text,
  metadata_hash text,
  wallet_address text,
  circle_wallet_id text,
  staked_usdc numeric(20, 6) not null default 0 check (staked_usdc >= 0),
  delegation_cap_usdc numeric(20, 6) not null default 0 check (delegation_cap_usdc >= 0),
  delegated_usdc numeric(20, 6) not null default 0 check (delegated_usdc >= 0),
  gateway_balance_usdc numeric(20, 6) not null default 0 check (gateway_balance_usdc >= 0),
  reputation_score numeric(8, 4) not null default 0 check (reputation_score >= 0),
  brier_score numeric(8, 6) not null default 0 check (brier_score >= 0),
  validation_count integer not null default 0 check (validation_count >= 0),
  slashed boolean not null default false,
  contract_pointers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_wallets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  provider public.wallet_provider not null,
  purpose public.wallet_purpose not null,
  circle_wallet_id text,
  wallet_set_id text,
  address text not null,
  blockchain text not null default 'ARC-TESTNET',
  custody_type text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, purpose, address)
);

create table if not exists public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  strategy_config jsonb not null default '{}'::jsonb,
  risk_limits jsonb not null default '{}'::jsonb,
  prediction_signing_key_id text,
  prediction_key_hash text,
  earnings_call_config jsonb not null default '{}'::jsonb,
  gateway_config jsonb not null default '{}'::jsonb,
  min_confidence_bps integer not null default 5000 check (
    min_confidence_bps between 0 and 10000
  ),
  max_active_predictions integer not null default 5 check (max_active_predictions > 0),
  max_daily_loss_usdc numeric(20, 6) not null default 0 check (max_daily_loss_usdc >= 0),
  max_slippage_bps integer not null default 100 check (max_slippage_bps between 0 and 10000),
  delegation_cap_usdc numeric(20, 6) not null default 0 check (delegation_cap_usdc >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  config_id uuid references public.agent_configs(id) on delete set null,
  market_id text not null,
  question text not null,
  prediction_hash text not null unique,
  signature_hash text,
  signed_payload jsonb not null default '{}'::jsonb,
  agent_probability_bps integer not null check (agent_probability_bps between 0 and 10000),
  market_probability_bps integer check (market_probability_bps between 0 and 10000),
  confidence_bps integer not null check (confidence_bps between 0 and 10000),
  stake_at_risk_usdc numeric(20, 6) not null default 0 check (stake_at_risk_usdc >= 0),
  status public.prediction_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  resolves_at timestamptz,
  tx_hash text,
  arc_block_number bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null unique references public.predictions(id) on delete cascade,
  resolver_id uuid references public.profiles(id) on delete set null,
  outcome boolean not null,
  actual_probability_bps integer check (actual_probability_bps between 0 and 10000),
  resolved_at timestamptz not null default now(),
  brier_score numeric(8, 6) not null check (brier_score >= 0),
  reputation_delta numeric(10, 4) not null default 0,
  settlement_tx_hash text,
  evidence_uri text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  prediction_id uuid references public.predictions(id) on delete set null,
  event_type text not null,
  previous_score numeric(8, 4) not null default 0,
  new_score numeric(8, 4) not null default 0,
  brier_score numeric(8, 6),
  validation_count integer not null default 0 check (validation_count >= 0),
  delta numeric(10, 4) not null default 0,
  reason text,
  tx_hash text,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  vault_address text,
  amount_usdc numeric(20, 6) not null check (amount_usdc > 0),
  shares numeric(38, 18) not null default 0 check (shares >= 0),
  status public.delegation_status not null default 'active',
  entry_tx_hash text,
  exit_tx_hash text,
  delegated_at timestamptz not null default now(),
  unlocks_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_transactions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  delegation_id uuid references public.delegations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  tx_type public.vault_transaction_type not null,
  amount_usdc numeric(20, 6) not null default 0 check (amount_usdc >= 0),
  shares numeric(38, 18) not null default 0 check (shares >= 0),
  tx_hash text,
  contract_address text,
  block_number bigint,
  status public.transaction_status not null default 'created',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.earnings_calls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  call_date date not null,
  title text not null,
  summary text,
  transcript text,
  audio_url text,
  content_hash text,
  price_usdc numeric(20, 6) not null default 0 check (price_usdc >= 0),
  is_free_preview boolean not null default false,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, call_date)
);

create table if not exists public.circle_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  agent_wallet_id uuid references public.agent_wallets(id) on delete set null,
  circle_id text unique,
  transaction_type text not null,
  blockchain text not null default 'ARC-TESTNET',
  source_address text,
  destination_address text,
  token_address text,
  amount_usdc numeric(20, 6) not null default 0 check (amount_usdc >= 0),
  status public.transaction_status not null default 'created',
  tx_hash text,
  idempotency_key text unique,
  request_body jsonb not null default '{}'::jsonb,
  response_body jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_unlocks (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.earnings_calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_source public.call_unlock_source not null default 'usdc',
  amount_usdc numeric(20, 6) not null default 0 check (amount_usdc >= 0),
  tx_hash text,
  circle_transaction_id uuid references public.circle_transactions(id) on delete set null,
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (call_id, user_id)
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'circle',
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  config_id uuid references public.agent_configs(id) on delete set null,
  severity public.risk_severity not null default 'info',
  event_type text not null,
  metric text,
  observed_value numeric,
  limit_value numeric,
  action_taken text,
  tx_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'user',
  action text not null,
  table_name text,
  record_id uuid,
  old_record jsonb,
  new_record jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists agents_owner_idx on public.agents (owner_id);
create index if not exists agents_status_strategy_idx on public.agents (status, strategy);
create index if not exists agents_erc8004_idx on public.agents (arc_erc8004_id);
create index if not exists agent_wallets_agent_idx on public.agent_wallets (agent_id);
create index if not exists agent_configs_agent_active_idx on public.agent_configs (agent_id, is_active);
create index if not exists predictions_agent_status_idx on public.predictions (agent_id, status);
create index if not exists predictions_market_idx on public.predictions (market_id);
create index if not exists prediction_outcomes_prediction_idx on public.prediction_outcomes (prediction_id);
create index if not exists reputation_events_agent_time_idx on public.reputation_events (agent_id, event_at desc);
create index if not exists delegations_delegator_idx on public.delegations (delegator_id, status);
create index if not exists delegations_agent_idx on public.delegations (agent_id, status);
create index if not exists vault_transactions_agent_idx on public.vault_transactions (agent_id, created_at desc);
create index if not exists earnings_calls_agent_published_idx on public.earnings_calls (agent_id, published_at desc);
create index if not exists call_unlocks_user_idx on public.call_unlocks (user_id, unlocked_at desc);
create index if not exists circle_transactions_user_idx on public.circle_transactions (user_id, created_at desc);
create index if not exists circle_transactions_agent_idx on public.circle_transactions (agent_id, created_at desc);
create index if not exists webhook_events_processed_idx on public.webhook_events (processed_at) where processed_at is null;
create index if not exists risk_events_agent_idx on public.risk_events (agent_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

drop trigger if exists set_agent_wallets_updated_at on public.agent_wallets;
create trigger set_agent_wallets_updated_at
before update on public.agent_wallets
for each row execute function public.set_updated_at();

drop trigger if exists set_predictions_updated_at on public.predictions;
create trigger set_predictions_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

drop trigger if exists set_delegations_updated_at on public.delegations;
create trigger set_delegations_updated_at
before update on public.delegations
for each row execute function public.set_updated_at();

drop trigger if exists set_earnings_calls_updated_at on public.earnings_calls;
create trigger set_earnings_calls_updated_at
before update on public.earnings_calls
for each row execute function public.set_updated_at();

drop trigger if exists set_circle_transactions_updated_at on public.circle_transactions;
create trigger set_circle_transactions_updated_at
before update on public.circle_transactions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, metadata)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_profile();

alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.agent_wallets enable row level security;
alter table public.agent_configs enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_outcomes enable row level security;
alter table public.reputation_events enable row level security;
alter table public.delegations enable row level security;
alter table public.vault_transactions enable row level security;
alter table public.earnings_calls enable row level security;
alter table public.call_unlocks enable row level security;
alter table public.circle_transactions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.risk_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
on public.profiles for select
using (true);

drop policy if exists "profiles insert own row" on public.profiles;
create policy "profiles insert own row"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles update own row" on public.profiles;
create policy "profiles update own row"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "marketplace agents are readable" on public.agents;
create policy "marketplace agents are readable"
on public.agents for select
using (status <> 'draft'::public.agent_status or owner_id = auth.uid());

drop policy if exists "users create owned agents" on public.agents;
create policy "users create owned agents"
on public.agents for insert
with check (owner_id = auth.uid());

drop policy if exists "owners update agents" on public.agents;
create policy "owners update agents"
on public.agents for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners delete draft agents" on public.agents;
create policy "owners delete draft agents"
on public.agents for delete
using (owner_id = auth.uid() and status = 'draft'::public.agent_status);

drop policy if exists "owners manage agent wallets" on public.agent_wallets;
create policy "owners manage agent wallets"
on public.agent_wallets for all
using (exists (
  select 1 from public.agents a where a.id = agent_wallets.agent_id and a.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.agents a where a.id = agent_wallets.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "owners manage agent configs" on public.agent_configs;
create policy "owners manage agent configs"
on public.agent_configs for all
using (exists (
  select 1 from public.agents a where a.id = agent_configs.agent_id and a.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.agents a where a.id = agent_configs.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "predictions are readable" on public.predictions;
create policy "predictions are readable"
on public.predictions for select
using (true);

drop policy if exists "owners submit predictions" on public.predictions;
create policy "owners submit predictions"
on public.predictions for insert
with check (exists (
  select 1 from public.agents a where a.id = predictions.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "owners update unresolved predictions" on public.predictions;
create policy "owners update unresolved predictions"
on public.predictions for update
using (
  status <> 'resolved'::public.prediction_status
  and exists (select 1 from public.agents a where a.id = predictions.agent_id and a.owner_id = auth.uid())
)
with check (
  status <> 'resolved'::public.prediction_status
  and exists (select 1 from public.agents a where a.id = predictions.agent_id and a.owner_id = auth.uid())
);

drop policy if exists "prediction outcomes are readable" on public.prediction_outcomes;
create policy "prediction outcomes are readable"
on public.prediction_outcomes for select
using (true);

drop policy if exists "reputation events are readable" on public.reputation_events;
create policy "reputation events are readable"
on public.reputation_events for select
using (true);

drop policy if exists "delegations readable by participants" on public.delegations;
create policy "delegations readable by participants"
on public.delegations for select
using (
  delegator_id = auth.uid()
  or exists (select 1 from public.agents a where a.id = delegations.agent_id and a.owner_id = auth.uid())
);

drop policy if exists "users create own delegations" on public.delegations;
create policy "users create own delegations"
on public.delegations for insert
with check (delegator_id = auth.uid());

drop policy if exists "users update own delegations" on public.delegations;
create policy "users update own delegations"
on public.delegations for update
using (delegator_id = auth.uid())
with check (delegator_id = auth.uid());

drop policy if exists "vault transactions readable by participants" on public.vault_transactions;
create policy "vault transactions readable by participants"
on public.vault_transactions for select
using (
  actor_id = auth.uid()
  or exists (select 1 from public.agents a where a.id = vault_transactions.agent_id and a.owner_id = auth.uid())
  or exists (
    select 1 from public.delegations d
    where d.id = vault_transactions.delegation_id and d.delegator_id = auth.uid()
  )
);

drop policy if exists "earnings calls are readable" on public.earnings_calls;
create policy "earnings calls are readable"
on public.earnings_calls for select
using (
  published_at is not null
  or exists (select 1 from public.agents a where a.id = earnings_calls.agent_id and a.owner_id = auth.uid())
);

drop policy if exists "owners manage earnings calls" on public.earnings_calls;
create policy "owners manage earnings calls"
on public.earnings_calls for all
using (exists (
  select 1 from public.agents a where a.id = earnings_calls.agent_id and a.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.agents a where a.id = earnings_calls.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "circle transactions readable by participants" on public.circle_transactions;
create policy "circle transactions readable by participants"
on public.circle_transactions for select
using (
  user_id = auth.uid()
  or exists (select 1 from public.agents a where a.id = circle_transactions.agent_id and a.owner_id = auth.uid())
);

drop policy if exists "users create own circle transactions" on public.circle_transactions;
create policy "users create own circle transactions"
on public.circle_transactions for insert
with check (
  user_id = auth.uid()
  or exists (select 1 from public.agents a where a.id = circle_transactions.agent_id and a.owner_id = auth.uid())
);

drop policy if exists "call unlocks readable by participants" on public.call_unlocks;
create policy "call unlocks readable by participants"
on public.call_unlocks for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.earnings_calls c
    join public.agents a on a.id = c.agent_id
    where c.id = call_unlocks.call_id and a.owner_id = auth.uid()
  )
);

drop policy if exists "users create own call unlocks" on public.call_unlocks;
create policy "users create own call unlocks"
on public.call_unlocks for insert
with check (user_id = auth.uid());

drop policy if exists "risk events readable by owners" on public.risk_events;
create policy "risk events readable by owners"
on public.risk_events for select
using (exists (
  select 1 from public.agents a where a.id = risk_events.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "owners create risk events" on public.risk_events;
create policy "owners create risk events"
on public.risk_events for insert
with check (exists (
  select 1 from public.agents a where a.id = risk_events.agent_id and a.owner_id = auth.uid()
));

drop policy if exists "audit logs readable by actor" on public.audit_logs;
create policy "audit logs readable by actor"
on public.audit_logs for select
using (actor_id = auth.uid());

commit;
