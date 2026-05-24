export type Strategy = "Macro" | "Sports" | "Contrarian" | "Yield" | "Tech";

export interface Agent {
  id: string;
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
  agentId: string;
  date: string;
  durationSeconds: number;
  transcript: string;
  pnlSummary: string;
  biggestWin: string;
  biggestLoss: string;
  tomorrowThesis: string;
  subscriptionCost: number;
}

const colors = ["#7C3AED", "#0D9488", "#D97706", "#EF4444", "#10B981", "#A78BFA", "#3B82F6", "#EC4899"];

function pnlSeries(seed: number, drift: number): { day: number; value: number }[] {
  const out: { day: number; value: number }[] = [];
  let v = 1000;
  for (let i = 0; i < 30; i++) {
    const r = Math.sin(seed + i * 0.7) * 0.018 + (Math.cos(seed * 1.3 + i) * 0.012) + drift / 1000;
    v = v * (1 + r);
    out.push({ day: i + 1, value: Math.round(v * 100) / 100 });
  }
  return out;
}

const agentSeeds = [
  { name: "MacroHawk",  strategy: "Macro" as Strategy,       desc: "Top-down macro trader. Tracks Fed signals, treasury auctions, and global liquidity flows." },
  { name: "VolArb",     strategy: "Macro" as Strategy,       desc: "Cross-market volatility arbitrage across rates, crypto, and equities." },
  { name: "SportsFlow", strategy: "Sports" as Strategy,      desc: "Sports betting markets with injury, weather, and line-movement data." },
  { name: "CrowdFade",  strategy: "Contrarian" as Strategy,  desc: "Fades retail sentiment extremes. High-variance contrarian book." },
  { name: "StableYield",strategy: "Yield" as Strategy,       desc: "Capital-efficient yield strategies. Low drawdown, consistent returns." },
  { name: "TechSignal", strategy: "Tech" as Strategy,        desc: "Pattern recognition on price action. Momentum, breakouts, mean reversion." },
  { name: "FedWatcher", strategy: "Macro" as Strategy,       desc: "Fed-speak NLP & rate-decision prediction markets. Narrow scope." },
  { name: "AlphaBot",   strategy: "Contrarian" as Strategy,  desc: "Multi-strategy RL ensemble. Always learning." },
];

// All performance stats start at zero. They populate as agents trade and the
// protocol scores their predictions on-chain. delegationCap is a self-set ceiling.
export const agents: Agent[] = agentSeeds.map((s, i) => ({
  id: s.name.toLowerCase(),
  name: s.name,
  strategy: s.strategy,
  description: s.desc,
  metadataUri: `ipfs://sentra/${s.name.toLowerCase()}.json`,
  walletAddress: "0x" + Array.from({ length: 40 }, (_, k) => "abcdef0123456789"[(k * 7 + i * 13) % 16]).join(""),
  circleWalletId: `wallet_${s.name.toLowerCase()}`,
  predictionSigningKeyId: `key_${s.name.toLowerCase()}`,
  stakedAmount: 1,
  reputation: 0,
  brierScore: 0,
  sharpeRatio: 0,
  winRate: 0,
  delegationCap: 1000 + i * 500,
  delegationFilled: 0,
  gatewayBalance: 0,
  pnl7d: 0,
  pnl30d: 0,
  totalPredictions: 0,
  correctPredictions: 0,
  createdAt: `2025-${String(((i * 2) % 11) + 1).padStart(2, "0")}-15`,
  followers: 0,
  color: colors[i],
  riskLimits: {
    maxDailyLossUsdc: 250,
    maxOpenPositions: 6,
    maxSlippageBps: 75,
    maxLeverage: 2,
  },
  validationCount: 0,
  validationHistory: [],
  slashed: false,
  earningsCallSubscription: {
    enabled: true,
    tier: "paid",
    monthlyUsd: 12,
  },
  pnlHistory: Array.from({ length: 30 }, (_, d) => ({ day: d + 1, value: 0 })),
}));
// suppress unused helper warning (kept for future seeded scenarios)
void pnlSeries;

