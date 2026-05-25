import { z } from "zod";

export type EarningsCallPredictionContext = {
  question: string;
  probability: number;
  confidence: number;
  status: string;
  outcome?: "correct" | "wrong" | null;
  reasoning?: string | null;
};

export type EarningsCallAgentContext = {
  name: string;
  strategy: string;
  description?: string | null;
  reputation?: number | null;
  brierScore?: number | null;
  stakedUsdc?: number | null;
  delegatedUsdc?: number | null;
  recentPredictions: EarningsCallPredictionContext[];
};

export type GeneratedEarningsCall = {
  durationSeconds: number;
  transcript: string;
  pnlSummary: string;
  biggestWin: string;
  biggestLoss: string;
  tomorrowThesis: string;
};

const generatedCallSchema = z.object({
  durationSeconds: z.number().int().min(60).max(900).default(240),
  transcript: z.string().min(400).max(50_000),
  pnlSummary: z.string().min(20).max(1000),
  biggestWin: z.string().min(2).max(1000),
  biggestLoss: z.string().min(2).max(1000),
  tomorrowThesis: z.string().min(20).max(1500),
});

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function getEarningsCallModelConfig() {
  const apiKey = env("SENTRA_CALLS_API_KEY") ?? env("FREEMODEL_API_KEY") ?? env("OPENAI_API_KEY");
  const baseUrl =
    env("SENTRA_CALLS_API_BASE_URL") ??
    env("FREEMODEL_BASE_URL") ??
    env("OPENAI_BASE_URL") ??
    "https://api.openai.com/v1";
  const model =
    env("SENTRA_CALLS_MODEL") ?? env("FREEMODEL_MODEL") ?? env("OPENAI_MODEL") ?? "gpt-5.5";

  if (!apiKey) {
    throw new Error("SENTRA_CALLS_API_KEY, FREEMODEL_API_KEY, or OPENAI_API_KEY is required");
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function promptForCall(agent: EarningsCallAgentContext, callDate: string) {
  return [
    "You are writing a paid SENTRA earnings call for an autonomous market agent.",
    "Use only the supplied data. Do not invent trades, PnL, wins, losses, delegations, or resolved outcomes.",
    "If no resolved trading or prediction data exists, say that clearly and focus the call on risk posture, open thesis, and what evidence would change the agent's view.",
    "The transcript must sound like a professional investment research call: direct, concrete, risk-aware, and worth a paid 0.01 USDC unlock.",
    "Return strict JSON with these exact fields: durationSeconds, transcript, pnlSummary, biggestWin, biggestLoss, tomorrowThesis.",
    "",
    `Call date: ${callDate}`,
    `Agent: ${agent.name}`,
    `Strategy: ${agent.strategy}`,
    `Description: ${agent.description || "No description published."}`,
    `Reputation: ${agent.reputation ?? "unscored"}`,
    `Brier score: ${agent.brierScore ?? "unscored"}`,
    `Staked USDC: ${agent.stakedUsdc ?? 0}`,
    `Delegated USDC: ${agent.delegatedUsdc ?? 0}`,
    `Recent predictions: ${JSON.stringify(agent.recentPredictions)}`,
  ].join("\n");
}

export async function generateProfessionalEarningsCall(
  agent: EarningsCallAgentContext,
  callDate: string,
): Promise<GeneratedEarningsCall> {
  const config = getEarningsCallModelConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate compliant, data-grounded financial research narration for an Arc Testnet reputation protocol. Never fabricate performance.",
        },
        { role: "user", content: promptForCall(agent, callDate) },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Earnings call API failed (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Earnings call API returned no content");

  const parsed = JSON.parse(stripJsonFence(content));
  return generatedCallSchema.parse(parsed);
}
