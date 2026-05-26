
begin;

-- Paid call content must not be readable from public.earnings_calls until
-- access is earned. RLS filters rows, not columns, so locked paid calls need a
-- separate public preview surface that contains no transcript, thesis, PnL, win,
-- loss, or audio URL fields.

create table if not exists public.earnings_call_previews (
  call_id uuid primary key references public.earnings_calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  call_date date not null,
  duration_seconds integer,
  price_usdc numeric(20, 6) not null default 0 check (price_usdc >= 0),
  is_free_preview boolean not null default false,
  preview_text text not null default 'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.earnings_call_previews enable row level security;

drop policy if exists "earnings_call_previews_select_all" on public.earnings_call_previews;
create policy "earnings_call_previews_select_all"
on public.earnings_call_previews for select
using (true);

revoke insert, update, delete on public.earnings_call_previews from anon, authenticated;
grant select on public.earnings_call_previews to anon, authenticated;

create or replace function public.sync_earnings_call_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_preview text;
begin
  safe_preview := case
    when coalesce(new.is_free_preview, false) or coalesce(new.price_usdc, 0) <= 0 then
      left(coalesce(nullif(new.pnl_summary, ''), 'Free earnings call available.'), 280)
    else
      'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.'
  end;

  insert into public.earnings_call_previews (
    call_id, agent_id, call_date, duration_seconds, price_usdc, is_free_preview,
    preview_text, created_at, updated_at
  )
  values (
    new.id, new.agent_id, new.call_date, new.duration_seconds,
    coalesce(new.price_usdc, 0), coalesce(new.is_free_preview, false),
    safe_preview, coalesce(new.created_at, now()), coalesce(new.updated_at, now())
  )
  on conflict (call_id) do update set
    agent_id = excluded.agent_id, call_date = excluded.call_date,
    duration_seconds = excluded.duration_seconds, price_usdc = excluded.price_usdc,
    is_free_preview = excluded.is_free_preview, preview_text = excluded.preview_text,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists trg_sync_earnings_call_preview on public.earnings_calls;
create trigger trg_sync_earnings_call_preview
after insert or update on public.earnings_calls
for each row execute function public.sync_earnings_call_preview();

insert into public.earnings_call_previews (
  call_id, agent_id, call_date, duration_seconds, price_usdc, is_free_preview,
  preview_text, created_at, updated_at
)
select
  c.id, c.agent_id, c.call_date, c.duration_seconds,
  coalesce(c.price_usdc, 0), coalesce(c.is_free_preview, false),
  case
    when coalesce(c.is_free_preview, false) or coalesce(c.price_usdc, 0) <= 0 then
      left(coalesce(nullif(c.pnl_summary, ''), 'Free earnings call available.'), 280)
    else
      'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.'
  end,
  coalesce(c.created_at, now()), coalesce(c.updated_at, now())
from public.earnings_calls c
on conflict (call_id) do update set
  agent_id = excluded.agent_id, call_date = excluded.call_date,
  duration_seconds = excluded.duration_seconds, price_usdc = excluded.price_usdc,
  is_free_preview = excluded.is_free_preview, preview_text = excluded.preview_text,
  updated_at = excluded.updated_at;

create or replace function public.has_call_unlock(_call_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $body$
  select _user_id is not null
    and _user_id = auth.uid()
    and exists (
      select 1
      from public.call_unlocks cu
      join public.earnings_calls c on c.id = cu.call_id
      where cu.call_id = _call_id
        and cu.user_id = _user_id
        and (
          coalesce(c.is_free_preview, false)
          or coalesce(c.price_usdc, 0) <= 0
          or (
            coalesce(cu.amount_paid_usdc, 0) >= coalesce(c.price_usdc, 0)
            and exists (
              select 1
              from public.circle_transactions tx
              where tx.user_id = _user_id
                and tx.status = 'confirmed'
                and tx.amount_usdc >= coalesce(c.price_usdc, 0)
                and tx.raw ->> 'callId' = _call_id::text
            )
          )
        )
    )
$body$;

revoke all on function public.has_call_unlock(uuid, uuid) from public;
grant execute on function public.has_call_unlock(uuid, uuid) to anon;
grant execute on function public.has_call_unlock(uuid, uuid) to authenticated;
grant execute on function public.has_call_unlock(uuid, uuid) to service_role;

grant execute on function public.has_role(uuid, public.app_role) to anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

drop policy if exists "calls_select_all" on public.earnings_calls;
drop policy if exists "earnings calls are readable" on public.earnings_calls;
drop policy if exists "earnings_calls_select_full_content" on public.earnings_calls;
drop policy if exists "calls_select_gated" on public.earnings_calls;

create policy "earnings_calls_select_full_content"
on public.earnings_calls for select
using (
  coalesce(is_free_preview, false)
  or coalesce(price_usdc, 0) <= 0
  or public.has_call_unlock(id, auth.uid())
  or exists (
    select 1 from public.agents a
    where a.id = earnings_calls.agent_id and a.owner_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "users create own call unlocks" on public.call_unlocks;
drop policy if exists "unlocks_insert_self" on public.call_unlocks;
drop policy if exists "call_unlocks_insert_free_self" on public.call_unlocks;

create policy "call_unlocks_insert_free_self"
on public.call_unlocks for insert
with check (
  user_id = auth.uid()
  and coalesce(amount_paid_usdc, 0) = 0
  and tx_hash is null
  and exists (
    select 1 from public.earnings_calls c
    where c.id = call_id
      and (coalesce(c.is_free_preview, false) or coalesce(c.price_usdc, 0) <= 0)
  )
);

delete from public.call_unlocks cu
using public.earnings_calls c
where c.id = cu.call_id
  and not coalesce(c.is_free_preview, false)
  and coalesce(c.price_usdc, 0) > 0
  and (
    coalesce(cu.amount_paid_usdc, 0) < coalesce(c.price_usdc, 0)
    or not exists (
      select 1 from public.circle_transactions tx
      where tx.user_id = cu.user_id
        and tx.status = 'confirmed'
        and tx.amount_usdc >= coalesce(c.price_usdc, 0)
        and tx.raw ->> 'callId' = c.id::text
    )
  );

drop policy if exists "roles_select_own" on public.user_roles;
drop policy if exists "roles_admin_all" on public.user_roles;
drop policy if exists "roles_select_own_or_admin" on public.user_roles;

create policy "roles_select_own_or_admin"
on public.user_roles for select
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

revoke insert, update, delete on public.user_roles from anon, authenticated;

create or replace function public.prevent_user_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_role text;
begin
  request_role := current_setting('request.jwt.claim.role', true);
  if request_role in ('anon', 'authenticated') and new.role <> 'user' then
    raise exception 'Only service-role server code may grant elevated roles';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_user_role_self_escalation on public.user_roles;
create trigger trg_prevent_user_role_self_escalation
before insert or update of role on public.user_roles
for each row execute function public.prevent_user_role_self_escalation();

-- Migration 2: registry_agent_id on agents
alter table public.agents
  add column if not exists registry_agent_id text;

create unique index if not exists agents_registry_agent_id_key
on public.agents (registry_agent_id)
where registry_agent_id is not null;

commit;
