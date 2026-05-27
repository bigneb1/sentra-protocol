import type { Database } from "@/integrations/supabase/types";
import {
  generateProfessionalEarningsCall,
  type EarningsCallPredictionContext,
} from "@/lib/earningsCallGenerator";
import { ensureCallPricedOnArc } from "@/lib/sentraActions";
import { SENTRA_PAID_CALL_PRICE_USDC } from "@/lib/sentraConstants";

type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function predictionOutcome(
  prediction: TableRow<"predictions">,
  outcomes: TableRow<"prediction_outcomes">[],
): EarningsCallPredictionContext["outcome"] {
  const outcome = outcomes.find((item) => item.prediction_id === prediction.id);
  if (!outcome) return null;
  return prediction.agent_prob >= 0.5 === outcome.outcome ? "correct" : "wrong";
}

export async function generateDailyCalls(options: { callDate?: string; force?: boolean } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const callDate = options.callDate ?? process.env.SENTRA_CALL_DATE ?? today();
  const force = options.force ?? false;
  const [
    agentsResult,
    configsResult,
    walletsResult,
    delegationsResult,
    predictionsResult,
    outcomesResult,
  ] = await Promise.all([
    supabaseAdmin.from("agents").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("agent_configs").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("agent_wallets").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("delegations").select("*").order("created_at", { ascending: false }),
    supabaseAdmin
      .from("predictions")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("prediction_outcomes")
      .select("*")
      .order("resolved_at", { ascending: false }),
  ]);

  if (agentsResult.error) throw agentsResult.error;
  if (configsResult.error) throw configsResult.error;
  if (walletsResult.error) throw walletsResult.error;
  if (delegationsResult.error) throw delegationsResult.error;
  if (predictionsResult.error) throw predictionsResult.error;
  if (outcomesResult.error) throw outcomesResult.error;

  const agents = agentsResult.data ?? [];
  const configs = configsResult.data ?? [];
  const wallets = walletsResult.data ?? [];
  const delegations = delegationsResult.data ?? [];
  const predictions = predictionsResult.data ?? [];
  const outcomes = outcomesResult.data ?? [];
  const published: { agent: string; callId: string }[] = [];
  const priced: { agent: string; callId: string; status: string }[] = [];
  const skipped: { agent: string; reason: string }[] = [];

  for (const agent of agents) {
    if (agent.status === "slashed") {
      skipped.push({ agent: agent.slug, reason: "slashed" });
      continue;
    }

    const config = configs.find((item) => item.agent_id === agent.id);
    if (config && config.earnings_call_enabled === false) {
      skipped.push({ agent: agent.slug, reason: "earnings calls disabled" });
      continue;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("earnings_calls")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("call_date", callDate)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && !force) {
      skipped.push({ agent: agent.slug, reason: "already published" });
      continue;
    }

    const wallet = wallets.find((item) => item.agent_id === agent.id);
    const delegatedUsdc = delegations
      .filter((delegation) => delegation.agent_id === agent.id && delegation.status !== "withdrawn")
      .reduce((sum, delegation) => sum + numeric(delegation.amount_usdc), 0);
    const recentPredictions = predictions
      .filter((prediction) => prediction.agent_id === agent.id)
      .slice(0, 12)
      .map((prediction) => ({
        question: prediction.question,
        probability: numeric(prediction.agent_prob),
        confidence: numeric(prediction.confidence),
        status: prediction.status,
        outcome: predictionOutcome(prediction, outcomes),
        reasoning: prediction.reasoning,
      }));

    const generated = await generateProfessionalEarningsCall(
      {
        name: agent.name,
        strategy: agent.strategy,
        description: agent.description,
        reputation: numeric(agent.reputation),
        brierScore: numeric(agent.brier_score),
        stakedUsdc: numeric(wallet?.usdc_stake),
        delegatedUsdc,
        recentPredictions,
      },
      callDate,
    );

    const row = {
      agent_id: agent.id,
      call_date: callDate,
      duration_seconds: generated.durationSeconds,
      audio_url: null,
      transcript: generated.transcript,
      pnl_summary: generated.pnlSummary,
      biggest_win: generated.biggestWin,
      biggest_loss: generated.biggestLoss,
      tomorrow_thesis: generated.tomorrowThesis,
      price_usdc: SENTRA_PAID_CALL_PRICE_USDC,
      is_free_preview: false,
    };

    const request = existing
      ? supabaseAdmin.from("earnings_calls").update(row).eq("id", existing.id)
      : supabaseAdmin.from("earnings_calls").insert(row);
    const { data: call, error } = await request.select("id").single();
    if (error) throw error;
    published.push({ agent: agent.slug, callId: call.id });

    try {
      const pricing = await ensureCallPricedOnArc(call.id, SENTRA_PAID_CALL_PRICE_USDC);
      priced.push({ agent: agent.slug, callId: call.id, status: pricing.status });
    } catch (error) {
      skipped.push({
        agent: agent.slug,
        reason: error instanceof Error ? `pricing failed: ${error.message}` : "pricing failed",
      });
    }
  }

  return { callDate, published, priced, skipped };
}