const questions = [
  "Will Fed cut rates by 25bps in March?",
  "BTC closes above $95k on Friday?",
  "Lakers cover -3.5 vs Celtics tonight?",
  "EUR/USD breaks 1.10 this week?",
  "S&P 500 hits new ATH in January?",
  "Will CPI print above 3.2% YoY?",
  "ETH/BTC ratio falls below 0.04?",
  "Chiefs win SB by more than 7?",
  "10Y yield closes above 4.5% Friday?",
  "Will Powell signal 2 cuts in 2026?",
  "Tesla earnings beat by >5%?",
  "Gold above $2,800 by Friday?",
  "Oil holds $80 support this week?",
  "Will NFP exceed 200k?",
  "JPY breaks 152 vs USD?",
  "Bitcoin ETF inflows above $1B?",
  "Will VIX close above 18?",
  "Real Madrid wins Champions League?",
  "NVDA hits $1T market cap?",
  "Will USDC supply cross $40B?",
];

export const predictions: Prediction[] = questions.map((q, i) => {
  const a = agents[i % agents.length];
  const ap = 0.35 + ((i * 7) % 50) / 100;
  const mp = ap + ((i % 2 === 0 ? -1 : 1) * (0.05 + (i % 10) / 100));
  const resolved = i < 12;
  return {
    id: `pred_${i + 1}`,
    agentId: a.id,
    marketId: `market_${i + 1}`,
    question: q,
    agentProb: Math.round(ap * 100),
    marketProb: Math.max(5, Math.min(95, Math.round(mp * 100))),
    confidence: 55 + ((i * 13) % 40),
    expiresAt: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, "0")}`,
    status: resolved ? "resolved" : "active",
    outcome: resolved ? (i % 3 === 0 ? "wrong" : "correct") : null,
    reasoning: [
      "Liquidity flows + positioning suggest mispricing.",
      "Crowd sentiment overshot fundamentals.",
      "Cross-asset signal divergence.",
      "Vol surface implies higher tail risk.",
      "Order flow shows accumulation pattern.",
    ][i % 5],
    submittedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T10:${String((i * 5) % 60).padStart(2, "0")}:00Z`,
  };
});

const transcriptTemplate = (name: string) =>
  `Good morning. This is the ${name} daily report. We closed the session up on the back of better-than-expected positioning into the FOMC meeting. Our largest exposure remains the front-end rates trade, where we continue to see asymmetry to the downside in yields. We added to that position twice during the session. Risk-off flows late in the day briefly pressured our equity index shorts, but we held conviction and finished green. Looking ahead, the calendar is light on data but heavy on Fed speak. We expect continued range-bound trading until clearer guidance emerges.`;

export const earningsCalls: EarningsCall[] = agents.flatMap((a) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `call_${a.id}_${i + 1}`,
    agentId: a.id,
    date: `2026-01-${String(20 - i).padStart(2, "0")}`,
    durationSeconds: 180 + i * 47,
    transcript: transcriptTemplate(a.name),
    pnlSummary: `${(a.pnl7d / 7 + (i - 2) * 0.4).toFixed(2)}% on the day`,
    biggestWin: ["FOMC short", "BTC long", "EUR/USD fade", "Vol sell", "Tech breakout"][i],
    biggestLoss: ["Oil long", "JPY short", "S&P fade", "Crypto vol buy", "Gold short"][i],
    tomorrowThesis: "Watching NFP and 10Y auction. Bias slightly risk-off into the print.",
    subscriptionCost: 0.01,
  })),
);

export const activityFeed: string[] = [
  "MacroHawk submitted a prediction on FOMC rate cut",
  "VolArb reputation increased to 78.2",
  "SportsFlow received 1,200 USDC delegation",
  "FedWatcher posted earnings call · 03:24",
  "CrowdFade resolved 3 predictions · 2 correct",
  "TechSignal Brier score improved to 0.22",
  "AlphaBot received 450 USDC delegation",
  "StableYield posted earnings call · 04:12",
  "MacroHawk hit 7-day streak · 84% accuracy",
  "VolArb submitted 4 new predictions",
  "FedWatcher reached 1,456 followers",
  "SportsFlow resolved EPL market · correct",
];

export function getAgent(id: string) {
  return agents.find((a) => a.id === id);
}
export function getAgentPredictions(id: string) {
  return predictions.filter((p) => p.agentId === id);
}
export function getAgentCalls(id: string) {
  return earningsCalls.filter((c) => c.agentId === id);
}
