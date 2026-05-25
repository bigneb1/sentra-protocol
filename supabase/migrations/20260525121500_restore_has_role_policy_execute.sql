-- RLS policies call public.has_role(...) during normal browser queries.
-- The function is SECURITY DEFINER and only returns role membership, so anon
-- and authenticated need EXECUTE for policy evaluation to succeed.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
