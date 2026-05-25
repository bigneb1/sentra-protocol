
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.agent_strategy AS ENUM ('Macro', 'Sports', 'Contrarian', 'Yield', 'Tech', 'Custom');
CREATE TYPE public.agent_status AS ENUM ('draft', 'pending', 'active', 'paused', 'slashed', 'retired');
CREATE TYPE public.prediction_status AS ENUM ('active', 'resolved', 'cancelled');
CREATE TYPE public.delegation_status AS ENUM ('pending', 'active', 'withdrawn', 'slashed');
CREATE TYPE public.vault_tx_kind AS ENUM ('stake', 'unstake', 'payout', 'slash', 'fee');
CREATE TYPE public.circle_tx_kind AS ENUM ('deposit', 'withdrawal', 'transfer', 'gateway_topup', 'gateway_spend');
CREATE TYPE public.circle_tx_status AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE public.risk_severity AS ENUM ('info', 'warning', 'critical');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- USER ROLES (created before has_role function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- AGENTS
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  strategy public.agent_strategy NOT NULL DEFAULT 'Custom',
  description TEXT,
  metadata_uri TEXT,
  metadata_hash TEXT,
  arc_erc8004_id BIGINT,
  status public.agent_status NOT NULL DEFAULT 'draft',
  color TEXT,
  reputation NUMERIC(10,4) NOT NULL DEFAULT 0,
  brier_score NUMERIC(10,4) NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_select_all" ON public.agents FOR SELECT USING (true);
CREATE POLICY "agents_insert_own" ON public.agents FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "agents_update_own" ON public.agents FOR UPDATE USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agents_delete_own" ON public.agents FOR DELETE USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_agents_owner ON public.agents(owner_id);
CREATE INDEX idx_agents_status ON public.agents(status);

-- AGENT WALLETS
CREATE TABLE public.agent_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  circle_wallet_id TEXT,
  wallet_address TEXT NOT NULL,
  blockchain TEXT NOT NULL DEFAULT 'ARC-TESTNET',
  gateway_balance_usdc NUMERIC(20,6) NOT NULL DEFAULT 0,
  usdc_stake NUMERIC(20,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, wallet_address)
);
ALTER TABLE public.agent_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_wallets_select_owner" ON public.agent_wallets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND (a.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "agent_wallets_modify_owner" ON public.agent_wallets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));
CREATE TRIGGER trg_agent_wallets_updated BEFORE UPDATE ON public.agent_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AGENT CONFIGS
CREATE TABLE public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  signing_key_id TEXT,
  delegation_cap_usdc NUMERIC(20,6) NOT NULL DEFAULT 0,
  max_daily_loss_usdc NUMERIC(20,6) NOT NULL DEFAULT 250,
  max_open_positions INTEGER NOT NULL DEFAULT 6,
  max_slippage_bps INTEGER NOT NULL DEFAULT 75,
  max_leverage NUMERIC(6,2) NOT NULL DEFAULT 2,
  earnings_call_enabled BOOLEAN NOT NULL DEFAULT false,
  earnings_call_tier TEXT NOT NULL DEFAULT 'free',
  earnings_call_monthly_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_configs_select_owner" ON public.agent_configs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND (a.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "agent_configs_modify_owner" ON public.agent_configs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));
CREATE TRIGGER trg_agent_configs_updated BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PREDICTIONS
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  question TEXT NOT NULL,
  agent_prob NUMERIC(5,4) NOT NULL CHECK (agent_prob >= 0 AND agent_prob <= 1),
  market_prob NUMERIC(5,4) CHECK (market_prob IS NULL OR (market_prob >= 0 AND market_prob <= 1)),
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  reasoning TEXT,
  prediction_hash TEXT,
  signature TEXT,
  status public.prediction_status NOT NULL DEFAULT 'active',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_select_all" ON public.predictions FOR SELECT USING (true);
CREATE POLICY "predictions_insert_owner" ON public.predictions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));
CREATE POLICY "predictions_update_owner" ON public.predictions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_predictions_updated BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_predictions_agent ON public.predictions(agent_id);
CREATE INDEX idx_predictions_status ON public.predictions(status);

