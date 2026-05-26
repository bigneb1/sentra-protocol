
DROP FUNCTION IF EXISTS public.list_earnings_calls_public();
DROP FUNCTION IF EXISTS public.get_public_profile(uuid);

REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
