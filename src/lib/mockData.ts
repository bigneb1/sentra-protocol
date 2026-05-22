export type Strategy = "Macro" | "Sports" | "Contrarian" | "Yield" | "Tech";

export interface Agent {
  id: string;
  name: string;
  strategy: Strategy;
  description: string;
  walletAddress: string;
  stakedAmount: number;
  reputation: number;
  brierScore: number;
  sharpeRatio: number;
  winRate: number;
  delegationCap: number;
  delegationFilled: number;
  pnl7d: number;
  pnl30d: number;
  totalPredictions: number;
  correctPredictions: number;
  createdAt: string;
  followers: number;
  color: string;
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
  { name: "MacroHawk",  strategy: "Macro" as Strategy,       desc: "Top-down macro trader. Tracks Fed signals, treasury auctions, and global liquidity flows. Conservative size, high conviction.", rep: 84, brier: 0.14, sharpe: 2.31, wr: 0.71, cap: 25000, fill: 22500, p7: 4.8, p30: 18.2, total: 312, corr: 221, foll: 1842 },
  { name: "VolArb",     strategy: "Macro" as Strategy,       desc: "Cross-market volatility arbitrage. Trades implied vs realized across rates, crypto, and equities.", rep: 78, brier: 0.18, sharpe: 1.92, wr: 0.66, cap: 20000, fill: 15300, p7: 2.1, p30: 11.6, total: 287, corr: 189, foll: 1104 },
  { name: "SportsFlow", strategy: "Sports" as Strategy,      desc: "NFL & EPL betting markets. Pulls injury feeds, weather data, and line movement.", rep: 72, brier: 0.21, sharpe: 1.64, wr: 0.61, cap: 15000, fill: 12100, p7: 6.2, p30: 9.8, total: 198, corr: 121, foll: 873 },
  { name: "CrowdFade",  strategy: "Contrarian" as Strategy,  desc: "Fades retail sentiment extremes. Volatile, high-variance — large swings both directions.", rep: 61, brier: 0.27, sharpe: 1.18, wr: 0.54, cap: 10000, fill: 9400,  p7: -3.4, p30: 7.2, total: 156, corr: 84, foll: 542 },
  { name: "StableYield",strategy: "Yield" as Strategy,       desc: "Capital-efficient yield strategies. Boring, consistent, low drawdown.", rep: 75, brier: 0.19, sharpe: 2.08, wr: 0.69, cap: 30000, fill: 18200, p7: 0.8, p30: 3.4, total: 421, corr: 290, foll: 1320 },
  { name: "TechSignal", strategy: "Tech" as Strategy,        desc: "Pattern recognition on price action. Momentum, breakouts, mean reversion across crypto.", rep: 69, brier: 0.22, sharpe: 1.51, wr: 0.63, cap: 18000, fill: 10800, p7: 3.6, p30: 12.1, total: 264, corr: 166, foll: 690 },
  { name: "FedWatcher", strategy: "Macro" as Strategy,       desc: "Fed speak NLP & rate-decision prediction markets. Narrow scope, high accuracy.", rep: 81, brier: 0.16, sharpe: 2.14, wr: 0.74, cap: 22000, fill: 17600, p7: 1.9, p30: 8.7, total: 142, corr: 105, foll: 1456 },
  { name: "AlphaBot",   strategy: "Contrarian" as Strategy,  desc: "Multi-strategy reinforcement-learned ensemble. Always learning, sometimes erratic.", rep: 66, brier: 0.24, sharpe: 1.36, wr: 0.58, cap: 12000, fill: 7200,  p7: -1.2, p30: 5.1, total: 209, corr: 121, foll: 612 },
];

export const agents: Agent[] = agentSeeds.map((s, i) => ({
  id: s.name.toLowerCase(),
  name: s.name,
  strategy: s.strategy,
  description: s.desc,
  walletAddress: "0x" + Array.from({ length: 40 }, (_, k) => "abcdef0123456789"[(k * 7 + i * 13) % 16]).join(""),
  stakedAmount: 1000 + i * 250,
  reputation: s.rep,
  brierScore: s.brier,
  sharpeRatio: s.sharpe,
  winRate: s.wr,
  delegationCap: s.cap,
  delegationFilled: s.fill,
  pnl7d: s.p7,
  pnl30d: s.p30,
  totalPredictions: s.total,
  correctPredictions: s.corr,
  createdAt: `2025-${String(((i * 2) % 11) + 1).padStart(2, "0")}-15`,
  followers: s.foll,
  color: colors[i],
  pnlHistory: pnlSeries(i + 1, s.p30),
}));

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
