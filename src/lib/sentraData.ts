import { createPublicClient, formatUnits, http, type Address } from "viem";
import { supabase } from "@/integrations/supabase/client";
import { arcTestnet } from "@/lib/wagmi";
import { sentraDelegationVaultAbi, sentraProtocolContracts } from "@/contracts/sentraProtocol";
import type { Tables } from "@/integrations/supabase/types";
import type { AgentStrategy } from "@/lib/agentTypes";
import { loadRuntimeDataset } from "@/lib/runtimeDataset";

export type Strategy = Exclude<AgentStrategy, "Custom">;

export interface Agent {
  id: string;
  databaseId: string;
  registryAgentId: `0x${string}` | null;
  name: string;
  strategy: Strategy;
  description: string;
  metadataUri: string;
  walletAddress: string;
  circleWalletId: string;
  predictionSigningKeyId: string;
  stakedAmount: number;
  reputation: number;
  brierScore: number;
  sharpeRatio: number;
  winRate: number;
  delegationCap: number;
  delegationFilled: number;
  gatewayBalance: number;
  pnl7d: number;
  pnl30d: number;
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  createdAt: string;
  followers: number;
  color: string;
  riskLimits: {
    maxDailyLossUsdc: number;
    maxOpenPositions: number;
    maxSlippageBps: number;
    maxLeverage: number;
  };
  validationCount: number;
  validationHistory: { at: string; status: string; note: string }[];
  slashed: boolean;
  earningsCallSubscription: {
    enabled: boolean;
    tier: "free" | "paid";
    monthlyUsd: number;
  };
  pnlHistory: { day: number; value: number }[];
}

export interface Prediction {
  id: string;
  agentId: string;
  marketId: string;
  question: string;
  agentProb: number;
  marketProb: number;
  confidence: number;
  expiresAt: string;
  status: "active" | "resolved";
  outcome: null | "correct" | "wrong";
  reasoning: string;
  submittedAt: string;
}

export interface EarningsCall {
  id: string;
  callAccessId: `0x${string}`;
  agentId: string;
  date: string;
  durationSeconds: number;
  transcript: string;
  pnlSummary: string;
  biggestWin: string;
  biggestLoss: string;
  tomorrowThesis: string;
  subscriptionCost: number;
  title: string;
  summary: string;
  audioUrl: string | null;
  isFreePreview: boolean;
  fullContentAvailable: boolean;
  locked: boolean;
}

export interface DelegationPosition {
  id: string;
  agentId: string;
  amount: number;
  shares: number;
  entry: string;
  current: number;
  status: Tables<"delegations">["status"];
  entryTxHash: string | null;
  exitTxHash: string | null;
}

export interface VaultTransaction {
  id: string;
  hash: string | null;
  kind: string;
  amount: number;
  date: string;
  status: string;
}

export type SentraDataset = {
  agents: Agent[];
  predictions: Prediction[];
  earningsCalls: EarningsCall[];
  delegations: DelegationPosition[];
  vaultTransactions: VaultTransaction[];
  activityFeed: string[];
};

const colors = [
  "#7C3AED",
  "#0D9488",
  "#D97706",
  "#EF4444",
  "#10B981",
  "#A78BFA",
  "#3B82F6",
  "#EC4899",
];

const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const isStrategy = (strategy: AgentStrategy): strategy is Strategy => strategy !== "Custom";

const num = (value: string | number | null | undefined) => Number(value ?? 0);

function colorFor(id: string, index: number) {
  const hash = [...id].reduce((acc, char) => acc + char.charCodeAt(0), index);
  return colors[Math.abs(hash) % colors.length];
}

function asDay(date: string | null | undefined) {
  return (date ?? new Date().toISOString()).slice(0, 10);
}

async function resolveCurrentUserId(userId?: string | null) {
  if (userId !== undefined) return userId;
  return null;
}

function browserHasSupabaseConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return Boolean(env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_PUBLISHABLE_KEY);
}

function serverHasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}

