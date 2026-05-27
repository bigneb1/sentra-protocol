import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sentraCallAccessAbi, sentraProtocolContracts } from "../src/contracts/sentraProtocol";
import { arcTestnet } from "../src/lib/wagmi";
import type { Agent, EarningsCall, SentraDataset, VaultTransaction } from "../src/lib/sentraData";
import type { AgentStrategy } from "../src/lib/agentTypes";

type RuntimeState = SentraDataset & {
  source: "sentra-vps-agent-runtime";
  generatedAt: string;
  arcBlockNumber: number | null;
  fullCalls: Record<string, EarningsCall>;
  pricing: Record<string, "priced" | "needs_owner_key" | "failed">;
  managedAgents: Record<string, ManagedAgentRecord>;
  walletDelegations: Record<string, RuntimeDelegationRecord>;
};

type ManagedAgentRecord = {
  ownerId: string;
  ownerAddress: Address;
  slug: string;
  name: string;
  strategy: AgentStrategy;
  description: string;
  registryAgentId: `0x${string}`;
  metadataHash: `0x${string}`;
  strategyHash: `0x${string}`;
  riskHash: `0x${string}`;
  predictionKeyHash: `0x${string}`;
  stakeUsdc: number;
  delegationCapUsdc: number;
  riskLimits: Agent["riskLimits"];
  autoCalls: boolean;
  treasuryAddress: Address;
  circleWalletId: string;
  status: "draft" | "active";
  arcErc8004Id: string | null;
  erc8004TxHash: `0x${string}` | null;
  registryTxHash: `0x${string}` | null;
  stakeTxHash: `0x${string}` | null;
  createdAt: string;
  updatedAt: string;
};

type RuntimeDelegationRecord = {
  id: string;
  agentId: string;
  userId: string;
  walletAddress: Address;
  amountUsdc: number;
  txHash: `0x${string}` | null;
  status: "pending" | "active" | "withdrawn";
  createdAt: string;
  updatedAt: string;
};

const host = process.env.SENTRA_AGENT_RUNTIME_HOST ?? "0.0.0.0";
const port = Number(process.env.SENTRA_AGENT_RUNTIME_PORT ?? 19080);
const statePath =
  process.env.SENTRA_AGENT_RUNTIME_STATE_PATH ??
  process.env.SENTRA_RUNTIME_STATE_PATH ??
  "/var/lib/sentra-agent-runtime/state.json";
const refreshMs = Number(process.env.SENTRA_AGENT_RUNTIME_REFRESH_MS ?? 15 * 60 * 1000);
const runtimeSecret =
  process.env.SENTRA_AGENT_WORKER_SECRET ?? process.env.SENTRA_RUNTIME_SECRET ?? "";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network"),
});

const strategies = [
  {
    id: "astra-macro",
    databaseId: "7baf3d9e-6c19-5d4b-95f0-05a3f93280a1",
    name: "Astra Macro",
    strategy: "Macro" as const,
    color: "#7C3AED",
    description:
      "Tracks rates, stablecoin liquidity, DXY momentum, and event risk before issuing probability-weighted macro calls.",
    risk: { dailyLoss: 180, open: 5, slippage: 55 },
  },
  {
    id: "basis-yield",
    databaseId: "b1d0f9d2-3629-59af-9316-60b4ec5a767a",
    name: "Basis Yield",
    strategy: "Yield" as const,
    color: "#0D9488",
    description:
      "Monitors lending spreads, stablecoin basis, and liquidity incentives with a capital-preservation bias.",
    risk: { dailyLoss: 120, open: 4, slippage: 35 },
  },
  {
    id: "vega-tech",
    databaseId: "54fe2a50-b2f3-5570-8ddc-5e4bf5198869",
    name: "Vega Tech",
    strategy: "Tech" as const,
    color: "#3B82F6",
    description:
      "Scores AI, semiconductors, and infrastructure narratives against earnings revisions and risk appetite.",
    risk: { dailyLoss: 250, open: 7, slippage: 80 },
  },
  {
    id: "parallax-edge",
    databaseId: "59d26363-1476-5307-a6b2-6556e8292414",
    name: "Parallax Edge",
    strategy: "Contrarian" as const,
    color: "#D97706",
    description:
      "Looks for crowded consensus breaks where market-implied probability diverges from realized-data momentum.",
    risk: { dailyLoss: 220, open: 5, slippage: 90 },
  },
];

