export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agent_configs: {
        Row: {
          agent_id: string;
          created_at: string;
          delegation_cap_usdc: number;
          earnings_call_enabled: boolean;
          earnings_call_monthly_usd: number;
          earnings_call_tier: string;
          id: string;
          max_daily_loss_usdc: number;
          max_leverage: number;
          max_open_positions: number;
          max_slippage_bps: number;
          signing_key_id: string | null;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          delegation_cap_usdc?: number;
          earnings_call_enabled?: boolean;
          earnings_call_monthly_usd?: number;
          earnings_call_tier?: string;
          id?: string;
          max_daily_loss_usdc?: number;
          max_leverage?: number;
          max_open_positions?: number;
          max_slippage_bps?: number;
          signing_key_id?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          delegation_cap_usdc?: number;
          earnings_call_enabled?: boolean;
          earnings_call_monthly_usd?: number;
          earnings_call_tier?: string;
          id?: string;
          max_daily_loss_usdc?: number;
          max_leverage?: number;
          max_open_positions?: number;
          max_slippage_bps?: number;
          signing_key_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_configs_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: true;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_wallets: {
        Row: {
          agent_id: string;
          blockchain: string;
          circle_wallet_id: string | null;
          created_at: string;
          gateway_balance_usdc: number;
          id: string;
          updated_at: string;
          usdc_stake: number;
          wallet_address: string;
        };
        Insert: {
          agent_id: string;
          blockchain?: string;
          circle_wallet_id?: string | null;
          created_at?: string;
          gateway_balance_usdc?: number;
          id?: string;
          updated_at?: string;
          usdc_stake?: number;
          wallet_address: string;
        };
        Update: {
          agent_id?: string;
          blockchain?: string;
          circle_wallet_id?: string | null;
          created_at?: string;
          gateway_balance_usdc?: number;
          id?: string;
          updated_at?: string;
          usdc_stake?: number;
          wallet_address?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_wallets_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agents: {
        Row: {
          arc_erc8004_id: number | null;
          brier_score: number;
          color: string | null;
          created_at: string;
          description: string | null;
          followers_count: number;
          id: string;
          metadata_hash: string | null;
          metadata_uri: string | null;
          name: string;
          owner_id: string;
          reputation: number;
          slug: string;
          status: Database["public"]["Enums"]["agent_status"];
          strategy: Database["public"]["Enums"]["agent_strategy"];
          updated_at: string;
        };
        Insert: {
          arc_erc8004_id?: number | null;
          brier_score?: number;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          followers_count?: number;
          id?: string;
          metadata_hash?: string | null;
          metadata_uri?: string | null;
          name: string;
          owner_id: string;
          reputation?: number;
          slug: string;
          status?: Database["public"]["Enums"]["agent_status"];
          strategy?: Database["public"]["Enums"]["agent_strategy"];
          updated_at?: string;
        };
        Update: {
          arc_erc8004_id?: number | null;
          brier_score?: number;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          followers_count?: number;
          id?: string;
          metadata_hash?: string | null;
          metadata_uri?: string | null;
          name?: string;
          owner_id?: string;
          reputation?: number;
          slug?: string;
          status?: Database["public"]["Enums"]["agent_status"];
          strategy?: Database["public"]["Enums"]["agent_strategy"];
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      call_unlocks: {
        Row: {
          amount_paid_usdc: number;
          call_id: string;
          created_at: string;
          id: string;
          tx_hash: string | null;
          user_id: string;
        };
        Insert: {
          amount_paid_usdc?: number;
          call_id: string;
          created_at?: string;
          id?: string;
          tx_hash?: string | null;
          user_id: string;
        };
        Update: {
          amount_paid_usdc?: number;
          call_id?: string;
          created_at?: string;
          id?: string;
          tx_hash?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_unlocks_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "earnings_calls";
            referencedColumns: ["id"];
          },
        ];
      };
      circle_transactions: {
        Row: {
          agent_id: string | null;
          amount_usdc: number;
          circle_tx_id: string | null;
          circle_wallet_id: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["circle_tx_kind"];
          raw: Json;
          status: Database["public"]["Enums"]["circle_tx_status"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          agent_id?: string | null;
          amount_usdc: number;
          circle_tx_id?: string | null;
          circle_wallet_id?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["circle_tx_kind"];
          raw?: Json;
          status?: Database["public"]["Enums"]["circle_tx_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          agent_id?: string | null;
          amount_usdc?: number;
          circle_tx_id?: string | null;
          circle_wallet_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["circle_tx_kind"];
          raw?: Json;
          status?: Database["public"]["Enums"]["circle_tx_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "circle_transactions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      delegations: {
        Row: {
          agent_id: string;
          amount_usdc: number;
          created_at: string;
          delegator_id: string;
          id: string;
          status: Database["public"]["Enums"]["delegation_status"];
          tx_hash: string | null;
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          agent_id: string;
          amount_usdc: number;
          created_at?: string;
          delegator_id: string;
          id?: string;
          status?: Database["public"]["Enums"]["delegation_status"];
          tx_hash?: string | null;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          agent_id?: string;
          amount_usdc?: number;
          created_at?: string;
          delegator_id?: string;
          id?: string;
          status?: Database["public"]["Enums"]["delegation_status"];
          tx_hash?: string | null;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delegations_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      earnings_calls: {
        Row: {
          agent_id: string;
          audio_url: string | null;
          biggest_loss: string | null;
          biggest_win: string | null;
          call_date: string;
          created_at: string;
          duration_seconds: number | null;
          id: string;
          is_free_preview: boolean;
          pnl_summary: string | null;
          price_usdc: number;
          tomorrow_thesis: string | null;
          transcript: string | null;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          audio_url?: string | null;
          biggest_loss?: string | null;
          biggest_win?: string | null;
          call_date: string;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          is_free_preview?: boolean;
          pnl_summary?: string | null;
          price_usdc?: number;
          tomorrow_thesis?: string | null;
          transcript?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          audio_url?: string | null;
          biggest_loss?: string | null;
          biggest_win?: string | null;
          call_date?: string;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          is_free_preview?: boolean;
          pnl_summary?: string | null;
          price_usdc?: number;
          tomorrow_thesis?: string | null;
          transcript?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "earnings_calls_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      prediction_outcomes: {
        Row: {
          brier_delta: number | null;
          created_at: string;
          id: string;
          outcome: boolean;
          prediction_id: string;
          resolved_at: string;
          resolver: string | null;
          source_url: string | null;
        };
        Insert: {
          brier_delta?: number | null;
          created_at?: string;
          id?: string;
          outcome: boolean;
          prediction_id: string;
          resolved_at?: string;
          resolver?: string | null;
          source_url?: string | null;
        };
        Update: {
          brier_delta?: number | null;
          created_at?: string;
          id?: string;
          outcome?: boolean;
          prediction_id?: string;
          resolved_at?: string;
          resolver?: string | null;
          source_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prediction_outcomes_prediction_id_fkey";
            columns: ["prediction_id"];
            isOneToOne: true;
            referencedRelation: "predictions";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions: {
        Row: {
          agent_id: string;
          agent_prob: number;
          confidence: number;
          created_at: string;
          expires_at: string;
          id: string;
          market_id: string;
          market_prob: number | null;
          prediction_hash: string | null;
          question: string;
          reasoning: string | null;
          signature: string | null;
          status: Database["public"]["Enums"]["prediction_status"];
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          agent_prob: number;
          confidence?: number;
          created_at?: string;
          expires_at: string;
          id?: string;
          market_id: string;
          market_prob?: number | null;
          prediction_hash?: string | null;
          question: string;
          reasoning?: string | null;
          signature?: string | null;
          status?: Database["public"]["Enums"]["prediction_status"];
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          agent_prob?: number;
          confidence?: number;
          created_at?: string;
          expires_at?: string;
          id?: string;
          market_id?: string;
          market_prob?: number | null;
          prediction_hash?: string | null;
          question?: string;
          reasoning?: string | null;
          signature?: string | null;
          status?: Database["public"]["Enums"]["prediction_status"];
          submitted_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
          user_id: string;
          wallet_address: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
          wallet_address?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
          wallet_address?: string | null;
        };
        Relationships: [];
      };
      reputation_events: {
        Row: {
          agent_id: string;
          created_at: string;
          id: string;
          new_score: number;
          prediction_id: string | null;
          reason: string | null;
          score_delta: number;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          id?: string;
          new_score: number;
          prediction_id?: string | null;
          reason?: string | null;
          score_delta: number;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          id?: string;
          new_score?: number;
          prediction_id?: string | null;
          reason?: string | null;
          score_delta?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reputation_events_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reputation_events_prediction_id_fkey";
            columns: ["prediction_id"];
            isOneToOne: false;
            referencedRelation: "predictions";
            referencedColumns: ["id"];
          },
        ];
      };
      risk_events: {
        Row: {
          agent_id: string | null;
          created_at: string;
          detail: string | null;
          id: string;
          kind: string;
          resolved: boolean;
          resolved_at: string | null;
          severity: Database["public"]["Enums"]["risk_severity"];
        };
        Insert: {
          agent_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind: string;
          resolved?: boolean;
          resolved_at?: string | null;
          severity?: Database["public"]["Enums"]["risk_severity"];
        };
        Update: {
          agent_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind?: string;
          resolved?: boolean;
          resolved_at?: string | null;
          severity?: Database["public"]["Enums"]["risk_severity"];
        };
        Relationships: [
          {
            foreignKeyName: "risk_events_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vault_transactions: {
        Row: {
          agent_id: string;
          amount_usdc: number;
          block_number: number | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["vault_tx_kind"];
          metadata: Json;
          tx_hash: string | null;
        };
        Insert: {
          agent_id: string;
          amount_usdc: number;
          block_number?: number | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["vault_tx_kind"];
          metadata?: Json;
          tx_hash?: string | null;
        };
        Update: {
          agent_id?: string;
          amount_usdc?: number;
          block_number?: number | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["vault_tx_kind"];
          metadata?: Json;
          tx_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vault_transactions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          created_at: string;
          error: string | null;
          event_type: string;
          external_id: string | null;
          id: string;
          payload: Json;
          processed_at: string | null;
          provider: string;
          signature_verified: boolean;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_type: string;
          external_id?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider: string;
          signature_verified?: boolean;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_type?: string;
          external_id?: string | null;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          signature_verified?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      agent_status: "draft" | "pending" | "active" | "paused" | "slashed" | "retired";
      agent_strategy: "Macro" | "Sports" | "Contrarian" | "Yield" | "Tech" | "Custom";
      app_role: "admin" | "moderator" | "user";
      circle_tx_kind: "deposit" | "withdrawal" | "transfer" | "gateway_topup" | "gateway_spend";
      circle_tx_status: "pending" | "confirmed" | "failed";
      delegation_status: "pending" | "active" | "withdrawn" | "slashed";
      prediction_status: "active" | "resolved" | "cancelled";
      risk_severity: "info" | "warning" | "critical";
      vault_tx_kind: "stake" | "unstake" | "payout" | "slash" | "fee";
    };
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
      agent_status: ["draft", "pending", "active", "paused", "slashed", "retired"],
      agent_strategy: ["Macro", "Sports", "Contrarian", "Yield", "Tech", "Custom"],
      app_role: ["admin", "moderator", "user"],
      circle_tx_kind: ["deposit", "withdrawal", "transfer", "gateway_topup", "gateway_spend"],
      circle_tx_status: ["pending", "confirmed", "failed"],
      delegation_status: ["pending", "active", "withdrawn", "slashed"],
      prediction_status: ["active", "resolved", "cancelled"],
      risk_severity: ["info", "warning", "critical"],
      vault_tx_kind: ["stake", "unstake", "payout", "slash", "fee"],
    },
  },
} as const;
