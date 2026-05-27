import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { parseUnits, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { Copy, Check, ArrowRight, Lock, CalendarClock } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  getAgent,
  getAgentCalls,
  getAgentPredictions,
  loadSentraDataset,
  type SentraDataset,
} from "@/lib/sentraData";
import { createDelegationIntentAction, scheduleMarketAction } from "@/lib/sentraActions";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { ReputationRing } from "@/components/sentra/ReputationRing";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { BrierBadge } from "@/components/sentra/BrierBadge";
import { Waveform } from "@/components/sentra/Waveform";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";
import { walletSessionHeaders } from "@/lib/walletSession";
import {
  erc20ApprovalAbi,
  sentraDelegationVaultAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";
import { paidCallPriceLabel } from "@/lib/sentraConstants";

export const Route = createFileRoute("/agent/$id")({
  loader: async ({ params }) => {
    const dataset = await loadSentraDataset();
    const a = getAgent(dataset, params.id);
    if (!a) throw notFound();
    return { agentName: a.name, dataset };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.agentName ?? "Agent"} — SENTRA` }],
  }),
  component: AgentPage,
});

function AgentPage() {
  const { id } = Route.useParams();
  const { dataset } = Route.useLoaderData() as { agentName: string; dataset: SentraDataset };
  const agent = getAgent(dataset, id)!;
  const preds = getAgentPredictions(dataset, id);
  const calls = getAgentCalls(dataset, id);
  const toast = useToast();
  const wallet = useWallet();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<"overview" | "predictions" | "history" | "calls">("overview");
  const [range, setRange] = useState<"30" | "90" | "all">("30");
  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [delegateAmt, setDelegateAmt] = useState(50);
  const [delegateBusy, setDelegateBusy] = useState<"approve" | "delegate" | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [marketId, setMarketId] = useState("arc-activity-7d");
  const [marketQuestion, setMarketQuestion] = useState(
    "Will Arc testnet transaction activity expand over the next seven days?",
  );
  const [scheduledFor, setScheduledFor] = useState(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return date.toISOString().slice(0, 16);
  });
  const [scheduledProbability, setScheduledProbability] = useState(62);
  const [scheduledConfidence, setScheduledConfidence] = useState(70);

  useEffect(() => {
    const f = JSON.parse(localStorage.getItem("sentra_follows") || "[]");
    setFollowed(f.includes(id));
  }, [id]);

  const toggleFollow = () => {
    const f: string[] = JSON.parse(localStorage.getItem("sentra_follows") || "[]");
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    localStorage.setItem("sentra_follows", JSON.stringify(next));
    setFollowed(next.includes(id));
    toast.push(next.includes(id) ? `Following ${agent.name}` : `Unfollowed ${agent.name}`);
  };

  const copy = () => {
    navigator.clipboard.writeText(agent.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const chartData = useMemo(() => {
    const n = range === "30" ? 30 : range === "90" ? 30 : 30;
    return agent.pnlHistory.slice(-n);
  }, [agent, range]);

  const resolvedCount = agent.resolvedPredictions;
  const acc = resolvedCount ? Math.round((agent.correctPredictions / resolvedCount) * 100) : null;
  const avgConfidence = preds.length
    ? Math.round(preds.reduce((sum, prediction) => sum + prediction.confidence, 0) / preds.length)
    : null;
  const donutData = [
    { name: "Correct", value: agent.correctPredictions, color: "#10B981" },
    { name: "Wrong", value: resolvedCount - agent.correctPredictions, color: "#EF4444" },
  ];

  const similar = dataset.agents
    .filter((a) => a.strategy === agent.strategy && a.id !== agent.id)
    .slice(0, 2);
  const capLeft = Math.max(0, agent.delegationCap - agent.delegationFilled);
  const delegateMax = Math.max(1, Math.min(500, capLeft));
  const delegate = async () => {
    const authHeaders = walletSessionHeaders(wallet.address);
    if (!wallet.connected) {
      toast.push("Sign in with a wallet before delegating");
      return;
    }
    if (!authHeaders) {
      toast.push("Open Sign in and sign the wallet message before delegating");
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then confirm the delegation");
      return;
    }
    if (!agent.registryAgentId) {
      toast.push("This agent is missing its on-chain registry id");
      return;
    }
    if (!sentraProtocolContracts.delegationVault) {
      toast.push("Delegation vault address is not configured");
      return;
    }
    try {
      const amountUsdc = Math.min(delegateAmt, delegateMax);
      const vault = sentraProtocolContracts.delegationVault as Address;
      const amountUnits = parseUnits(amountUsdc.toFixed(6), 6);

      setDelegateBusy("approve");
      const approvalHash = await writeContractAsync({
        address: sentraProtocolContracts.usdc as Address,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [vault, amountUnits],
      });
      toast.push("USDC approval submitted");
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      setDelegateBusy("delegate");
      const delegateHash = await writeContractAsync({
        address: vault,
        abi: sentraDelegationVaultAbi,
        functionName: "delegate",
        args: [agent.registryAgentId, amountUnits],
      });
      toast.push("Delegation transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: delegateHash });

      await createDelegationIntentAction({
        data: {
          agentId: agent.databaseId,
          amountUsdc,
          delegatorAddress: wallet.address ?? undefined,
          txHash: delegateHash,
        },
        headers: authHeaders,
      });
      toast.push(`Delegated ${amountUsdc} USDC to ${agent.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delegation failed";
      toast.push(message);
    } finally {
      setDelegateBusy(null);
    }
  };

  const scheduleMarket = async () => {
    const authHeaders = walletSessionHeaders(wallet.address);
    if (!wallet.connected) {
      toast.push("Sign in with a wallet before scheduling this agent");
      return;
    }
    if (!authHeaders) {
      toast.push("Open Sign in and sign the wallet message before scheduling");
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then schedule the agent");
      return;
    }
    try {
      setScheduleBusy(true);
      await scheduleMarketAction({
        data: {
          agentId: agent.databaseId,
          marketId,
          marketQuestion,
          scheduledFor: new Date(scheduledFor).toISOString(),
          probabilityBps: Math.round(scheduledProbability * 100),
          confidenceBps: Math.round(scheduledConfidence * 100),
        },
        headers: authHeaders,
      });
      toast.push(`${agent.name} scheduled`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Schedule failed");
    } finally {
      setScheduleBusy(false);
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto grid lg:grid-cols-[1.85fr_1fr] gap-6">
      {/* LEFT */}
      <div>
        <div className="sentra-card p-6">
          <div className="flex flex-col md:flex-row gap-5 items-start">
            <AgentAvatar
              name={agent.name}
              color={agent.color}
              imageUrl={agent.imageUrl}
              size={84}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-mono text-2xl md:text-3xl">{agent.name}</h1>
                <StrategyChip strategy={agent.strategy} />
              </div>
              <div className="text-sm text-muted-foreground mt-1">Since {agent.createdAt}</div>
              <button
                onClick={copy}
                className="mt-3 inline-flex items-center gap-2 text-xs font-mono px-2 py-1 rounded bg-elevated hover:bg-primary/10 transition"
              >
                {agent.walletAddress.slice(0, 10)}…{agent.walletAddress.slice(-6)}
                {copied ? <Check size={12} className="text-[#10B981]" /> : <Copy size={12} />}
              </button>
              <button
                onClick={toggleFollow}
                className={`ml-2 mt-3 inline-flex items-center gap-2 px-3 py-1 rounded text-xs transition ${followed ? "bg-primary text-primary-foreground" : "border border-primary text-primary-light hover:bg-primary/10"}`}
              >
                {followed ? "Following" : "Follow"} · {agent.followers + (followed ? 1 : 0)}
              </button>
            </div>
            <ReputationRing value={agent.reputation} size={100} stroke={6} />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-border">
          {[
            ["overview", "Overview"],
            ["predictions", "Predictions"],
            ["history", "History"],
            ["calls", "Earnings Calls"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k as "overview" | "predictions" | "history" | "calls")}
              className={`px-4 py-2.5 text-sm border-b-2 transition -mb-px ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-6 space-y-6">
            <div className="sentra-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-mono">PnL Performance</h3>
                <div className="flex gap-1 text-xs">
                  {(["30", "90", "all"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-2.5 py-1 rounded ${range === r ? "bg-primary/20 text-primary-light" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {r === "all" ? "All" : r + "d"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" hide />
                    <Tooltip
                      contentStyle={{
                        background: "#1A0F3C",
                        border: "1px solid #2D1B6B",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#A78BFA"
                      strokeWidth={2}
                      fill="url(#pf)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid md:grid-cols-[1fr_1.4fr] gap-6">
              <div className="sentra-card p-6">
                <h3 className="font-mono mb-3">Accuracy</h3>
                <div className="h-44 relative">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        innerRadius={50}
                        outerRadius={70}
                        stroke="none"
                      >
                        {donutData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="font-mono text-2xl">{acc === null ? "-" : `${acc}%`}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {resolvedCount ? "correct" : "unscored"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="sentra-card p-6">
                <h3 className="font-mono mb-2">Strategy</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
              </div>
            </div>
          </div>
        )}

        {tab === "predictions" && (
          <div className="mt-6 sentra-card overflow-hidden">
            <div className="grid grid-cols-[2fr_80px_80px_90px_90px_120px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <div>Market</div>
              <div>My Prob</div>
              <div>Market</div>
              <div>Div</div>
              <div>Expiry</div>
              <div>Confidence</div>
            </div>
            {preds
              .filter((p) => p.status === "active")
              .map((p) => {
                const div = p.agentProb - p.marketProb;
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[2fr_80px_80px_90px_90px_120px] gap-3 px-5 py-3 text-sm border-b border-border last:border-0 row-glow"
                  >
                    <div className="truncate">{p.question}</div>
                    <div className="font-mono">{p.agentProb}%</div>
                    <div className="font-mono text-muted-foreground">{p.marketProb}%</div>
                    <div className={`font-mono ${div >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                      {div > 0 ? "+" : ""}
                      {div}%
                    </div>
                    <div className="text-xs text-muted-foreground">{p.expiresAt}</div>
                    <div>
                      <div className="h-1.5 bg-elevated rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${p.confidence}%` }} />
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        {p.confidence}%
                      </div>
                    </div>
                  </div>
                );
              })}
            {preds.filter((p) => p.status === "active").length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No active predictions.
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="mt-6 sentra-card overflow-hidden">
            {preds
              .filter((p) => p.status === "resolved")
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0 row-glow text-sm"
                >
                  {p.outcome === "correct" ? (
                    <span className="w-6 h-6 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center">
                      <Check size={14} />
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center">
                      ✕
                    </span>
                  )}
                  <div className="flex-1 truncate">{p.question}</div>
                  <span className="font-mono text-xs text-muted-foreground">{p.agentProb}%</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${p.outcome === "correct" ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#EF4444]/15 text-[#EF4444]"}`}
                  >
                    {p.outcome}
                  </span>
                </div>
              ))}
            {preds.filter((p) => p.status === "resolved").length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No resolved prediction history yet.
              </div>
            )}
          </div>
        )}

        {tab === "calls" && (
          <div className="mt-6 space-y-3">
            {calls.map((c) => (
              <Link
                key={c.id}
                to="/calls/$id"
                params={{ id: c.id }}
                className="sentra-card p-4 flex items-center gap-4 hover:border-primary transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm">{c.date}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.floor(c.durationSeconds / 60)}:
                    {String(c.durationSeconds % 60).padStart(2, "0")}
                  </div>
                </div>
                <div className="flex-1 min-w-0 hidden md:block">
                  <Waveform bars={32} height={28} />
                </div>
                <div className="text-xs font-mono inline-flex items-center gap-1 text-gold">
                  {c.isFreePreview ? (
                    "Free preview"
                  ) : (
                    <>
                      <Lock size={11} /> {paidCallPriceLabel()}
                    </>
                  )}
                </div>
              </Link>
            ))}
            {calls.length === 0 && (
              <div className="sentra-card p-8 text-center text-sm text-muted-foreground">
                No earnings calls have been published yet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div className="space-y-5 lg:sticky lg:top-[72px] lg:self-start">
        <div className="sentra-card p-5">
          <h3 className="font-mono text-sm mb-4 text-muted-foreground tracking-widest">STATS</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Stat label="Brier">
              {resolvedCount ? <BrierBadge value={agent.brierScore} /> : "-"}
            </Stat>
            <Stat label="Sharpe">{agent.sharpeRatio ? agent.sharpeRatio.toFixed(2) : "-"}</Stat>
            <Stat label="Win Rate">
              {resolvedCount ? `${Math.round(agent.winRate * 100)}%` : "-"}
            </Stat>
            <Stat label="Avg Conf.">{avgConfidence === null ? "-" : `${avgConfidence}%`}</Stat>
            <Stat label="Total Preds">{agent.totalPredictions}</Stat>
            <Stat label="Resolved">{agent.resolvedPredictions}</Stat>
            <Stat label="Staked">{agent.stakedAmount ? `$${agent.stakedAmount}` : "-"}</Stat>
            <Stat label="Delegated">
              {agent.delegationFilled ? `$${agent.delegationFilled.toLocaleString()}` : "-"}
            </Stat>
          </div>
        </div>

        <div className="sentra-card bracket p-5">
          <h3 className="font-mono text-sm mb-3 text-muted-foreground tracking-widest">DELEGATE</h3>
          <div className="text-xs text-muted-foreground">Available cap remaining</div>
          <div className="font-mono text-lg">${capLeft.toLocaleString()}</div>
          <input
            type="range"
            min={1}
            max={delegateMax}
            value={Math.min(delegateAmt, delegateMax)}
            onChange={(e) => setDelegateAmt(Number(e.target.value))}
            className="w-full mt-4 accent-[#7C3AED]"
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={delegateAmt}
              onChange={(e) => setDelegateAmt(Number(e.target.value))}
              className="w-24 bg-elevated px-2 py-1 rounded text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">USDC</span>
          </div>
          {!wallet.connected && capLeft > 0 ? (
            <Link
              to="/login"
              className="block text-center w-full mt-4 px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] transition text-sm font-medium"
            >
              Wallet sign-in to delegate
            </Link>
          ) : (
            <button
              onClick={delegate}
              disabled={capLeft <= 0 || delegateBusy !== null}
              className="w-full mt-4 px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium"
            >
              {capLeft <= 0
                ? "Cap Full"
                : delegateBusy === "approve"
                  ? "Approving USDC..."
                  : delegateBusy === "delegate"
                    ? "Delegating..."
                    : "Delegate"}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            24h lock period. Returns are not guaranteed. Stake may be slashed if reputation falls
            below 20/100.
          </p>
        </div>

        <div className="sentra-card p-5">
          <h3 className="font-mono text-sm mb-3 text-muted-foreground tracking-widest">
            LATEST CALL
          </h3>
          <div className="text-xs text-muted-foreground mb-2">{calls[0]?.date}</div>
          {calls[0] ? (
            <>
              <Waveform bars={36} height={32} />
              <Link
                to="/calls/$id"
                params={{ id: calls[0].id }}
                className="w-full mt-3 px-3 py-2 rounded-md border border-primary text-primary-light hover:bg-primary/10 text-xs inline-flex items-center justify-center gap-2"
              >
                <Lock size={12} /> Unlock — {calls[0].subscriptionCost.toFixed(2)} USDC
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No call available.</p>
          )}
        </div>

        <div className="sentra-card p-5">
          <h3 className="font-mono text-sm mb-3 text-muted-foreground tracking-widest flex items-center gap-2">
            <CalendarClock size={14} className="text-primary-light" /> SCHEDULE PREDICTION
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Queue a future prediction job for this agent. The runtime stores the schedule now; the
            signed prediction still has to be submitted to the prediction registry when the job is
            due.
          </p>
          <div className="space-y-3">
            <input
              value={marketId}
              onChange={(event) => setMarketId(event.target.value)}
              className="w-full bg-elevated px-3 py-2 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={marketQuestion}
              onChange={(event) => setMarketQuestion(event.target.value)}
              rows={3}
              className="w-full bg-elevated px-3 py-2 rounded text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              className="w-full bg-elevated px-3 py-2 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>
                <span className="text-muted-foreground">Probability</span>
                <input
                  type="number"
                  value={scheduledProbability}
                  min={0}
                  max={100}
                  onChange={(event) => setScheduledProbability(Number(event.target.value))}
                  className="mt-1 w-full bg-elevated px-2 py-1.5 rounded font-mono outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label>
                <span className="text-muted-foreground">Confidence</span>
                <input
                  type="number"
                  value={scheduledConfidence}
                  min={0}
                  max={100}
                  onChange={(event) => setScheduledConfidence(Number(event.target.value))}
                  className="mt-1 w-full bg-elevated px-2 py-1.5 rounded font-mono outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
            <button
              onClick={scheduleMarket}
              disabled={scheduleBusy}
              className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-50 text-xs font-medium"
            >
              {scheduleBusy ? "Scheduling..." : "Queue Prediction"}
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-mono text-sm mb-3 text-muted-foreground tracking-widest">
            AGENTS YOU MAY LIKE
          </h3>
          <div className="space-y-2">
            {similar.map((a) => (
              <Link
                key={a.id}
                to="/agent/$id"
                params={{ id: a.id }}
                className="sentra-card p-3 flex items-center gap-3 hover:border-primary transition"
              >
                <AgentAvatar name={a.name} color={a.color} imageUrl={a.imageUrl} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Rep {a.reputation} · Brier {a.brierScore.toFixed(2)}
                  </div>
                </div>
                <ArrowRight size={14} className="text-muted-foreground" />
              </Link>
            ))}
            {similar.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No peer agents in this strategy yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "green" | "red";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`font-mono mt-1 ${tone === "green" ? "text-[#10B981]" : tone === "red" ? "text-[#EF4444]" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
