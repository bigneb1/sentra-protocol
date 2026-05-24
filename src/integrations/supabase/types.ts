export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PublicEnums = {
  agent_strategy: "Macro" | "Sports" | "Contrarian" | "Yield" | "Tech" | "Custom";
  agent_status: "draft" | "active" | "paused" | "retired" | "slashed";
  wallet_provider: "circle_developer_controlled" | "circle_user_controlled" | "external";
  wallet_purpose:
    | "agent_treasury"
    | "user_embedded"
    | "delegation_vault"
    | "protocol_ops"
    | "gateway";
  prediction_status: "draft" | "submitted" | "active" | "resolved" | "void";
  delegation_status: "active" | "withdrawing" | "withdrawn" | "slashed";
  vault_transaction_type:
    | "stake_deposit"
    | "stake_release"
    | "delegation_deposit"
    | "delegation_withdrawal"
    | "slash"
    | "fee"
    | "payout"
    | "call_unlock";
  transaction_status: "created" | "pending" | "confirmed" | "failed" | "canceled";
  call_unlock_source: "usdc" | "gateway" | "free" | "admin";
  risk_severity: "info" | "warning" | "critical";
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Timestamped = {
  created_at: string;
  updated_at: string;
};

type ProfileRow = Timestamped & {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  role: string;
  metadata: Json;
};

type AgentRow = Timestamped & {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  strategy: PublicEnums["agent_strategy"];
  description: string | null;
  status: PublicEnums["agent_status"];
  arc_erc8004_id: string | null;
  registry_agent_id: string | null;
  metadata_uri: string | null;
  metadata_hash: string | null;
  wallet_address: string | null;
  circle_wallet_id: string | null;
  staked_usdc: string;
  delegation_cap_usdc: string;
  delegated_usdc: string;
  gateway_balance_usdc: string;
  reputation_score: string;
  brier_score: string;
  validation_count: number;
  slashed: boolean;
  contract_pointers: Json;
};

type AgentWalletRow = Timestamped & {
  id: string;
  agent_id: string;
  provider: PublicEnums["wallet_provider"];
  purpose: PublicEnums["wallet_purpose"];
  circle_wallet_id: string | null;
  wallet_set_id: string | null;
  address: string;
  blockchain: string;
  custody_type: string | null;
  is_active: boolean;
  metadata: Json;
};

type AgentConfigRow = {
  id: string;
  agent_id: string;
  version: number;
  strategy_config: Json;
  risk_limits: Json;
  prediction_signing_key_id: string | null;
  prediction_key_hash: string | null;
  earnings_call_config: Json;
  gateway_config: Json;
  min_confidence_bps: number;
  max_active_predictions: number;
  max_daily_loss_usdc: string;
  max_slippage_bps: number;
  delegation_cap_usdc: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

type PredictionRow = Timestamped & {
  id: string;
  agent_id: string;
  config_id: string | null;
  market_id: string;
  question: string;
  prediction_hash: string;
  signature_hash: string | null;
  signed_payload: Json;
  agent_probability_bps: number;
  market_probability_bps: number | null;
  confidence_bps: number;
  stake_at_risk_usdc: string;
  status: PublicEnums["prediction_status"];
  submitted_at: string;
  resolves_at: string | null;
  tx_hash: string | null;
  arc_block_number: number | null;
};

type PredictionOutcomeRow = {
  id: string;
  prediction_id: string;
  resolver_id: string | null;
  outcome: boolean;
  actual_probability_bps: number | null;
  resolved_at: string;
  brier_score: string;
  reputation_delta: string;
  settlement_tx_hash: string | null;
  evidence_uri: string | null;
  notes: string | null;
  created_at: string;
};

type ReputationEventRow = {
  id: string;
  agent_id: string;
  prediction_id: string | null;
  event_type: string;
  previous_score: string;
  new_score: string;
  brier_score: string | null;
  validation_count: number;
  delta: string;
  reason: string | null;
  tx_hash: string | null;
  event_at: string;
  created_at: string;
};

type DelegationRow = Timestamped & {
  id: string;
  delegator_id: string;
  agent_id: string;
  vault_address: string | null;
  amount_usdc: string;
  shares: string;
  status: PublicEnums["delegation_status"];
  entry_tx_hash: string | null;
  exit_tx_hash: string | null;
  delegated_at: string;
  unlocks_at: string | null;
  withdrawn_at: string | null;
};

type VaultTransactionRow = {
  id: string;
  agent_id: string | null;
  delegation_id: string | null;
  actor_id: string | null;
  tx_type: PublicEnums["vault_transaction_type"];
  amount_usdc: string;
  shares: string;
  tx_hash: string | null;
  contract_address: string | null;
  block_number: number | null;
  status: PublicEnums["transaction_status"];
  metadata: Json;
  created_at: string;
};

type EarningsCallRow = Timestamped & {
  id: string;
  agent_id: string;
  call_date: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  audio_url: string | null;
  content_hash: string | null;
  price_usdc: string;
  is_free_preview: boolean;
  duration_seconds: number | null;
  status: string;
  published_at: string | null;
};

type CallUnlockRow = {
  id: string;
  call_id: string;
  user_id: string;
  payment_source: PublicEnums["call_unlock_source"];
  amount_usdc: string;
  tx_hash: string | null;
  circle_transaction_id: string | null;
  unlocked_at: string;
  expires_at: string | null;
  created_at: string;
};

type CircleTransactionRow = Timestamped & {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  agent_wallet_id: string | null;
  circle_id: string | null;
  transaction_type: string;
  blockchain: string;
  source_address: string | null;
  destination_address: string | null;
  token_address: string | null;
  amount_usdc: string;
  status: PublicEnums["transaction_status"];
  tx_hash: string | null;
  idempotency_key: string | null;
  request_body: Json;
  response_body: Json;
  error_message: string | null;
};

type WebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: Json;
  headers: Json;
  processed_at: string | null;
  processing_error: string | null;
  received_at: string;
};

type RiskEventRow = {
  id: string;
  agent_id: string;
  config_id: string | null;
  severity: PublicEnums["risk_severity"];
  event_type: string;
  metric: string | null;
  observed_value: string | null;
  limit_value: string | null;
  action_taken: string | null;
  tx_hash: string | null;
  details: Json;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_record: Json | null;
  new_record: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      agents: Table<
        AgentRow,
        Partial<AgentRow> & Pick<AgentRow, "owner_id" | "slug" | "name" | "strategy">
      >;
      agent_wallets: Table<
        AgentWalletRow,
        Partial<AgentWalletRow> &
          Pick<AgentWalletRow, "agent_id" | "provider" | "purpose" | "address">
      >;
      agent_configs: Table<
        AgentConfigRow,
        Partial<AgentConfigRow> & Pick<AgentConfigRow, "agent_id">
      >;
      predictions: Table<
        PredictionRow,
        Partial<PredictionRow> &
          Pick<
            PredictionRow,
            | "agent_id"
            | "market_id"
            | "question"
            | "prediction_hash"
            | "agent_probability_bps"
            | "confidence_bps"
          >
      >;
      prediction_outcomes: Table<
        PredictionOutcomeRow,
        Partial<PredictionOutcomeRow> &
          Pick<PredictionOutcomeRow, "prediction_id" | "outcome" | "brier_score">
      >;
      reputation_events: Table<
        ReputationEventRow,
        Partial<ReputationEventRow> & Pick<ReputationEventRow, "agent_id" | "event_type">
      >;
      delegations: Table<
        DelegationRow,
        Partial<DelegationRow> & Pick<DelegationRow, "delegator_id" | "agent_id" | "amount_usdc">
      >;
      vault_transactions: Table<
        VaultTransactionRow,
        Partial<VaultTransactionRow> & Pick<VaultTransactionRow, "tx_type">
      >;
      earnings_calls: Table<
        EarningsCallRow,
        Partial<EarningsCallRow> & Pick<EarningsCallRow, "agent_id" | "call_date" | "title">
      >;
      call_unlocks: Table<
        CallUnlockRow,
        Partial<CallUnlockRow> & Pick<CallUnlockRow, "call_id" | "user_id">
      >;
      circle_transactions: Table<
        CircleTransactionRow,
        Partial<CircleTransactionRow> & Pick<CircleTransactionRow, "transaction_type">
      >;
      webhook_events: Table<
        WebhookEventRow,
        Partial<WebhookEventRow> & Pick<WebhookEventRow, "event_id" | "event_type" | "payload">
      >;
      risk_events: Table<
        RiskEventRow,
        Partial<RiskEventRow> & Pick<RiskEventRow, "agent_id" | "event_type">
      >;
      audit_logs: Table<AuditLogRow, Partial<AuditLogRow> & Pick<AuditLogRow, "action">>;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: PublicEnums;
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agent_strategy: ["Macro", "Sports", "Contrarian", "Yield", "Tech", "Custom"],
      agent_status: ["draft", "active", "paused", "retired", "slashed"],
      wallet_provider: ["circle_developer_controlled", "circle_user_controlled", "external"],
      wallet_purpose: [
        "agent_treasury",
        "user_embedded",
        "delegation_vault",
        "protocol_ops",
        "gateway",
      ],
      prediction_status: ["draft", "submitted", "active", "resolved", "void"],
      delegation_status: ["active", "withdrawing", "withdrawn", "slashed"],
      vault_transaction_type: [
        "stake_deposit",
        "stake_release",
        "delegation_deposit",
        "delegation_withdrawal",
        "slash",
        "fee",
        "payout",
        "call_unlock",
      ],
      transaction_status: ["created", "pending", "confirmed", "failed", "canceled"],
      call_unlock_source: ["usdc", "gateway", "free", "admin"],
      risk_severity: ["info", "warning", "critical"],
    },
  },
} as const;
