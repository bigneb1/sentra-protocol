import { createServerFn } from "@tanstack/react-start";
import { keccak256, toHex } from "viem";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  ARC_CIRCLE_BLOCKCHAIN,
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_USDC_ADDRESS,
} from "@/lib/arcTestnet";
import { SENTRA_ARC_TESTNET_DEPLOYMENT } from "@/lib/agentTypes";
import {
  computeBrierScore,
  computeNextReputation,
  computeReputationDelta,
} from "@/lib/sentraScoring";

const strategies = ["Macro", "Sports", "Contrarian", "Yield", "Tech", "Custom"] as const;

const money = z.number().finite().min(0).max(100_000_000);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const riskLimitsSchema = z.object({
  maxDailyLossUsdc: money,
  maxOpenPositions: z.number().int().min(1).max(100),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  maxLeverage: z.number().finite().min(1).max(20),
});

const authMiddleware = [requireSupabaseAuth];

type AuthContext = {
  userId: string;
};

type ProtocolContracts = {
  agentRegistry: string;
  stakeVault: string;
  delegationVault: string;
  predictionRegistry: string;
  reputationOracle: string;
  slashingModule: string;
  callAccess: string;
};

function getAuthContext(context: unknown): AuthContext {
  const auth = context as Partial<AuthContext>;
  if (!auth.userId) throw new Error("Unauthorized");
  return { userId: auth.userId };
}

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function getProtocolContracts(): ProtocolContracts {
  return {
    agentRegistry:
      process.env.VITE_SENTRA_AGENT_REGISTRY_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.agentRegistry,
    stakeVault:
      process.env.VITE_SENTRA_STAKE_VAULT_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.stakeVault,
    delegationVault:
      process.env.VITE_SENTRA_DELEGATION_VAULT_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.delegationVault,
    predictionRegistry:
      process.env.VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.predictionRegistry,
    reputationOracle:
      process.env.VITE_SENTRA_REPUTATION_ORACLE_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.reputationOracle,
    slashingModule:
      process.env.VITE_SENTRA_SLASHING_MODULE_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.slashingModule,
    callAccess:
      process.env.VITE_SENTRA_CALL_ACCESS_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.callAccess,
  };
}

function missingProtocolContracts() {
  return Object.entries(getProtocolContracts())
    .filter(([, value]) => !value)
    .map(([key]) => `VITE_SENTRA_${key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ADDRESS`);
}

function missingCircleEnv() {
  return [
    !process.env.CIRCLE_API_KEY && "CIRCLE_API_KEY",
    !(process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET) && "ENTITY_SECRET",
  ].filter(Boolean) as string[];
}