-- PREDICTION OUTCOMES
CREATE TABLE public.prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID NOT NULL UNIQUE REFERENCES public.predictions(id) ON DELETE CASCADE,
  outcome BOOLEAN NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  brier_delta NUMERIC(10,6),
  resolver TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prediction_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outcomes_select_all" ON public.prediction_outcomes FOR SELECT USING (true);
CREATE POLICY "outcomes_admin_write" ON public.prediction_outcomes FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- REPUTATION EVENTS
CREATE TABLE public.reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES public.predictions(id) ON DELETE SET NULL,
  score_delta NUMERIC(10,4) NOT NULL,
  new_score NUMERIC(10,4) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rep_events_select_all" ON public.reputation_events FOR SELECT USING (true);
CREATE POLICY "rep_events_admin_write" ON public.reputation_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_rep_events_agent ON public.reputation_events(agent_id);

-- DELEGATIONS
CREATE TABLE public.delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  amount_usdc NUMERIC(20,6) NOT NULL CHECK (amount_usdc > 0),
  status public.delegation_status NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delegations_select_visible" ON public.delegations FOR SELECT
  USING (
    auth.uid() = delegator_id
    OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "delegations_insert_self" ON public.delegations FOR INSERT WITH CHECK (auth.uid() = delegator_id);
CREATE POLICY "delegations_update_self" ON public.delegations FOR UPDATE USING (auth.uid() = delegator_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_delegations_updated BEFORE UPDATE ON public.delegations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_delegations_delegator ON public.delegations(delegator_id);
CREATE INDEX idx_delegations_agent ON public.delegations(agent_id);

-- VAULT TRANSACTIONS
CREATE TABLE public.vault_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  kind public.vault_tx_kind NOT NULL,
  amount_usdc NUMERIC(20,6) NOT NULL,
  tx_hash TEXT,
  block_number BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vault_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_tx_select_all" ON public.vault_transactions FOR SELECT USING (true);
CREATE POLICY "vault_tx_admin_write" ON public.vault_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_vault_tx_agent ON public.vault_transactions(agent_id);

-- EARNINGS CALLS
CREATE TABLE public.earnings_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  call_date DATE NOT NULL,
  duration_seconds INTEGER,
  audio_url TEXT,
  transcript TEXT,
  pnl_summary TEXT,
  biggest_win TEXT,
  biggest_loss TEXT,
  tomorrow_thesis TEXT,
  price_usdc NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_free_preview BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.earnings_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calls_select_all" ON public.earnings_calls FOR SELECT USING (true);
CREATE POLICY "calls_modify_owner" ON public.earnings_calls FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid()));
CREATE TRIGGER trg_calls_updated BEFORE UPDATE ON public.earnings_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_calls_agent ON public.earnings_calls(agent_id);

-- CALL UNLOCKS
CREATE TABLE public.call_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES public.earnings_calls(id) ON DELETE CASCADE,
  amount_paid_usdc NUMERIC(20,6) NOT NULL DEFAULT 0,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, call_id)
);
ALTER TABLE public.call_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unlocks_select_self" ON public.call_unlocks FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "unlocks_insert_self" ON public.call_unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CIRCLE TRANSACTIONS
CREATE TABLE public.circle_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.circle_tx_kind NOT NULL,
  circle_wallet_id TEXT,
  circle_tx_id TEXT UNIQUE,
  amount_usdc NUMERIC(20,6) NOT NULL,
  status public.circle_tx_status NOT NULL DEFAULT 'pending',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.circle_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circle_tx_select_visible" ON public.circle_transactions FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "circle_tx_admin_write" ON public.circle_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_circle_tx_updated BEFORE UPDATE ON public.circle_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WEBHOOK EVENTS
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_id TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_admin_only" ON public.webhook_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_webhook_events_provider ON public.webhook_events(provider, event_type);

-- RISK EVENTS
CREATE TABLE public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  severity public.risk_severity NOT NULL DEFAULT 'info',
  kind TEXT NOT NULL,
  detail TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_events_select_all" ON public.risk_events FOR SELECT USING (true);
CREATE POLICY "risk_events_admin_write" ON public.risk_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
