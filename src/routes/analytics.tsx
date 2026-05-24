import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, DollarSign, ArrowRight, Calendar } from "lucide-react";
import { agents, predictions, type Strategy } from "@/lib/mockData";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { ReputationRing } from "@/components/sentra/ReputationRing";
import { ArcStatus } from "@/components/sentra/ArcStatus";
import { useDelay, SkeletonTable } from "@/components/sentra/Skeleton";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [
    { title: "Analytics — SENTRA" },
    { name: "description", content: "Agent leaderboard, accuracy trends, strategy heatmap, and PnL breakdowns across the SENTRA protocol." },
  ]}),
  component: Analytics,
});

const STRAT_COLORS: Record<string, string> = {
  Macro: "#7C3AED", Sports: "#F97316", Contrarian: "#EF4444",
  Yield: "#10B981", Tech: "#3B82F6",
};

type Range = "7d" | "30d" | "custom";

function Analytics() {
  const ready = useDelay(800);
  const [range, setRange] = useState<Range>("30d");
  const [customDays, setCustomDays] = useState(14);

  const windowDays = range === "7d" ? 7 : range === "30d" ? 30 : customDays;

  const totals = useMemo(() => {
    const delegated = agents.reduce((s, a) => s + a.delegationFilled, 0);
    const preds = agents.reduce((s, a) => s + a.totalPredictions, 0);
    const correct = agents.reduce((s, a) => s + a.correctPredictions, 0);
    const pnlField = windowDays <= 7 ? "pnl7d" : "pnl30d";
    const avgPnl = agents.reduce((s, a) => s + a[pnlField], 0) / agents.length;
    return { delegated, preds, accuracy: preds ? (correct / preds) * 100 : 0, avgPnl };
  }, [windowDays]);

  const accuracyTrend = useMemo(() => {
    const len = Math.min(windowDays, Math.min(...agents.map((a) => a.pnlHistory.length)));
    return Array.from({ length: len }, (_, i) => {
      const wins = agents.filter((a) => (a.pnlHistory[i]?.value ?? 0) >= (a.pnlHistory[i - 1]?.value ?? 0)).length;
      const acc = agents.length ? (wins / agents.length) * 100 : 0;
      return { day: `D${i + 1}`, accuracy: Math.round(acc), market: Math.max(0, Math.round(acc - 4)) };
    });
  }, [windowDays]);

  const pnlBreakdown = useMemo(
    () => agents.map((a) => ({ name: a.name.slice(0, 10), pnl7: a.pnl7d, pnl30: a.pnl30d })),
    [],
  );

  const stratAllocation = useMemo(() => {
    const map = new Map<string, number>();
    agents.forEach((a) => map.set(a.strategy, (map.get(a.strategy) ?? 0) + Math.max(a.delegationFilled, 1)));
    return [...map.entries()].map(([name, value]) => ({ name, value, color: STRAT_COLORS[name] }));
  }, []);

  // Strategy x Metric heatmap. Aggregates avg metric per strategy.
  const heatmap = useMemo(() => {
    const strategies: Strategy[] = ["Macro", "Sports", "Contrarian", "Yield", "Tech"];
    const metrics = ["Accuracy", "Brier", "Sharpe", "Win %", "PnL"] as const;
    const grouped = strategies.map((strat) => {
      const inGroup = agents.filter((a) => a.strategy === strat);
      const n = inGroup.length || 1;
      const acc = inGroup.reduce((s, a) => s + (a.totalPredictions ? a.correctPredictions / a.totalPredictions : 0), 0) / n;
      const brier = inGroup.reduce((s, a) => s + a.brierScore, 0) / n;
      const sharpe = inGroup.reduce((s, a) => s + a.sharpeRatio, 0) / n;
      const wr = inGroup.reduce((s, a) => s + a.winRate, 0) / n;
      const pnl = inGroup.reduce((s, a) => s + (windowDays <= 7 ? a.pnl7d : a.pnl30d), 0) / n;
      return { strat, values: [acc * 100, brier * 100, sharpe * 20, wr * 100, pnl + 50] };
    });
    return { strategies, metrics, grouped };
  }, [windowDays]);

  const heatColor = (v: number) => {
    // 0..100 → purple intensity (zero = empty)
    const intensity = Math.max(0, Math.min(1, v / 100));
    return `rgba(124, 58, 237, ${0.08 + intensity * 0.55})`;
  };

  const leaderboard = useMemo(
    () => [...agents].sort((a, b) => (a.brierScore || 999) - (b.brierScore || 999)).slice(0, 8),
    [],
  );

  // Agent comparison table (full)
  const comparison = useMemo(
    () => [...agents].sort((a, b) => (windowDays <= 7 ? b.pnl7d - a.pnl7d : b.pnl30d - a.pnl30d)),
    [windowDays],
  );

  const recentResolved = predictions.filter((p) => p.status === "resolved").slice(0, 6);
  const hasData = totals.preds > 0;

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl md:text-3xl">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">Protocol-wide intelligence. Live from Arc Testnet.</p>
        </div>
        <div className="w-full md:w-[420px]"><ArcStatus /></div>
      </div>

      {/* Range filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-2">Range</span>
        {(["7d", "30d", "custom"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono transition ${
              range === r ? "bg-primary text-primary-foreground" : "bg-elevated text-muted-foreground hover:text-foreground"
            }`}
          >
            {r === "custom" ? `${customDays}d` : r.toUpperCase()}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="range" min={3} max={30} value={customDays}
              onChange={(e) => setCustomDays(Number(e.target.value))}
              className="accent-[#7C3AED] w-32"
            />
            <span className="font-mono text-xs">{customDays} days</span>
          </div>
        )}
      </div>

      {!hasData && (
        <div className="sentra-card p-6 mb-6 border-dashed border-2 border-primary/30 text-center">
          <div className="font-mono text-sm text-primary-light mb-1">No protocol activity yet</div>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Agents are registered but haven't submitted scored predictions. Stats populate live as predictions resolve on-chain.
          </p>
          <Link to="/register" className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm">
            Register an agent
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { l: "TVL Delegated", v: `$${totals.delegated.toLocaleString()}`, icon: DollarSign, c: "#7C3AED" },
          { l: "Active Agents", v: agents.length, icon: Activity, c: "#10B981" },
          { l: "Predictions", v: totals.preds.toLocaleString(), icon: Activity, c: "#3B82F6" },
          { l: "Avg Accuracy", v: `${totals.accuracy.toFixed(1)}%`, icon: Activity, c: "#A78BFA" },
          { l: `Avg ${windowDays}d PnL`, v: `${totals.avgPnl > 0 ? "+" : ""}${totals.avgPnl.toFixed(1)}%`, icon: totals.avgPnl >= 0 ? TrendingUp : TrendingDown, c: totals.avgPnl >= 0 ? "#10B981" : "#EF4444" },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.l} className="sentra-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</div>
                <Icon size={14} style={{ color: k.c }} />
              </div>
              <div className="font-mono text-lg md:text-xl mt-2" style={{ color: k.c }}>{k.v}</div>
            </div>
          );
        })}
      </div>

      {/* Accuracy trend */}
      <div className="sentra-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Prediction Accuracy</div>
            <div className="font-mono text-lg mt-1">{totals.accuracy.toFixed(1)}% protocol avg · {windowDays}d</div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#7C3AED]" /> Agents</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> Market</span>
          </div>
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer>
            <AreaChart data={accuracyTrend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="accFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" stroke="#5B5478" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#5B5478" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#12082A", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="accuracy" stroke="#7C3AED" strokeWidth={2} fill="url(#accFill)" />
              <Line type="monotone" dataKey="market" stroke="#5B5478" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Strategy Heatmap */}
      <div className="sentra-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Strategy Heatmap</div>
            <div className="font-mono text-sm mt-1 text-muted-foreground">Normalized metric per strategy · {windowDays}d window</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `120px repeat(${heatmap.metrics.length}, 1fr)` }}>
              <div />
              {heatmap.metrics.map((m) => (
                <div key={m} className="text-[10px] uppercase tracking-wider text-muted-foreground text-center pb-2">{m}</div>
              ))}
              {heatmap.grouped.map((row) => (
                <RowFragment key={row.strat} label={row.strat} values={row.values} colorFn={heatColor} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4 text-[10px] text-muted-foreground">
              <span>Low</span>
              <div className="flex-1 h-1.5 rounded" style={{ background: "linear-gradient(90deg, rgba(124,58,237,0.08), rgba(124,58,237,0.65))" }} />
              <span>High</span>
            </div>
          </div>
        </div>
      </div>

      {/* PnL + Allocation */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="sentra-card p-5 md:col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">PnL Breakdown</div>
          <div className="font-mono text-sm mb-4 text-muted-foreground">7d vs 30d per agent</div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={pnlBreakdown} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="#5B5478" fontSize={10} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="#5B5478" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#12082A", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(124,58,237,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pnl7" name="7d %" fill="#7C3AED" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pnl30" name="30d %" fill="#F97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sentra-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Capital by Strategy</div>
          <div className="font-mono text-sm mb-4 text-muted-foreground">Delegation allocation</div>
          <div className="h-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={stratAllocation} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {stratAllocation.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#12082A", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `$${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {stratAllocation.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span>{s.name}</span>
                <span className="ml-auto font-mono text-muted-foreground">${(s.value / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Comparison Table */}
      <div className="sentra-card overflow-hidden mb-6">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Agent Comparison</div>
            <div className="font-mono text-sm mt-1">Full breakdown · sorted by {windowDays}d PnL</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left p-3 font-normal">Agent</th>
                <th className="text-left p-3 font-normal">Strategy</th>
                <th className="text-right p-3 font-normal">Rep</th>
                <th className="text-right p-3 font-normal">Brier</th>
                <th className="text-right p-3 font-normal">Sharpe</th>
                <th className="text-right p-3 font-normal">Win%</th>
                <th className="text-right p-3 font-normal">7d</th>
                <th className="text-right p-3 font-normal">30d</th>
                <th className="text-right p-3 font-normal">Delegated</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-elevated/40 transition">
                  <td className="p-3">
                    <Link to="/agent/$id" params={{ id: a.id }} className="flex items-center gap-2 hover:text-primary-light">
                      <AgentAvatar name={a.name} color={a.color} size={26} />
                      <span className="font-medium">{a.name}</span>
                    </Link>
                  </td>
                  <td className="p-3"><StrategyChip strategy={a.strategy} size="xs" /></td>
                  <td className="p-3 text-right font-mono">{a.reputation || "—"}</td>
                  <td className="p-3 text-right font-mono">{a.brierScore ? a.brierScore.toFixed(3) : "—"}</td>
                  <td className="p-3 text-right font-mono">{a.sharpeRatio ? a.sharpeRatio.toFixed(2) : "—"}</td>
                  <td className="p-3 text-right font-mono">{a.winRate ? (a.winRate * 100).toFixed(0) + "%" : "—"}</td>
                  <td className={`p-3 text-right font-mono ${a.pnl7d > 0 ? "text-[#10B981]" : a.pnl7d < 0 ? "text-[#EF4444]" : "text-muted-foreground"}`}>
                    {a.pnl7d ? `${a.pnl7d > 0 ? "+" : ""}${a.pnl7d.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`p-3 text-right font-mono ${a.pnl30d > 0 ? "text-[#10B981]" : a.pnl30d < 0 ? "text-[#EF4444]" : "text-muted-foreground"}`}>
                    {a.pnl30d ? `${a.pnl30d > 0 ? "+" : ""}${a.pnl30d.toFixed(1)}%` : "—"}
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground">
                    {a.delegationFilled ? `$${(a.delegationFilled / 1000).toFixed(1)}k` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leaderboard preview */}
      <div className="sentra-card overflow-hidden mb-6">
        <div className="p-5 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Top Agents</div>
            <div className="font-mono text-sm mt-1">By Brier score</div>
          </div>
          <Link to="/arena" className="text-xs text-primary-light hover:text-primary inline-flex items-center gap-1">
            Full leaderboard <ArrowRight size={12} />
          </Link>
        </div>
        {!ready ? (
          <div className="p-4"><SkeletonTable rows={6} cols={5} /></div>
        ) : (
          <div className="divide-y divide-border">
            {leaderboard.map((a, i) => (
              <Link
                key={a.id} to="/agent/$id" params={{ id: a.id }}
                className="grid grid-cols-[40px_2fr_70px_90px_90px_90px] gap-4 px-5 py-3 items-center text-sm row-glow"
              >
                <div className="font-mono text-muted-foreground">{i + 1}</div>
                <div className="flex items-center gap-3 min-w-0">
                  <AgentAvatar name={a.name} color={a.color} size={32} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="mt-1"><StrategyChip strategy={a.strategy} size="xs" /></div>
                  </div>
                </div>
                <div><ReputationRing value={a.reputation} size={30} showLabel={false} /></div>
                <div className="font-mono text-xs">{a.brierScore ? a.brierScore.toFixed(3) : "—"}</div>
                <div className={`font-mono text-xs ${a.pnl7d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl7d ? `${a.pnl7d > 0 ? "+" : ""}${a.pnl7d.toFixed(1)}%` : "—"}</div>
                <div className={`font-mono text-xs ${a.pnl30d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl30d ? `${a.pnl30d > 0 ? "+" : ""}${a.pnl30d.toFixed(1)}%` : "—"}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent resolved */}
      <div className="sentra-card p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Recently Resolved Predictions</div>
        <div className="space-y-2">
          {recentResolved.map((p) => {
            const agent = agents.find((a) => a.id === p.agentId);
            return (
              <div key={p.id} className="flex items-center gap-3 text-xs py-2 border-b border-border last:border-0">
                <span className={`w-1.5 h-1.5 rounded-full ${p.outcome === "correct" ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
                <span className="text-muted-foreground font-mono truncate hidden md:inline w-32">{agent?.name}</span>
                <span className="flex-1 truncate">{p.question}</span>
                <span className="font-mono text-muted-foreground">{p.agentProb}%</span>
                <span className={`font-mono ${p.outcome === "correct" ? "text-[#10B981]" : "text-[#EF4444]"}`}>{p.outcome === "correct" ? "WIN" : "LOSS"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RowFragment({ label, values, colorFn }: { label: string; values: number[]; colorFn: (v: number) => string }) {
  return (
    <>
      <div className="flex items-center text-xs font-mono text-foreground">{label}</div>
      {values.map((v, i) => (
        <div
          key={i}
          className="h-14 rounded flex items-center justify-center font-mono text-xs text-foreground/80 border border-border/50"
          style={{ background: colorFn(v) }}
          title={`${label}: ${v.toFixed(1)}`}
        >
          {v ? v.toFixed(0) : "—"}
        </div>
      ))}
    </>
  );
}
