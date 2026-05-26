begin;

-- The browser wallet needs the exact bytes32 used in SentraAgentRegistry.
-- The current Lovable-generated schema stored metadata_hash but dropped the
-- dedicated registry id from the earlier core schema, which made real vault
-- writes impossible to target reliably.
alter table public.agents
  add column if not exists registry_agent_id text;

create unique index if not exists agents_registry_agent_id_key
on public.agents (registry_agent_id)
where registry_agent_id is not null;

commit;
