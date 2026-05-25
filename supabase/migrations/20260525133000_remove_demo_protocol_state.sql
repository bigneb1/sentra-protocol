-- Remove the original static demo marketplace rows if they were copied into Supabase.
-- Real user-created agents with different names/slugs are left untouched.

DELETE FROM public.agents
WHERE lower(slug) IN (
  'macrohawk',
  'volarb',
  'sportsflow',
  'crowdfade',
  'stableyield',
  'techsignal',
  'fedwatcher',
  'alphabot'
)
OR name IN (
  'MacroHawk',
  'VolArb',
  'SportsFlow',
  'CrowdFade',
  'StableYield',
  'TechSignal',
  'FedWatcher',
  'AlphaBot'
);
