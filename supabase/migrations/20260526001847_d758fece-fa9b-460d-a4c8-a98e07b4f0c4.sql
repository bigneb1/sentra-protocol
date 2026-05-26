
-- ============ EARNINGS CALLS ============
DROP POLICY IF EXISTS calls_select_all ON public.earnings_calls;

CREATE POLICY calls_select_gated
ON public.earnings_calls
FOR SELECT
USING (
  is_free_preview = true
  OR price_usdc = 0
  OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = earnings_calls.agent_id AND a.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.call_unlocks u WHERE u.call_id = earnings_calls.id AND u.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Public-safe view for listings (no transcript/audio/thesis/win/loss/pnl)
CREATE OR REPLACE VIEW public.earnings_calls_public
WITH (security_invoker = on) AS
SELECT id, agent_id, call_date, price_usdc, duration_seconds,
       is_free_preview, created_at, updated_at
FROM public.earnings_calls;

GRANT SELECT ON public.earnings_calls_public TO anon, authenticated;

-- Listing policy: allow row visibility for the view's safe columns only.
-- Since RLS applies to base table via security_invoker, add a permissive
-- SELECT policy that returns rows but the view restricts columns.
CREATE POLICY calls_select_listing
ON public.earnings_calls
FOR SELECT
USING (true);

-- The two SELECT policies are permissive (OR'd). To enforce gating on the
-- base table while allowing the view to show listings, replace strategy:
DROP POLICY calls_select_listing ON public.earnings_calls;
DROP POLICY calls_select_gated ON public.earnings_calls;

-- Final approach: base table SELECT is gated; view bypasses by using
-- security_definer style via a SECURITY DEFINER function. Simpler: keep
-- base table gated and expose listings through a SECURITY DEFINER function.
CREATE POLICY calls_select_gated
ON public.earnings_calls
FOR SELECT
USING (
  is_free_preview = true
  OR price_usdc = 0
  OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = earnings_calls.agent_id AND a.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.call_unlocks u WHERE u.call_id = earnings_calls.id AND u.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Drop the previous view and recreate as SECURITY DEFINER function returning safe listing rows.
DROP VIEW IF EXISTS public.earnings_calls_public;

CREATE OR REPLACE FUNCTION public.list_earnings_calls_public()
RETURNS TABLE (
  id uuid,
  agent_id uuid,
  call_date date,
  price_usdc numeric,
  duration_seconds integer,
  is_free_preview boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, agent_id, call_date, price_usdc, duration_seconds,
         is_free_preview, created_at, updated_at
  FROM public.earnings_calls
$$;

REVOKE ALL ON FUNCTION public.list_earnings_calls_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_earnings_calls_public() TO anon, authenticated;

-- ============ RISK EVENTS ============
DROP POLICY IF EXISTS risk_events_select_all ON public.risk_events;

CREATE POLICY risk_events_select_owner_or_admin
ON public.risk_events
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    agent_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.agents a WHERE a.id = risk_events.agent_id AND a.owner_id = auth.uid())
  )
);

-- ============ PROFILES (hide wallet_address) ============
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

-- Users can only read their own full profile (with wallet)
CREATE POLICY profiles_select_own_full
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Public-safe view (no wallet_address) for general lookups
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, user_id, display_name, avatar_url, bio, created_at
FROM public.profiles;

-- Allow public read access via a SECURITY DEFINER function instead so the
-- view isn't blocked by the restrictive base-table policy.
DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, display_name, avatar_url, bio, created_at
  FROM public.profiles
  WHERE user_id = _user_id
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated;

-- ============ USER ROLES: prevent privilege escalation ============
-- Safeguard trigger: only allow non-admin roles to be inserted unless the
-- caller is already an admin or the insert comes from a SECURITY DEFINER
-- context with no auth.uid() (e.g. the handle_new_user trigger).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin'::app_role THEN
    IF auth.uid() IS NULL THEN
      -- system-level insert (e.g. seed/migration) — allow
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only existing admins can grant the admin role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_prevent_escalation ON public.user_roles;
CREATE TRIGGER user_roles_prevent_escalation
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC;
