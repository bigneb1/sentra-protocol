UPDATE public.earnings_calls
SET price_usdc = 0.1
WHERE is_free_preview = false;

ALTER TABLE public.earnings_calls
  ALTER COLUMN price_usdc SET DEFAULT 0.1;

ALTER TABLE public.earnings_calls
  DROP CONSTRAINT IF EXISTS earnings_calls_paid_price_check;

ALTER TABLE public.earnings_calls
  ADD CONSTRAINT earnings_calls_paid_price_check
  CHECK (
    (is_free_preview = true AND price_usdc = 0)
    OR (is_free_preview = false AND price_usdc = 0.1)
  );