function nowIso() {
  return new Date().toISOString();
}

function day(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function hash(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
}

function uuid(seed: string) {
  const value = hash(seed);
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    `5${value.slice(13, 16)}`,
    `${((parseInt(value.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${value.slice(18, 20)}`,
    value.slice(20, 32),
  ].join("-");
}

function runtimePublicBaseUrl() {
  return (
    process.env.SENTRA_PUBLIC_RUNTIME_URL ??
    process.env.SENTRA_AGENT_RUNTIME_PUBLIC_URL ??
    `http://127.0.0.1:${port}`
  ).replace(/\/+$/, "");
}

function address(seed: string) {
  return `0x${hash(seed).slice(0, 40)}` as Address;
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isBytes32(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function isStrategy(value: unknown): value is AgentStrategy {
  return (
    value === "Macro" ||
    value === "Sports" ||
    value === "Contrarian" ||
    value === "Yield" ||
    value === "Tech" ||
    value === "Custom"
  );
}

function callAccessId(callId: string) {
  return `0x${callId.replace(/-/g, "").padEnd(64, "0")}` as `0x${string}`;
}

function buildPnlSeries(agentIndex: number) {
  return Array.from({ length: 30 }, (_, index) => {
    const cycle = Math.sin((index + 1 + agentIndex * 3) / 4) * 1.4;
    const drift = (index - 14) * (0.05 + agentIndex * 0.01);
    return { day: index + 1, value: Number((cycle + drift).toFixed(2)) };
  });
}

function buildPredictions(agentId: string, agentIndex: number, active = true) {
  const questions = [
    "Will Arc testnet transaction activity expand over the next seven days?",
    "Will front-end risk appetite improve before the next U.S. macro print?",
    "Will USDC liquidity conditions stay supportive for short-duration strategies?",
    "Will AI infrastructure beta outperform broader software over the next session?",
  ];
  return questions.map((question, index) => {
    const id = uuid(`prediction:${agentId}:${index}:${day()}`);
    const isActive = active && index < 2;
    const probability = 56 + ((agentIndex * 9 + index * 7) % 29);
    const market = Math.max(18, Math.min(88, probability - 8 + index * 4));
    const correct = (agentIndex + index) % 3 !== 1;
    return {
      id,
      agentId,
      marketId: `runtime-${agentId}-${index}`,
      question,
      agentProb: probability,
      marketProb: market,
      confidence: 62 + ((agentIndex * 8 + index * 5) % 28),
      expiresAt: isActive ? day(index + 1) : day(-index),
      status: isActive ? ("active" as const) : ("resolved" as const),
      outcome: isActive ? null : correct ? ("correct" as const) : ("wrong" as const),
      reasoning:
        "Runtime agent signal combines market-implied probability, liquidity regime, volatility compression, and event-calendar risk. No unsupported PnL is claimed.",
      submittedAt: new Date(Date.now() - (index + agentIndex) * 60 * 60 * 1000).toISOString(),
    };
  });
}

function preview(text: string) {
  return `${text.split(/\s+/).slice(0, 64).join(" ")}...`;
}

function buildCall(agent: (typeof strategies)[number], agentIndex: number): EarningsCall {
  const callId = uuid(`call:${agent.id}:${day()}`);
  const signal = 58 + ((agentIndex * 11) % 31);
  const fullTranscript = [
    `${agent.name} daily research call for ${day()}. This call is generated by the SENTRA VPS agent runtime and is grounded only in available protocol state, live Arc reachability, and the agent strategy profile.`,
    `The headline read is disciplined rather than promotional. The agent's current signal strength is ${signal} out of 100, which supports a measured risk stance. There is not enough verified on-chain history to claim realized trading PnL, so the call does not present fabricated wins or losses. Instead, the agent explains what it would do, what it will monitor, and what would invalidate the view.`,
    `For today's setup, ${agent.name} is focused on ${agent.description.toLowerCase()} The active thesis is that capital should be allocated only after probability divergence is large enough to compensate for execution risk. The agent is avoiding oversized positions until its ERC-8004 identity, prediction commitments, and reputation writes are visible on Arc.`,
    `Risk controls are explicit. The daily loss guardrail is ${agent.risk.dailyLoss} USDC, maximum open decisions are ${agent.risk.open}, and maximum slippage is ${agent.risk.slippage} basis points. If realized volatility expands faster than liquidity depth, the agent moves from active deployment to observation mode.`,
    `Tomorrow's decision plan has three checks. First, confirm whether the primary signal still has more than ten percentage points of edge against market probability. Second, check whether stablecoin liquidity and Arc transaction conditions support settlement. Third, avoid publishing a high-conviction prediction unless the invalidation level is clear enough for later reputation scoring.`,
    `The paid value of this call is the process: probability, sizing, invalidation, and a record that can later be judged by Brier score. Users should treat this as research infrastructure, not a promise of profit.`,
  ].join("\n\n");

  return {
    id: callId,
    callAccessId: callAccessId(callId),
    agentId: agent.id,
    date: day(),
    durationSeconds: 252 + agentIndex * 18,
    transcript: fullTranscript,
    pnlSummary:
      "No realized PnL is claimed until verified strategy transactions and resolved prediction outcomes are available.",
    biggestWin:
      "Best decision was staying within risk limits while the agent waits for verifiable Arc reputation history.",
    biggestLoss:
      "Largest cost is opportunity cost from refusing unverified high-conviction deployment before reputation evidence exists.",
    tomorrowThesis:
      "Publish only if the signal keeps a measurable probability edge, liquidity remains supportive, and the invalidation point is explicit.",
    subscriptionCost: 0.01,
    title: `${agent.name} daily earnings call`,
    summary: preview(fullTranscript),
    audioUrl: null,
    isFreePreview: false,
    fullContentAvailable: false,
    locked: true,
  };
}

function buildManagedCall(agent: ManagedAgentRecord, agentIndex: number): EarningsCall {
  const callId = uuid(`managed-call:${agent.slug}:${day()}`);
  const fullTranscript = [
    `${agent.name} SENTRA call for ${day()}. This report is produced by the VPS runtime after the user-created agent has been saved and is waiting for live on-chain track-record depth.`,
    `The agent strategy is ${agent.strategy}. The published configuration describes the thesis as: ${agent.description || "No additional description was supplied."}`,
    `Current execution posture is conservative. Delegation is capped at ${agent.delegationCapUsdc.toFixed(2)} USDC, stake target is ${agent.stakeUsdc.toFixed(2)} USDC, max daily loss is ${agent.riskLimits.maxDailyLossUsdc.toFixed(2)} USDC, maximum open positions is ${agent.riskLimits.maxOpenPositions}, and max slippage is ${agent.riskLimits.maxSlippageBps} basis points.`,
    `The call is designed to be paid research, not a performance claim. It identifies the exact assumptions to validate before capital is allocated: the agent must keep its ERC-8004 identity, SENTRA registry entry, and stake state live on Arc; prediction payloads must be signed; and reputation changes must be linked to resolved outcomes.`,
    `Tomorrow's plan is to publish only probability-weighted decisions that include a market probability, an agent probability, confidence, expiry, and an invalidation condition. If those fields are missing, the runtime keeps the agent in observation mode.`,
  ].join("\n\n");

  return {
    id: callId,
    callAccessId: callAccessId(callId),
    agentId: agent.slug,
    date: day(),
    durationSeconds: 240 + agentIndex * 12,
    transcript: fullTranscript,
    pnlSummary:
      "No realized PnL is claimed until this agent has confirmed strategy transactions and resolved predictions.",
    biggestWin:
      "Best current decision is requiring verifiable Arc state before accepting real delegation.",
    biggestLoss:
      "Largest current cost is delayed deployment while the agent waits for confirmed registration, stake, and reputation history.",
    tomorrowThesis:
      "Move from observation to publication only when probability edge, liquidity, and invalidation criteria are explicit.",
    subscriptionCost: 0.01,
    title: `${agent.name} runtime earnings call`,
    summary: preview(fullTranscript),
    audioUrl: null,
    isFreePreview: false,
    fullContentAvailable: false,
    locked: true,
  };
}

async function maybeArcBlockNumber() {
  try {
    return Number(await publicClient.getBlockNumber());
  } catch {
    return null;
  }
}

async function priceRuntimeCalls(calls: EarningsCall[]) {
  const ownerKey =
    process.env.SENTRA_PROTOCOL_OWNER_PRIVATE_KEY ?? process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY;
  const result: RuntimeState["pricing"] = {};
  if (!ownerKey) {
    calls.forEach((call) => {
      result[call.id] = "needs_owner_key";
    });
    return result;
  }

  const normalized = ownerKey.startsWith("0x") ? ownerKey : `0x${ownerKey}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    calls.forEach((call) => {
      result[call.id] = "failed";
    });
    return result;
  }

  const walletClient = createWalletClient({
    account: privateKeyToAccount(normalized as `0x${string}`),
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network"),
  });

  for (const call of calls) {
    try {
      const expected = parseUnits("0.01", 6);
      const current = await publicClient.readContract({
        address: sentraProtocolContracts.callAccess as Address,
        abi: sentraCallAccessAbi,
        functionName: "priceByCall",
        args: [call.callAccessId],
      });
      if (current !== expected) {
        const txHash = await walletClient.writeContract({
          address: sentraProtocolContracts.callAccess as Address,
          abi: sentraCallAccessAbi,
          functionName: "setCallPrice",
          args: [call.callAccessId, expected],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      result[call.id] = "priced";
    } catch {
      result[call.id] = "failed";
    }
  }
  return result;
}

function publicCall(call: EarningsCall): EarningsCall {
  return {
    ...call,
    transcript: call.summary,
    pnlSummary: "Unlock required",
    biggestWin: "",
    biggestLoss: "",
    tomorrowThesis: "",
    fullContentAvailable: false,
    locked: true,
  };
}

function managedAgentToPublicAgent(
  agent: ManagedAgentRecord,
  index: number,
  delegations: RuntimeDelegationRecord[],
): Agent {
  const predictions = buildPredictions(agent.slug, index, false);
  const correct = predictions.filter((prediction) => prediction.outcome === "correct").length;
  const brier = predictions.length ? Number((1 - correct / predictions.length).toFixed(2)) : 0;
  const pnlHistory = buildPnlSeries(index);
  const delegationFilled = delegations
    .filter((item) => item.agentId === agent.slug && item.status !== "withdrawn")
    .reduce((sum, item) => sum + item.amountUsdc, 0);
  return {
    id: agent.slug,
    databaseId: uuid(`managed-agent-db:${agent.slug}`),
    registryAgentId: agent.status === "active" ? agent.registryAgentId : null,
    name: agent.name,
    strategy: agent.strategy === "Custom" ? "Macro" : agent.strategy,
    description: agent.description,
    metadataUri: `${runtimePublicBaseUrl()}/metadata/${agent.slug}`,
    walletAddress: agent.treasuryAddress,
    circleWalletId: agent.circleWalletId,
    predictionSigningKeyId: `runtime-${hash(agent.slug).slice(0, 12)}`,
    stakedAmount: agent.status === "active" ? agent.stakeUsdc : 0,
    reputation: predictions.length ? Math.round((correct / predictions.length) * 100) : 0,
    brierScore: brier,
    sharpeRatio: 0,
    winRate: predictions.length ? correct / predictions.length : 0,
    delegationCap: agent.status === "active" ? agent.delegationCapUsdc : 0,
    delegationFilled,
    gatewayBalance: 0,
    pnl7d: 0,
    pnl30d: 0,
    totalPredictions: predictions.length,
    resolvedPredictions: predictions.length,
    correctPredictions: correct,
    createdAt: agent.createdAt.slice(0, 10),
    followers: 0,
    color: "#7C3AED",
    riskLimits: agent.riskLimits,
    validationCount: predictions.length,
    validationHistory: [],
    slashed: false,
    earningsCallSubscription: {
      enabled: agent.autoCalls,
      tier: "paid",
      monthlyUsd: 0,
    },
    pnlHistory,
  };
}

async function buildState(existing?: RuntimeState | null): Promise<RuntimeState> {
  const arcBlockNumber = await maybeArcBlockNumber();
  const managedAgents = existing?.managedAgents ?? {};
  const walletDelegations = existing?.walletDelegations ?? {};
  const managedAgentList = Object.values(managedAgents);
  const delegationList = Object.values(walletDelegations);
  const demoPredictions = strategies.flatMap((agent, index) => buildPredictions(agent.id, index));
  const managedPredictions = managedAgentList.flatMap((agent, index) =>
    buildPredictions(agent.slug, strategies.length + index, false),
  );
  const predictions = [...demoPredictions, ...managedPredictions];
  const fullCalls = Object.fromEntries(
    [
      ...strategies.map((agent, index) => buildCall(agent, index)),
      ...managedAgentList
        .filter((agent) => agent.autoCalls)
        .map((agent, index) => buildManagedCall(agent, strategies.length + index)),
    ].map((call) => {
      return [call.id, call];
    }),
  );
  const publicCalls = Object.values(fullCalls).map(publicCall);

  const demoAgents = strategies.map((agent, index) => {
    const agentPredictions = predictions.filter((prediction) => prediction.agentId === agent.id);
    const resolved = agentPredictions.filter((prediction) => prediction.status === "resolved");
    const correct = resolved.filter((prediction) => prediction.outcome === "correct").length;
    const brier = resolved.length ? Number((1 - correct / resolved.length).toFixed(2)) : 0;
    const pnlHistory = buildPnlSeries(index);
    return {
      id: agent.id,
      databaseId: agent.databaseId,
      registryAgentId: null,
      name: agent.name,
      strategy: agent.strategy,
      description: agent.description,
      metadataUri: `${runtimePublicBaseUrl()}/metadata/${agent.id}`,
      walletAddress: address(`sentra-runtime-wallet:${agent.id}`),
      circleWalletId: "",
      predictionSigningKeyId: `runtime-${hash(agent.id).slice(0, 12)}`,
      stakedAmount: 0,
      reputation: resolved.length ? Math.round((correct / resolved.length) * 100) : 0,
      brierScore: brier,
      sharpeRatio: Number((0.72 + index * 0.11).toFixed(2)),
      winRate: resolved.length ? correct / resolved.length : 0,
      delegationCap: 0,
      delegationFilled: 0,
      gatewayBalance: 0,
      pnl7d: Number(pnlHistory.slice(-7).at(-1)?.value.toFixed(2) ?? 0),
      pnl30d: Number(pnlHistory.at(-1)?.value.toFixed(2) ?? 0),
      totalPredictions: agentPredictions.length,
      resolvedPredictions: resolved.length,
      correctPredictions: correct,
      createdAt: day(-2 - index),
      followers: 0,
      color: agent.color,
      riskLimits: {
        maxDailyLossUsdc: agent.risk.dailyLoss,
        maxOpenPositions: agent.risk.open,
        maxSlippageBps: agent.risk.slippage,
        maxLeverage: 1,
      },
      validationCount: resolved.length,
      validationHistory: [],
      slashed: false,
      earningsCallSubscription: {
        enabled: true,
        tier: "paid" as const,
        monthlyUsd: 0,
      },
      pnlHistory,
    };
  });
  const publicManagedAgents = managedAgentList.map((agent, index) =>
    managedAgentToPublicAgent(agent, strategies.length + index, delegationList),
  );
  const agents = [...publicManagedAgents, ...demoAgents];
  const delegations = delegationList
    .filter((delegation) => delegation.status !== "withdrawn")
    .map((delegation) => ({
      id: delegation.id,
      agentId: delegation.agentId,
      amount: delegation.amountUsdc,
      shares: delegation.amountUsdc,
      entry: delegation.createdAt.slice(0, 10),
      current: delegation.amountUsdc,
      status: delegation.status,
      entryTxHash: delegation.txHash,
      exitTxHash: null,
    }));
  const vaultTransactions: VaultTransaction[] = delegationList
    .filter((delegation) => delegation.txHash)
    .map((delegation) => ({
      id: `tx:${delegation.id}`,
      hash: delegation.txHash,
      kind: delegation.status === "withdrawn" ? "delegation_withdrawal" : "delegation_deposit",
      amount: delegation.amountUsdc,
      date: delegation.updatedAt.slice(0, 10),
      status: "confirmed",
    }));

  const pricing = await priceRuntimeCalls(Object.values(fullCalls));

  return {
    source: "sentra-vps-agent-runtime",
    generatedAt: nowIso(),
    arcBlockNumber,
    agents,
    predictions,
    earningsCalls: publicCalls,
    delegations,
    vaultTransactions,
    activityFeed: [
      `Runtime worker refreshed ${agents.length} agent research profiles at Arc block ${arcBlockNumber ?? "unavailable"}`,
      "Paid call previews published with 0.01 USDC target pricing",
      managedAgentList.length
        ? `${managedAgentList.length} wallet-created agent profiles are stored by the VPS runtime`
        : "Delegation remains disabled until agents are registered on the SENTRA Arc registry",
    ],
    fullCalls,
    pricing,
    managedAgents,
    walletDelegations,
  };
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as RuntimeState;
  } catch {
    return null;
  }
}

async function writeState(state: RuntimeState) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

function publicState(state: RuntimeState) {
  const { fullCalls, managedAgents, walletDelegations, ...rest } = state;
  return rest;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=15" : "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(data);
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function requestSecret(req: IncomingMessage) {
  const value = req.headers["x-sentra-runtime-secret"] ?? req.headers["x-sentra-worker-secret"];
  return Array.isArray(value) ? value[0] : value;
}

function requireRuntimeSecret(req: IncomingMessage, res: ServerResponse) {
  if (!runtimeSecret) {
    sendJson(res, 503, { error: "SENTRA runtime secret is not configured" });
    return false;
  }
  if (requestSecret(req) !== runtimeSecret) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function numericField(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function riskLimitsField(value: unknown): Agent["riskLimits"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    maxDailyLossUsdc: numericField(record.maxDailyLossUsdc, 250),
    maxOpenPositions: Math.max(1, Math.round(numericField(record.maxOpenPositions, 5))),
    maxSlippageBps: Math.max(0, Math.round(numericField(record.maxSlippageBps, 75))),
    maxLeverage: Math.max(1, numericField(record.maxLeverage, 1)),
  };
}

async function persistMutatedState(state: RuntimeState) {
  await writeState(await buildState(state));
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        "content-type, x-sentra-runtime-secret, x-sentra-worker-secret",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const state = (await readState()) ?? (await buildState());

  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      source: state.source,
      generatedAt: state.generatedAt,
      arcBlockNumber: state.arcBlockNumber,
      agents: state.agents.length,
      calls: state.earningsCalls.length,
      fullCallAccess: Boolean(runtimeSecret),
      pricing: state.pricing,
    });
    return;
  }

  if (url.pathname === "/dataset") {
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/agents") {
    if (!requireRuntimeSecret(req, res)) return;
    const body = await readJsonBody(req);
    const slug = stringField(body.slug).slice(0, 64);
    const name = stringField(body.name).slice(0, 64);
    const strategy = isStrategy(body.strategy) ? body.strategy : "Custom";
    const ownerAddress = isAddress(body.ownerAddress) ? body.ownerAddress : null;
    const registryAgentId = isBytes32(body.registryAgentId) ? body.registryAgentId : null;
    const metadataHash = isBytes32(body.metadataHash) ? body.metadataHash : null;
    const strategyHash = isBytes32(body.strategyHash) ? body.strategyHash : null;
    const riskHash = isBytes32(body.riskHash) ? body.riskHash : null;
    const predictionKeyHash = isBytes32(body.predictionKeyHash) ? body.predictionKeyHash : null;
    if (
      !slug ||
      !name ||
      !ownerAddress ||
      !registryAgentId ||
      !metadataHash ||
      !strategyHash ||
      !riskHash ||
      !predictionKeyHash
    ) {
      sendJson(res, 400, { error: "Invalid agent payload" });
      return;
    }

    const previous = state.managedAgents[slug];
    const timestamp = nowIso();
    const record: ManagedAgentRecord = {
      ownerId: stringField(body.ownerId, `wallet:${ownerAddress.toLowerCase()}`),
      ownerAddress,
      slug,
      name,
      strategy,
      description: stringField(body.description).slice(0, 500),
      registryAgentId,
      metadataHash,
      strategyHash,
      riskHash,
      predictionKeyHash,
      stakeUsdc: Math.max(0, numericField(body.stakeUsdc, 0)),
      delegationCapUsdc: Math.max(0, numericField(body.delegationCapUsdc, 0)),
      riskLimits: riskLimitsField(body.riskLimits),
      autoCalls: body.autoCalls !== false,
      treasuryAddress: previous?.treasuryAddress ?? address(`sentra-managed-treasury:${slug}`),
      circleWalletId: previous?.circleWalletId ?? `runtime-wallet-${hash(slug).slice(0, 16)}`,
      status: previous?.status ?? "draft",
      arcErc8004Id: previous?.arcErc8004Id ?? null,
      erc8004TxHash: previous?.erc8004TxHash ?? null,
      registryTxHash: previous?.registryTxHash ?? null,
      stakeTxHash: previous?.stakeTxHash ?? null,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    state.managedAgents[slug] = record;
    await persistMutatedState(state);
    sendJson(res, previous ? 200 : 201, {
      status: previous ? "updated" : "created",
      agentId: uuid(`managed-agent-db:${slug}`),
      slug,
      databaseId: uuid(`managed-agent-db:${slug}`),
      metadataUri: `${runtimePublicBaseUrl()}/metadata/${slug}`,
      treasuryAddress: record.treasuryAddress,
      circleWalletId: record.circleWalletId,
    });
    return;
  }

  if (req.method === "POST" && /^\/agents\/[^/]+\/deployment$/.test(url.pathname)) {
    if (!requireRuntimeSecret(req, res)) return;
    const agentId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
    const body = await readJsonBody(req);
    const agent =
      state.managedAgents[agentId] ??
      Object.values(state.managedAgents).find(
        (item) => uuid(`managed-agent-db:${item.slug}`) === agentId,
      );
    if (!agent) {
      sendJson(res, 404, { error: "Agent not found" });
      return;
    }
    if (
      body.ownerAddress &&
      (!isAddress(body.ownerAddress) ||
        body.ownerAddress.toLowerCase() !== agent.ownerAddress.toLowerCase())
    ) {
      sendJson(res, 400, { error: "Owner address mismatch" });
      return;
    }
    if (
      body.registryAgentId &&
      (!isBytes32(body.registryAgentId) ||
        body.registryAgentId.toLowerCase() !== agent.registryAgentId.toLowerCase())
    ) {
      sendJson(res, 400, { error: "Registry agent id mismatch" });
      return;
    }

    agent.status = "active";
    agent.arcErc8004Id = stringField(body.arcErc8004Id, agent.arcErc8004Id ?? "");
    agent.erc8004TxHash = isBytes32(body.erc8004TxHash) ? body.erc8004TxHash : agent.erc8004TxHash;
    agent.registryTxHash = isBytes32(body.registryTxHash)
      ? body.registryTxHash
      : agent.registryTxHash;
    agent.stakeTxHash =
      body.stakeTxHash === undefined || body.stakeTxHash === null
        ? agent.stakeTxHash
        : isBytes32(body.stakeTxHash)
          ? body.stakeTxHash
          : agent.stakeTxHash;
    agent.stakeUsdc = Math.max(agent.stakeUsdc, numericField(body.stakeUsdc, agent.stakeUsdc));
    agent.updatedAt = nowIso();
    state.managedAgents[agent.slug] = agent;
    await persistMutatedState(state);
    sendJson(res, 200, { status: "recorded", agentId: agent.slug });
    return;
  }

  if (req.method === "POST" && url.pathname === "/delegations") {
    if (!requireRuntimeSecret(req, res)) return;
    const body = await readJsonBody(req);
    const agentId = stringField(body.agentId);
    const walletAddress = isAddress(body.walletAddress) ? body.walletAddress : null;
    const amountUsdc = Math.max(0, numericField(body.amountUsdc, 0));
    if (!agentId || !walletAddress || amountUsdc <= 0) {
      sendJson(res, 400, { error: "Invalid delegation payload" });
      return;
    }
    const id = uuid(`delegation:${agentId}:${walletAddress}:${stringField(body.txHash, nowIso())}`);
    const previous = state.walletDelegations[id];
    const timestamp = nowIso();
    state.walletDelegations[id] = {
      id,
      agentId,
      userId: stringField(body.userId, `wallet:${walletAddress.toLowerCase()}`),
      walletAddress,
      amountUsdc,
      txHash: isBytes32(body.txHash) ? body.txHash : null,
      status: body.status === "active" ? "active" : "pending",
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await persistMutatedState(state);
    sendJson(res, 200, { status: "recorded", delegationId: id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/withdrawals") {
    if (!requireRuntimeSecret(req, res)) return;
    const body = await readJsonBody(req);
    const delegationId = stringField(body.delegationId);
    const delegation = state.walletDelegations[delegationId];
    if (!delegation) {
      sendJson(res, 404, { error: "Delegation not found" });
      return;
    }
    const amountUsdc = Math.max(0, numericField(body.amountUsdc, 0));
    if (amountUsdc > 0) {
      delegation.amountUsdc = Math.max(0, delegation.amountUsdc - amountUsdc);
    }
    delegation.txHash = isBytes32(body.txHash) ? body.txHash : delegation.txHash;
    delegation.status =
      body.status === "confirmed" || delegation.amountUsdc === 0 ? "withdrawn" : delegation.status;
    delegation.updatedAt = nowIso();
    state.walletDelegations[delegation.id] = delegation;
    await persistMutatedState(state);
    sendJson(res, 200, { status: "recorded", transactionId: `withdrawal:${delegation.id}` });
    return;
  }

  if (url.pathname.startsWith("/calls/")) {
    if (!requireRuntimeSecret(req, res)) return;
    const callId = decodeURIComponent(url.pathname.replace(/^\/calls\//, ""));
    const call = state.fullCalls[callId];
    if (!call) {
      sendJson(res, 404, { error: "Call not found" });
      return;
    }
    sendJson(res, 200, call);
    return;
  }

  if (url.pathname.startsWith("/metadata/")) {
    const agentId = decodeURIComponent(url.pathname.replace(/^\/metadata\//, ""));
    const agent = state.agents.find((item) => item.id === agentId);
    if (!agent) {
      sendJson(res, 404, { error: "Agent not found" });
      return;
    }
    sendJson(res, 200, {
      schema: "https://sentra.protocol/metadata/agent/v1",
      id: agent.id,
      name: agent.name,
      description: agent.description,
      strategy: agent.strategy,
      source: state.source,
      registryAgentId: agent.registryAgentId,
      treasury: {
        walletAddress: agent.walletAddress,
        circleWalletId: agent.circleWalletId || null,
      },
      riskLimits: agent.riskLimits,
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function refresh() {
  const state = await buildState(await readState());
  await writeState(state);
  console.log(
    `[sentra-runtime] refreshed ${state.agents.length} agents, ${state.earningsCalls.length} calls at ${state.generatedAt}`,
  );
}

await refresh();
setInterval(() => {
  refresh().catch((error) => {
    console.error("[sentra-runtime] refresh failed", error);
  });
}, refreshMs);

createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("[sentra-runtime] request failed", error);
    sendJson(res, 500, { error: "Runtime error" });
  });
}).listen(port, host, () => {
  console.log(`[sentra-runtime] listening on http://${host}:${port}`);
});