function slugify(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "agent";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hashJson(value: unknown) {
  return keccak256(toHex(stableJson(value)));
}

function hashText(value: string) {
  return keccak256(toHex(value));
}

function recordFromJson(value: Json | unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function earningsCallPrice(call: { is_free_preview: boolean; price_usdc: number | null }) {
  if (call.is_free_preview) return 0;
  const parsed = Number(call.price_usdc ?? 0);
  return parsed > 0 ? parsed : 0.01;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

async function audit(
  action: string,
  input: { actorId?: string | null; table?: string; recordId?: string; data?: unknown },
) {
  const supabaseAdmin = await getSupabaseAdmin();
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.actorId ?? null,
    action,
    entity_type: input.table ?? null,
    entity_id: input.recordId ?? null,
    metadata: (input.data ?? {}) as Json,
  });
}

async function requireAgentOwner(agentId: string, userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();
  if (error) throw error;
  if (!agent || agent.owner_id !== userId)
    throw new Error("Agent not found or not owned by current user");
  return agent;
}

async function requireResolver(userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: role, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"])
    .maybeSingle();
  if (error) throw error;
  if (!role) {
    throw new Error("Resolver role required");
  }
}

async function hasConfirmedCallUnlock(
  supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  call: { id: string; is_free_preview: boolean; price_usdc: number | null },
  userId: string,
) {
  const price = earningsCallPrice(call);
  if (price <= 0) return true;

  const { data: unlock, error: unlockError } = await supabaseAdmin
    .from("call_unlocks")
    .select("id, amount_paid_usdc")
    .eq("call_id", call.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (unlockError) throw unlockError;
  if (!unlock || Number(unlock.amount_paid_usdc ?? 0) < price) return false;

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("circle_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("amount_usdc", price)
    .eq("raw->>callId", call.id)
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;

  return Boolean(payment);
}

async function getCircleWalletClient() {
  const missing = missingCircleEnv();
  if (missing.length > 0) {
    return { client: null, missing };
  }

  const { initiateDeveloperControlledWalletsClient } =
    await import("@circle-fin/developer-controlled-wallets");
  return {
    client: initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!,
      baseUrl: process.env.CIRCLE_BASE_URL,
    }),
    missing: [],
  };
}

export const registerAgentAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      name: z.string().min(2).max(32),
      strategy: z.enum(strategies),
      description: z.string().max(200).optional(),
      stakeUsdc: money,
      delegationCapUsdc: money,
      minConfidenceBps: z.number().int().min(0).max(10_000),
      maxActivePredictions: z.number().int().min(1).max(100),
      autoCalls: z.boolean(),
      publicDelegations: z.boolean(),
      riskLimits: riskLimitsSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getSupabaseAdmin();
    const slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 8)}`;
    const metadata = {
      name: data.name,
      description: data.description ?? "",
      agent_type: "sentra_prediction_agent",
      strategy: data.strategy,
      version: "1.0.0",
    };
    const metadataHash = hashJson(metadata);
    const registryAgentId = hashText(`sentra:${userId}:${slug}:${crypto.randomUUID()}`);

    await supabaseAdmin.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id" });

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .insert({
        owner_id: userId,
        slug,
        name: data.name,
        strategy: data.strategy,
        description: data.description ?? null,
        status: "draft",
        metadata_uri: `sentra://metadata/${slug}`,
        metadata_hash: metadataHash,
      })
      .select("*")
      .single();

    if (agentError) throw agentError;

    const { error: configError } = await supabaseAdmin.from("agent_configs").insert({
      agent_id: agent.id,
      delegation_cap_usdc: data.publicDelegations ? data.delegationCapUsdc : 0,
      earnings_call_enabled: data.autoCalls,
      earnings_call_monthly_usd: 12,
      earnings_call_tier: "paid",
      max_daily_loss_usdc: data.riskLimits.maxDailyLossUsdc,
      max_leverage: data.riskLimits.maxLeverage,
      max_open_positions: data.riskLimits.maxOpenPositions,
      max_slippage_bps: data.riskLimits.maxSlippageBps,
    });
    if (configError) throw configError;

    if (data.stakeUsdc > 0) {
      await supabaseAdmin.from("vault_transactions").insert({
        agent_id: agent.id,
        kind: "stake",
        amount_usdc: data.stakeUsdc,
        metadata: {
          registryAgentId,
          missingProtocolEnv: missingProtocolContracts(),
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      });
    }

    await audit("agent.registered_draft", {
      actorId: userId,
      table: "agents",
      recordId: agent.id,
      data: agent,
    });

    return {
      agentId: agent.id,
      slug: agent.slug,
      registryAgentId,
      metadataHash,
      protocolReady: missingProtocolContracts().length === 0,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const createStakeIntentAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(z.object({ agentId: z.string().uuid(), amountUsdc: money.min(0.000001) }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const contracts = getProtocolContracts();
    const { data: tx, error } = await supabaseAdmin
      .from("vault_transactions")
      .insert({
        agent_id: agent.id,
        kind: "stake",
        amount_usdc: data.amountUsdc,
        metadata: {
          metadataHash: agent.metadata_hash,
          missingProtocolEnv: missingProtocolContracts(),
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit("stake.intent_created", {
      actorId: userId,
      table: "vault_transactions",
      recordId: tx.id,
      data: tx,
    });
    return { status: "created" as const, intentId: tx.id, stakeVault: contracts.stakeVault };
  });

export const createAgentWalletAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(z.object({ agentId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: existingWallet, error: existingWalletError } = await supabaseAdmin
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (existingWalletError) throw existingWalletError;

    if (existingWallet?.circle_wallet_id && existingWallet.wallet_address) {
      return {
        status: "ready" as const,
        walletId: existingWallet.circle_wallet_id,
        address: existingWallet.wallet_address,
      };
    }

    const { client, missing } = await getCircleWalletClient();
    if (!client) {
      await audit("agent_wallet.missing_circle_config", {
        actorId: userId,
        table: "agents",
        recordId: agent.id,
        data: { missing },
      });
      return { status: "needs_config" as const, missing };
    }

    const walletSetId =
      process.env.CIRCLE_AGENT_WALLET_SET_ID ??
      (
        await client.createWalletSet({
          name: "SENTRA Agent Wallets",
          idempotencyKey: crypto.randomUUID(),
        })
      ).data?.walletSet?.id;

    if (!walletSetId) throw new Error("Circle wallet set was not returned");

    const response = await client.createWallets({
      blockchains: [ARC_CIRCLE_BLOCKCHAIN],
      count: 1,
      walletSetId,
      accountType: "SCA",
      metadata: [{ name: `${agent.name} treasury`, refId: `sentra-agent:${agent.id}` }],
      idempotencyKey: crypto.randomUUID(),
    });
    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) throw new Error("Circle wallet was not returned");

    const { error: walletError } = await supabaseAdmin.from("agent_wallets").insert({
      agent_id: agent.id,
      circle_wallet_id: wallet.id,
      wallet_address: wallet.address,
      blockchain: ARC_CIRCLE_BLOCKCHAIN,
    });
    if (walletError) throw walletError;

    await audit("agent_wallet.created", {
      actorId: userId,
      table: "agent_wallets",
      recordId: agent.id,
      data: wallet,
    });
    return { status: "ready" as const, walletId: wallet.id, address: wallet.address };
  });

export const registerErc8004IdentityAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({ agentId: z.string().uuid(), metadataUri: z.string().min(1).max(512).optional() }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { client, missing } = await getCircleWalletClient();

    if (!client) {
      await audit("erc8004_identity.missing_circle_config", {
        actorId: userId,
        table: "agents",
        recordId: agent.id,
        data: { missing },
      });
      return { status: "needs_config" as const, missing };
    }

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (walletError) throw walletError;

    if (!wallet?.wallet_address) {
      return { status: "needs_wallet" as const, missing: ["agent wallet"] };
    }

    const metadataUri = data.metadataUri ?? agent.metadata_uri ?? `sentra://metadata/${agent.slug}`;
    const tx = await client.createContractExecutionTransaction({
      walletAddress: wallet.wallet_address,
      blockchain: ARC_CIRCLE_BLOCKCHAIN,
      contractAddress: ARC_ERC8004_IDENTITY_REGISTRY,
      abiFunctionSignature: "register(string)",
      abiParameters: [metadataUri],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: crypto.randomUUID(),
    });

    const circleId = tx.data?.id ?? null;
    await supabaseAdmin.from("circle_transactions").insert({
      user_id: userId,
      agent_id: agent.id,
      circle_wallet_id: wallet.circle_wallet_id,
      circle_tx_id: circleId,
      kind: "transfer",
      amount_usdc: 0,
      status: "pending",
      raw: { metadataUri, response: tx.data } as unknown as Json,
    });

    await audit("erc8004_identity.submitted", {
      actorId: userId,
      table: "agents",
      recordId: agent.id,
      data: tx.data,
    });
    return { status: "submitted" as const, circleTransactionId: circleId };
  });

export const createDelegationIntentAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      amountUsdc: money.min(0.000001),
      delegatorAddress: address.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getSupabaseAdmin();
    const contracts = getProtocolContracts();
    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", data.agentId)
      .single();
    if (agentError) throw agentError;

    const { data: delegation, error } = await supabaseAdmin
      .from("delegations")
      .insert({
        agent_id: data.agentId,
        delegator_id: userId,
        amount_usdc: data.amountUsdc,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("delegation.intent_created", {
      actorId: userId,
      table: "delegations",
      recordId: delegation.id,
      data: {
        ...delegation,
        agentSlug: agent.slug,
        delegatorAddress: data.delegatorAddress ?? null,
        missingProtocolEnv: missingProtocolContracts(),
        usdcAddress: ARC_USDC_ADDRESS,
      },
    });
    return {
      status: "created" as const,
      intentId: delegation.id,
      delegationVault: contracts.delegationVault,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const createWithdrawalIntentAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(z.object({ delegationId: z.string().uuid(), amountUsdc: money.min(0.000001) }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: delegation, error: delegationError } = await supabaseAdmin
      .from("delegations")
      .select("*")
      .eq("id", data.delegationId)
      .eq("delegator_id", userId)
      .single();
    if (delegationError) throw delegationError;

    const { data: tx, error } = await supabaseAdmin
      .from("vault_transactions")
      .insert({
        agent_id: delegation.agent_id,
        kind: "unstake",
        amount_usdc: data.amountUsdc,
        metadata: {
          delegationId: delegation.id,
          actorId: userId,
          missingProtocolEnv: missingProtocolContracts(),
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("withdrawal.intent_created", {
      actorId: userId,
      table: "vault_transactions",
      recordId: tx.id,
      data: tx,
    });
    return {
      status: "created" as const,
      intentId: tx.id,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const submitPredictionAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      marketId: z.string().min(1).max(128),
      question: z.string().min(4).max(240),
      agentProbabilityBps: z.number().int().min(0).max(10_000),
      marketProbabilityBps: z.number().int().min(0).max(10_000).optional(),
      confidenceBps: z.number().int().min(0).max(10_000),
      stakeAtRiskUsdc: money.default(0),
      resolvesAt: z.string().datetime().optional(),
      signedPayload: z.record(z.unknown()).default({}),
      signatureHash: bytes32.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const payload = {
      ...data.signedPayload,
      agentId: agent.id,
      marketId: data.marketId,
      question: data.question,
      probabilityBps: data.agentProbabilityBps,
      confidenceBps: data.confidenceBps,
      resolvesAt: data.resolvesAt ?? null,
    };
    const predictionHash = hashJson(payload);
    const expiresAt =
      data.resolvesAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: prediction, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        agent_id: agent.id,
        market_id: data.marketId,
        question: data.question,
        prediction_hash: predictionHash,
        signature: data.signatureHash ?? hashText(stableJson(payload)),
        agent_prob: data.agentProbabilityBps / 10_000,
        market_prob:
          data.marketProbabilityBps === undefined ? null : data.marketProbabilityBps / 10_000,
        confidence: Math.round(data.confidenceBps / 100),
        reasoning: String(jsonRecord(data.signedPayload).reasoning ?? ""),
        status: "active",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("prediction.submitted", {
      actorId: userId,
      table: "predictions",
      recordId: prediction.id,
      data: prediction,
    });
    return { status: "submitted" as const, predictionId: prediction.id, predictionHash };
  });

export const resolvePredictionAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      predictionId: z.string().uuid(),
      outcome: z.boolean(),
      evidenceUri: z.string().max(512).optional(),
      notes: z.string().max(1000).optional(),
      settlementTxHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    await requireResolver(userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: prediction, error: predictionError } = await supabaseAdmin
      .from("predictions")
      .select("*")
      .eq("id", data.predictionId)
      .single();
    if (predictionError) throw predictionError;
    if (prediction.status === "resolved") throw new Error("Prediction already resolved");

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", prediction.agent_id)
      .single();
    if (agentError) throw agentError;

    const previousScore = Number(agent.reputation ?? 0);
    const brier = computeBrierScore(
      Math.round(Number(prediction.agent_prob) * 10_000),
      data.outcome,
    );
    const delta = computeReputationDelta(brier);
    const nextScore = computeNextReputation(previousScore, brier);

    const { data: outcome, error: outcomeError } = await supabaseAdmin
      .from("prediction_outcomes")
      .insert({
        prediction_id: prediction.id,
        outcome: data.outcome,
        brier_delta: brier,
        resolver: userId,
        source_url: data.evidenceUri ?? null,
      })
      .select("*")
      .single();
    if (outcomeError) throw outcomeError;

    const { error: updatePredictionError } = await supabaseAdmin
      .from("predictions")
      .update({ status: "resolved" })
      .eq("id", prediction.id);
    if (updatePredictionError) throw updatePredictionError;

    const { error: updateAgentError } = await supabaseAdmin
      .from("agents")
      .update({
        reputation: nextScore,
        brier_score: brier,
      })
      .eq("id", prediction.agent_id);
    if (updateAgentError) throw updateAgentError;

    await supabaseAdmin.from("reputation_events").insert({
      agent_id: prediction.agent_id,
      prediction_id: prediction.id,
      new_score: nextScore,
      score_delta: delta,
      reason: data.notes ?? data.evidenceUri ?? "prediction_resolved",
    });

    await audit("prediction.resolved", {
      actorId: userId,
      table: "prediction_outcomes",
      recordId: outcome.id,
      data: outcome,
    });
    return {
      status: "resolved" as const,
      brierScore: brier,
      reputationScore: nextScore,
      reputationDelta: delta,
    };
  });

export const updateReputationAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(z.object({ agentId: z.string().uuid(), reason: z.string().max(500).optional() }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    await requireResolver(userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", data.agentId)
      .single();
    if (agentError) throw agentError;

    const { data: predictions, error: predictionError } = await supabaseAdmin
      .from("predictions")
      .select("id")
      .eq("agent_id", data.agentId)
      .eq("status", "resolved");
    if (predictionError) throw predictionError;

    const predictionIds = (predictions ?? []).map((prediction) => prediction.id);
    if (predictionIds.length === 0) {
      return {
        status: "no_resolved_predictions" as const,
        reputationScore: Number(agent.reputation ?? 0),
      };
    }

    const { data: outcomes, error: outcomeError } = await supabaseAdmin
      .from("prediction_outcomes")
      .select("*")
      .in("prediction_id", predictionIds);
    if (outcomeError) throw outcomeError;

    const avgBrier =
      outcomes && outcomes.length > 0
        ? outcomes.reduce((sum, outcome) => sum + Number(outcome.brier_delta ?? 0), 0) /
          outcomes.length
        : 0;
    const nextScore = Math.max(0, Math.min(100, (1 - Math.min(1, avgBrier)) * 100));
    const previousScore = Number(agent.reputation ?? 0);
    const delta = nextScore - previousScore;
    const validationCount = outcomes?.length ?? 0;

    const { error: updateError } = await supabaseAdmin
      .from("agents")
      .update({
        reputation: nextScore,
        brier_score: avgBrier,
      })
      .eq("id", data.agentId);
    if (updateError) throw updateError;

    await supabaseAdmin.from("reputation_events").insert({
      agent_id: data.agentId,
      new_score: nextScore,
      score_delta: delta,
      reason: data.reason ?? "reputation_recomputed",
    });

    await audit("reputation.recomputed", {
      actorId: userId,
      table: "agents",
      recordId: data.agentId,
      data: { previousScore, nextScore, avgBrier, validationCount },
    });
    return {
      status: "updated" as const,
      reputationScore: nextScore,
      brierScore: avgBrier,
      validationCount,
    };
  });

export const publishEarningsCallAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      durationSeconds: z.number().int().min(15).max(7200),
      transcript: z.string().min(120).max(50_000),
      pnlSummary: z.string().min(10).max(1000),
      biggestWin: z.string().max(1000).optional(),
      biggestLoss: z.string().max(1000).optional(),
      tomorrowThesis: z.string().max(1500).optional(),
      audioUrl: z.string().url().optional().nullable(),
      isFreePreview: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const priceUsdc = data.isFreePreview ? 0 : 0.01;
    const contentHash = hashJson({
      agentId: agent.id,
      callDate: data.callDate,
      transcript: data.transcript,
      pnlSummary: data.pnlSummary,
      priceUsdc,
    });

    const callRow = {
      agent_id: agent.id,
      call_date: data.callDate,
      duration_seconds: data.durationSeconds,
      audio_url: data.audioUrl ?? null,
      transcript: data.transcript,
      pnl_summary: data.pnlSummary,
      biggest_win: data.biggestWin ?? null,
      biggest_loss: data.biggestLoss ?? null,
      tomorrow_thesis: data.tomorrowThesis ?? null,
      price_usdc: priceUsdc,
      is_free_preview: data.isFreePreview,
    };

    const { data: existingCall, error: existingError } = await supabaseAdmin
      .from("earnings_calls")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("call_date", data.callDate)
      .maybeSingle();
    if (existingError) throw existingError;

    const request = existingCall
      ? supabaseAdmin.from("earnings_calls").update(callRow).eq("id", existingCall.id)
      : supabaseAdmin.from("earnings_calls").insert(callRow);

    const { data: call, error } = await request.select("*").single();
    if (error) throw error;

    await audit("earnings_call.published", {
      actorId: userId,
      table: "earnings_calls",
      recordId: call.id,
      data: { ...call, contentHash },
    });

    return {
      status: "published" as const,
      callId: call.id,
      contentHash,
      priceUsdc,
    };
  });

export const unlockCallAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(
    z.object({
      callId: z.string().uuid(),
      paymentSource: z.enum(["usdc", "gateway", "free"]).default("usdc"),
      txHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: call, error: callError } = await supabaseAdmin
      .from("earnings_calls")
      .select("*")
      .eq("id", data.callId)
      .single();
    if (callError) throw callError;

    const price = earningsCallPrice(call);
    if (call.is_free_preview || price <= 0) {
      const { data: unlock, error } = await supabaseAdmin
        .from("call_unlocks")
        .upsert(
          {
            call_id: call.id,
            user_id: userId,
            amount_paid_usdc: 0,
            tx_hash: null,
          },
          { onConflict: "user_id,call_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      await audit("call.unlocked", {
        actorId: userId,
        table: "call_unlocks",
        recordId: unlock.id,
        data: unlock,
      });
      return { status: "unlocked" as const, unlockId: unlock.id };
    }

    const confirmedAccess = await hasConfirmedCallUnlock(supabaseAdmin, call, userId);
    if (confirmedAccess) {
      const { data: existingUnlock, error: existingUnlockError } = await supabaseAdmin
        .from("call_unlocks")
        .select("id")
        .eq("call_id", call.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existingUnlockError) throw existingUnlockError;
      return { status: "unlocked" as const, unlockId: existingUnlock?.id ?? call.id };
    }

    if (data.txHash) {
      throw new Error("Paid call unlocks are granted only after Circle payment confirmation");
    }

    const contracts = getProtocolContracts();
    const { data: tx, error } = await supabaseAdmin
      .from("circle_transactions")
      .insert({
        user_id: userId,
        agent_id: call.agent_id,
        kind: data.paymentSource === "gateway" ? "gateway_spend" : "transfer",
        amount_usdc: price,
        status: "pending",
        raw: {
          callId: call.id,
          paymentSource: data.paymentSource,
          callAccess: contracts.callAccess || null,
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("call_unlock.intent_created", {
      actorId: userId,
      table: "circle_transactions",
      recordId: tx.id,
      data: tx,
    });
    return {
      status: "payment_required" as const,
      transactionId: tx.id,
      amountUsdc: price,
      callAccess: contracts.callAccess,
    };
  });

export const getUnlockedCallAction = createServerFn({ method: "POST" })
  .middleware(authMiddleware)
  .inputValidator(z.object({ callId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: call, error: callError } = await supabaseAdmin
      .from("earnings_calls")
      .select("*")
      .eq("id", data.callId)
      .single();
    if (callError) throw callError;

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("owner_id")
      .eq("id", call.agent_id)
      .single();
    if (agentError) throw agentError;

    const { data: unlock, error: unlockError } = await supabaseAdmin
      .from("call_unlocks")
      .select("id")
      .eq("call_id", call.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (unlockError) throw unlockError;

    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;

    const canRead =
      call.is_free_preview ||
      Number(call.price_usdc ?? 0) <= 0 ||
      (Boolean(unlock) && (await hasConfirmedCallUnlock(supabaseAdmin, call, userId))) ||
      agent.owner_id === userId ||
      Boolean(role);

    if (!canRead) {
      throw new Error("Call is locked");
    }

    return {
      id: call.id,
      agentId: call.agent_id,
      callDate: call.call_date,
      durationSeconds: call.duration_seconds ?? 0,
      transcript: call.transcript ?? call.pnl_summary ?? "",
      pnlSummary: call.pnl_summary ?? "",
      biggestWin: call.biggest_win ?? "",
      biggestLoss: call.biggest_loss ?? "",
      tomorrowThesis: call.tomorrow_thesis ?? "",
      audioUrl: call.audio_url,
      priceUsdc: Number(call.price_usdc ?? 0),
      isFreePreview: call.is_free_preview,
    };
  });

export async function recordCircleWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: unknown;
  headers?: Record<string, string>;
  signatureVerified?: boolean;
}) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: event, error } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      provider: "circle",
      external_id: input.eventId,
      event_type: input.eventType,
      signature_verified: input.signatureVerified ?? false,
      payload: { event: input.payload, headers: input.headers ?? {} } as Json,
    })
    .select("*")
    .single();
  if (error) throw error;
  return event;
}

export async function reconcileCircleTransaction(input: {
  circleId?: string | null;
  status?: string | null;
  txHash?: string | null;
  payload?: unknown;
}) {
  if (!input.circleId) return;
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: existingTx, error: existingError } = await supabaseAdmin
    .from("circle_transactions")
    .select("*")
    .eq("circle_tx_id", input.circleId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingTx) return;

  const circleStatus = input.status?.toUpperCase();
  const normalizedStatus =
    circleStatus === "COMPLETE" || circleStatus === "CONFIRMED"
      ? "confirmed"
      : circleStatus === "FAILED"
        ? "failed"
        : "pending";
  const existingRaw = recordFromJson(existingTx.raw);
  const nextRaw: Record<string, unknown> = {
    ...existingRaw,
    payload: input.payload ?? {},
    txHash: input.txHash ?? null,
    reconciledAt: new Date().toISOString(),
  };

  const { data: tx, error } = await supabaseAdmin
    .from("circle_transactions")
    .update({
      status: normalizedStatus,
      raw: nextRaw as unknown as Json,
    })
    .eq("id", existingTx.id)
    .select("*")
    .single();
  if (error) throw error;

  const callId = typeof nextRaw.callId === "string" ? nextRaw.callId : null;
  if (normalizedStatus !== "confirmed" || !callId || !tx.user_id) return;

  const { data: call, error: callError } = await supabaseAdmin
    .from("earnings_calls")
    .select("id, price_usdc, is_free_preview")
    .eq("id", callId)
    .single();
  if (callError) throw callError;

  const price = earningsCallPrice(call);
  const { error: unlockError } = await supabaseAdmin.from("call_unlocks").upsert(
    {
      call_id: call.id,
      user_id: tx.user_id,
      amount_paid_usdc: price,
      tx_hash: input.txHash ?? null,
    },
    { onConflict: "user_id,call_id" },
  );
  if (unlockError) throw unlockError;
}
