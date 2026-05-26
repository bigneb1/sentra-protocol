begin;

-- Full earnings-call rows contain transcripts, audio URLs, thesis, PnL, win,
-- and loss fields. Anonymous clients should only read the preview table.
revoke select on table public.earnings_calls from anon;
grant select on table public.earnings_call_previews to anon, authenticated;
grant select on table public.earnings_calls to authenticated;

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
      'Free earnings call available. Sign in and unlock to view the full transcript, audio, PnL notes, and next-session thesis.'
    else
      'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.'
  end;

  insert into public.earnings_call_previews (
    call_id,
    agent_id,
    call_date,
    duration_seconds,
    price_usdc,
    is_free_preview,
    preview_text,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.agent_id,
    new.call_date,
    new.duration_seconds,
    coalesce(new.price_usdc, 0),
    coalesce(new.is_free_preview, false),
    safe_preview,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (call_id) do update
  set
    agent_id = excluded.agent_id,
    call_date = excluded.call_date,
    duration_seconds = excluded.duration_seconds,
    price_usdc = excluded.price_usdc,
    is_free_preview = excluded.is_free_preview,
    preview_text = excluded.preview_text,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

update public.earnings_call_previews
set preview_text = case
  when coalesce(is_free_preview, false) or coalesce(price_usdc, 0) <= 0 then
    'Free earnings call available. Sign in and unlock to view the full transcript, audio, PnL notes, and next-session thesis.'
  else
    'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.'
  end,
  updated_at = now();

drop policy if exists "calls_select_all" on public.earnings_calls;
drop policy if exists "earnings calls are readable" on public.earnings_calls;
drop policy if exists "calls_select_gated" on public.earnings_calls;
drop policy if exists "earnings_calls_select_full_content" on public.earnings_calls;

create or replace function public.has_call_unlock(
  _call_id uuid,
  _user_id uuid,
  _price_usdc numeric,
  _is_free_preview boolean
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select _user_id is not null
    and _user_id = auth.uid()
    and exists (
      select 1
      from public.call_unlocks cu
      where cu.call_id = _call_id
        and cu.user_id = _user_id
        and (
          coalesce(_is_free_preview, false)
          or coalesce(_price_usdc, 0) <= 0
          or (
            coalesce(cu.amount_paid_usdc, 0) >= coalesce(_price_usdc, 0)
            and exists (
              select 1
              from public.circle_transactions tx
              where tx.user_id = _user_id
                and tx.status = 'confirmed'
                and tx.amount_usdc >= coalesce(_price_usdc, 0)
                and tx.raw ->> 'callId' = _call_id::text
            )
          )
        )
    )
$$;

revoke all on function public.has_call_unlock(uuid, uuid, numeric, boolean) from public;
grant execute on function public.has_call_unlock(uuid, uuid, numeric, boolean) to authenticated;
grant execute on function public.has_call_unlock(uuid, uuid, numeric, boolean) to service_role;
drop function if exists public.has_call_unlock(uuid, uuid);

create policy "earnings_calls_select_full_content"
on public.earnings_calls
for select
to authenticated
using (
  public.has_call_unlock(id, auth.uid(), price_usdc, is_free_preview)
  or exists (
    select 1
    from public.agents a
    where a.id = earnings_calls.agent_id
      and a.owner_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin')
);

-- Keep role checks useful in RLS policies without exposing a SECURITY DEFINER
-- function to public callers. This only answers questions about the caller's
-- own roles, which is all app policies need.
drop policy if exists "roles_select_own" on public.user_roles;
drop policy if exists "roles_admin_all" on public.user_roles;
drop policy if exists "roles_select_own_or_admin" on public.user_roles;

create policy "roles_select_own"
on public.user_roles
for select
using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select _user_id is not null
    and _user_id = auth.uid()
    and exists (
      select 1
      from public.user_roles
      where user_id = _user_id
        and role = _role
    )
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

drop policy if exists "roles_insert_admin_only" on public.user_roles;
drop policy if exists "roles_update_admin_only" on public.user_roles;
drop policy if exists "roles_delete_admin_only" on public.user_roles;

create policy "roles_insert_admin_only"
on public.user_roles
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "roles_update_admin_only"
on public.user_roles
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "roles_delete_admin_only"
on public.user_roles
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

revoke insert, update, delete on public.user_roles from anon, authenticated;

do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.sync_earnings_call_preview()'),
    to_regprocedure('public.prevent_user_role_self_escalation()'),
    to_regprocedure('public.prevent_role_escalation()'),
    to_regprocedure('public.set_updated_at()'),
    to_regprocedure('public.handle_new_profile()'),
    to_regprocedure('public.handle_new_user()'),
    to_regprocedure('public.update_updated_at_column()')
  ]
  loop
    if fn is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end $$;

commit;