function canReadSupabase() {
  return typeof window === "undefined" ? serverHasSupabaseConfig() : browserHasSupabaseConfig();
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function fallbackAddress(address: string | null | undefined): Address {
  return (
    address && address.startsWith("0x") ? address : "0x0000000000000000000000000000000000000000"
  ) as Address;
}

function agentIdBytes(agent: Tables<"agents">) {
  const raw = agent.registry_agent_id ?? agent.metadata_hash ?? "";
  if (raw.startsWith("0x") && raw.length === 66) return raw as `0x${string}`;
  return null;
}

function emptySeries(): { day: number; value: number }[] {
  return Array.from({ length: 30 }, (_, day) => ({ day: day + 1, value: 0 }));
}

async function readDelegatedFromArc(
  agentRows: Tables<"agents">[],
  fallbackDelegated: Map<string, number>,
) {
  const vault = sentraProtocolContracts.delegationVault;
  if (!vault) return fallbackDelegated;

  const reads = agentRows
    .map((agent) => ({ agent, idBytes: agentIdBytes(agent) }))
    .filter((item): item is { agent: Tables<"agents">; idBytes: `0x${string}` } => !!item.idBytes)
    .map(async ({ agent, idBytes }) => {
      try {
        const raw = await arcClient.readContract({
          address: vault as Address,
          abi: sentraDelegationVaultAbi,
          functionName: "totalDelegated",
          args: [idBytes],
        });
        return [agent.id, Number(formatUnits(raw as bigint, 6))] as const;
      } catch {
        return [agent.id, fallbackDelegated.get(agent.id) ?? 0] as const;
      }
    });

  return new Map(await Promise.all(reads));
}

function mapAgent(
  agent: Tables<"agents">,
  predictions: Tables<"predictions">[],
  outcomes: Tables<"prediction_outcomes">[],
  configs: Tables<"agent_configs">[],
  wallets: Tables<"agent_wallets">[],
  delegations: Tables<"delegations">[],
  arcDelegated: Map<string, number>,
  index: number,
): Agent {
  const agentPredictions = predictions.filter((prediction) => prediction.agent_id === agent.id);
  const resolved = agentPredictions.filter((prediction) => prediction.status === "resolved");
  const outcomeByPrediction = new Map(outcomes.map((outcome) => [outcome.prediction_id, outcome]));
  const correct = resolved.filter((prediction) => {
    const outcome = outcomeByPrediction.get(prediction.id);
    if (!outcome) return false;
    return prediction.agent_prob >= 0.5 === outcome.outcome;
  }).length;
  const activeConfig = configs.find((config) => config.agent_id === agent.id);
  const wallet = wallets.find((item) => item.agent_id === agent.id);
  const delegated = delegations
    .filter((delegation) => delegation.agent_id === agent.id && delegation.status !== "withdrawn")
    .reduce((sum, delegation) => sum + num(delegation.amount_usdc), 0);
  return {
    id: agent.slug,
    databaseId: agent.id,
    registryAgentId: agentIdBytes(agent),
    name: agent.name,
    strategy: isStrategy(agent.strategy) ? agent.strategy : "Macro",
    description: agent.description ?? "No public strategy description has been published yet.",
    metadataUri: agent.metadata_uri ?? "",
    walletAddress: fallbackAddress(wallet?.wallet_address),
    circleWalletId: wallet?.circle_wallet_id ?? "",
    predictionSigningKeyId: activeConfig?.signing_key_id ?? "",
    stakedAmount: num(wallet?.usdc_stake),
    reputation: Math.round(num(agent.reputation)),
    brierScore: num(agent.brier_score),
    sharpeRatio: 0,
    winRate: resolved.length ? correct / resolved.length : 0,
    delegationCap: num(activeConfig?.delegation_cap_usdc),
    delegationFilled: arcDelegated.get(agent.id) ?? delegated,
    gatewayBalance: num(wallet?.gateway_balance_usdc),
    pnl7d: 0,
    pnl30d: 0,
    totalPredictions: agentPredictions.length,
    resolvedPredictions: resolved.length,
    correctPredictions: correct,
    createdAt: asDay(agent.created_at),
    followers: agent.followers_count,
    color: agent.color ?? colorFor(agent.id, index),
    riskLimits: {
      maxDailyLossUsdc: num(activeConfig?.max_daily_loss_usdc),
      maxOpenPositions: num(activeConfig?.max_open_positions),
      maxSlippageBps: num(activeConfig?.max_slippage_bps),
      maxLeverage: num(activeConfig?.max_leverage) || 1,
    },
    validationCount: 0,
    validationHistory: [],
    slashed: agent.status === "slashed",
    earningsCallSubscription: {
      enabled: activeConfig?.earnings_call_enabled ?? true,
      tier: activeConfig?.earnings_call_tier === "free" ? "free" : "paid",
      monthlyUsd: num(activeConfig?.earnings_call_monthly_usd),
    },
    pnlHistory: emptySeries(),
  };
}

function mapPrediction(
  prediction: Tables<"predictions">,
  outcome?: Tables<"prediction_outcomes">,
): Prediction {
  const agentProb = Math.round(prediction.agent_prob * 100);
  const marketProb = Math.round((prediction.market_prob ?? 0) * 100);
  const isResolved = prediction.status === "resolved";
  const expectedOutcome = agentProb >= 50;
  return {
    id: prediction.id,
    agentId: prediction.agent_id,
    marketId: prediction.market_id,
    question: prediction.question,
    agentProb,
    marketProb,
    confidence: Math.round(prediction.confidence),
    expiresAt: asDay(prediction.expires_at),
    status: isResolved ? "resolved" : "active",
    outcome:
      isResolved && outcome ? (expectedOutcome === outcome.outcome ? "correct" : "wrong") : null,
    reasoning: prediction.reasoning ?? "",
    submittedAt: prediction.submitted_at,
  };
}

function callPrice(price: string | number | null | undefined, isFreePreview: boolean) {
  if (isFreePreview) return 0;
  const parsed = num(price);
  return parsed > 0 ? parsed : 0.01;
}

function callAccessId(callId: string) {
  return `0x${callId.replace(/-/g, "").padEnd(64, "0")}` as `0x${string}`;
}

function mapFullCall(call: Tables<"earnings_calls">): EarningsCall {
  const subscriptionCost = callPrice(call.price_usdc, call.is_free_preview);
  return {
    id: call.id,
    callAccessId: callAccessId(call.id),
    agentId: call.agent_id,
    date: call.call_date,
    durationSeconds: call.duration_seconds ?? 0,
    transcript: call.transcript ?? call.pnl_summary ?? "Transcript is not available yet.",
    pnlSummary: call.pnl_summary ?? "No PnL summary published.",
    biggestWin: call.biggest_win ?? "",
    biggestLoss: call.biggest_loss ?? "",
    tomorrowThesis: call.tomorrow_thesis ?? "",
    subscriptionCost,
    title: `Earnings Call ${asDay(call.call_date)}`,
    summary: call.pnl_summary ?? "",
    audioUrl: call.audio_url,
    isFreePreview: call.is_free_preview,
    fullContentAvailable: true,
    locked: false,
  };
}

function mapPreviewCall(
  preview: Tables<"earnings_call_previews">,
  fullCall?: Tables<"earnings_calls">,
): EarningsCall {
  if (fullCall) return mapFullCall(fullCall);
  const subscriptionCost = callPrice(preview.price_usdc, preview.is_free_preview);
  const locked = !preview.is_free_preview && subscriptionCost > 0;
  return {
    id: preview.call_id,
    callAccessId: callAccessId(preview.call_id),
    agentId: preview.agent_id,
    date: preview.call_date,
    durationSeconds: preview.duration_seconds ?? 0,
    transcript: preview.preview_text,
    pnlSummary: locked ? "Unlock required" : preview.preview_text,
    biggestWin: "",
    biggestLoss: "",
    tomorrowThesis: "",
    subscriptionCost,
    title: `Earnings Call ${asDay(preview.call_date)}`,
    summary: preview.preview_text,
    audioUrl: null,
    isFreePreview: preview.is_free_preview,
    fullContentAvailable: false,
    locked,
  };
}

function emptyDataset(): SentraDataset {
  return {
    agents: [],
    predictions: [],
    earningsCalls: [],
    delegations: [],
    vaultTransactions: [],
    activityFeed: [],
  };
}

async function fallbackRuntimeDataset() {
  const runtime = await loadRuntimeDataset();
  if (runtime) return runtime;
  return emptyDataset();
}

function isRecoverableSupabaseReadError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("permission denied for function has_role") ||
    message.includes("permission denied for table") ||
    message.includes("permission denied for schema") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function optionalRows<T>(
  table: string,
  result: { data: T[] | null; error: { message?: string } | null },
): T[] {
  if (result.error) {
    console.warn(`SENTRA optional Supabase read skipped for ${table}: ${result.error.message}`);
    return [];
  }
  return result.data ?? [];
}

export async function loadSentraDataset(userId?: string | null): Promise<SentraDataset> {
  if (!canReadSupabase()) return fallbackRuntimeDataset();

  try {
    const resolvedUserId = await resolveCurrentUserId(userId);
    const [
      agentsResult,
      predictionsResult,
      outcomesResult,
      callPreviewsResult,
      callsResult,
      txResult,
      reputationResult,
    ] = await Promise.all([
      supabase.from("agents").select("*").order("created_at", { ascending: false }),
      supabase.from("predictions").select("*").order("submitted_at", { ascending: false }),
      supabase.from("prediction_outcomes").select("*").order("resolved_at", { ascending: false }),
      supabase.from("earnings_call_previews").select("*").order("created_at", { ascending: false }),
      supabase.from("earnings_calls").select("*").order("created_at", { ascending: false }),
      resolvedUserId
        ? supabase.from("vault_transactions").select("*").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("reputation_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(16),
    ]);

    const firstError = agentsResult.error ?? predictionsResult.error;

    if (firstError) {
      if (isRecoverableSupabaseReadError(firstError)) {
        console.warn(`SENTRA Supabase read skipped: ${firstError.message}`);
        return fallbackRuntimeDataset();
      }
      throw firstError;
    }
    if (callsResult.error && !isRecoverableSupabaseReadError(callsResult.error)) {
      throw callsResult.error;
    }

    let configRows: Tables<"agent_configs">[] = [];
    let walletRows: Tables<"agent_wallets">[] = [];
    let allDelegationRows: Tables<"delegations">[] = [];
    let delegationRows: Tables<"delegations">[] = [];

    if (resolvedUserId) {
      const [configsResult, walletsResult, allDelegationsResult, delegationsResult] =
        await Promise.all([
          supabase.from("agent_configs").select("*").order("created_at", { ascending: false }),
          supabase.from("agent_wallets").select("*").order("created_at", { ascending: false }),
          supabase.from("delegations").select("*").order("created_at", { ascending: false }),
          supabase
            .from("delegations")
            .select("*")
            .eq("delegator_id", resolvedUserId)
            .order("created_at", { ascending: false }),
        ]);

      configRows = optionalRows("agent_configs", configsResult);
      walletRows = optionalRows("agent_wallets", walletsResult);
      allDelegationRows = optionalRows("delegations", allDelegationsResult);
      delegationRows = optionalRows("delegations", delegationsResult);
    }

    const agentRows = agentsResult.data ?? [];
    const predictionRows = predictionsResult.data ?? [];
    const outcomeRows = optionalRows("prediction_outcomes", outcomesResult);
    const callPreviewRows = optionalRows("earnings_call_previews", callPreviewsResult);
    const fullCallRows = optionalRows("earnings_calls", callsResult);
    const vaultTransactionRows = optionalRows("vault_transactions", txResult);
    const reputationRows = optionalRows("reputation_events", reputationResult);
    const fallbackDelegated = new Map<string, number>();
    allDelegationRows.forEach((delegation) => {
      if (delegation.status === "withdrawn") return;
      fallbackDelegated.set(
        delegation.agent_id,
        (fallbackDelegated.get(delegation.agent_id) ?? 0) + num(delegation.amount_usdc),
      );
    });
    const arcDelegated = await readDelegatedFromArc(agentRows, fallbackDelegated);
    const byUuid = new Map<string, string>();
    const agents = agentRows.map((agent, index) => {
      const mapped = mapAgent(
        agent,
        predictionRows,
        outcomeRows,
        configRows,
        walletRows,
        allDelegationRows,
        arcDelegated,
        index,
      );
      byUuid.set(agent.id, mapped.id);
      return mapped;
    });
    const outcomeByPrediction = new Map(
      outcomeRows.map((outcome) => [outcome.prediction_id, outcome]),
    );
    const predictions = predictionRows.map((prediction) => ({
      ...mapPrediction(prediction, outcomeByPrediction.get(prediction.id)),
      agentId: byUuid.get(prediction.agent_id) ?? prediction.agent_id,
    }));
    const fullCallById = new Map(fullCallRows.map((call) => [call.id, call]));
    const previewIds = new Set(callPreviewRows.map((preview) => preview.call_id));
    const previewCalls = callPreviewRows.map((preview) => ({
      ...mapPreviewCall(preview, fullCallById.get(preview.call_id)),
      agentId: byUuid.get(preview.agent_id) ?? preview.agent_id,
    }));
    const fullOnlyCalls = fullCallRows
      .filter((call) => !previewIds.has(call.id))
      .map((call) => ({
        ...mapFullCall(call),
        agentId: byUuid.get(call.agent_id) ?? call.agent_id,
      }));
    const earningsCalls = [...previewCalls, ...fullOnlyCalls].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const delegations = delegationRows.map((delegation) => ({
      id: delegation.id,
      agentId: byUuid.get(delegation.agent_id) ?? delegation.agent_id,
      amount: num(delegation.amount_usdc),
      shares: num(delegation.amount_usdc),
      entry: asDay(delegation.created_at),
      current: num(delegation.amount_usdc),
      status: delegation.status,
      entryTxHash: delegation.tx_hash,
      exitTxHash: null,
    }));
    const vaultTransactions = vaultTransactionRows.map((tx) => ({
      id: tx.id,
      hash: tx.tx_hash,
      kind: tx.kind,
      amount: num(tx.amount_usdc),
      date: asDay(tx.created_at),
      status: tx.tx_hash ? "confirmed" : "created",
    }));
    const activityFeed =
      reputationRows.map(
        (event) =>
          `${byUuid.get(event.agent_id) ?? "Agent"} ${event.reason ?? "reputation update"} · reputation ${event.new_score}`,
      ) ?? [];

    const dataset = {
      agents,
      predictions,
      earningsCalls,
      delegations,
      vaultTransactions,
      activityFeed,
    };
    if (
      dataset.agents.length === 0 &&
      dataset.predictions.length === 0 &&
      dataset.earningsCalls.length === 0
    ) {
      return fallbackRuntimeDataset();
    }
    return dataset;
  } catch (error) {
    if (isRecoverableSupabaseReadError(error as { message?: string })) {
      console.warn(
        `SENTRA Supabase read skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallbackRuntimeDataset();
    }
    throw error;
  }
}

export function getAgent(dataset: SentraDataset, id: string) {
  return dataset.agents.find((agent) => agent.id === id);
}

export function getAgentPredictions(dataset: SentraDataset, id: string) {
  return dataset.predictions.filter((prediction) => prediction.agentId === id);
}

export function getAgentCalls(dataset: SentraDataset, id: string) {
  return dataset.earningsCalls.filter((call) => call.agentId === id);
}

export function getCall(dataset: SentraDataset, id: string) {
  return dataset.earningsCalls.find((call) => call.id === id);
}
