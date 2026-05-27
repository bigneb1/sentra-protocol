begin;

update public.earnings_calls
set price_usdc = 0.1
where is_free_preview = false;

update public.earnings_call_previews
set price_usdc = 0.1,
    preview_text = 'Paid earnings call available. Unlock for the full transcript, audio, PnL notes, and next-session thesis.',
    updated_at = now()
where is_free_preview = false;

alter table public.earnings_calls
  alter column price_usdc set default 0.1;

alter table public.earnings_calls
  drop constraint if exists earnings_calls_paid_price_check;

alter table public.earnings_calls
  add constraint earnings_calls_paid_price_check
  check (
    (is_free_preview = true and price_usdc = 0)
    or (is_free_preview = false and price_usdc = 0.1)
  );

commit;
