import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, DollarSign, ArrowRight } from "lucide-react";
import { agents, predictions } from "@/lib/mockData";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { ReputationRing } from "@/components/sentra/ReputationRing";
import { ArcStatus } from "@/components/sentra/ArcStatus";
import { useDelay, SkeletonTable } from "@/components/sentra/Skeleton";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [
    { title: "Analytics — SENTRA" },
    { name: "description", content: "Agent leaderboard, accuracy trends, and 7d/30d PnL breakdowns across the SENTRA protocol." },
  ]}),
  component: Analytics,
});

const STRAT_COLORS: Record<string, string> = {
  Macro: "#7C3AED", Sports: "#F97316", Contrarian: "#EF4444",
  Yield: "#10B981", Tech: "#3B82F6",
};

function Analytics() {
  const ready = useDelay(1000);

  const totals = useMemo(() => {
    const delegated = agents.reduce((s, a) => s + a.delegationFilled, 0);
    const preds = agents.reduce((s, a) => s + a.totalPredictions, 0);
    const correct = agents.reduce((s, a) => s + a.correctPredictions, 0);
    const avgPnl7 = agents.reduce((s, a) => s + a.pnl7d, 0) / agents.length;
    const avgPnl30 = agents.reduce((s, a) => s + a.pnl30d, 0) / agents.length;
    return { delegated, preds, accuracy: (correct / preds) * 100, avgPnl7, avgPnl30 };
  }, []);

  // Build accuracy trend over 30 days by averaging agents' pnlHistory directional accuracy
  const accuracyTrend = useMemo(() => {
    const len = Math.min(...agents.map((a) => a.pnlHistory.length));
    return Array.from({ length: len }, (_, i) => {
      const wins = agents.filter((a) => (a.pnlHistory[i]?.value ?? 0) >= (a.pnlHistory[i - 1]?.value ?? 0)).length;
      const acc = (wins / agents.length) * 100;
      return { day: `D${i + 1}`, accuracy: Math.round(acc), market: Math.round(acc - 4 + Math.random() * 8) };
    });
  }, []);

  const pnlBreakdown = useMemo(
    () => agents.map((a) => ({ name: a.name.replace(/Agent$/, "").slice(0, 10), pnl7: a.pnl7d, pnl30: a.pnl30d, color: a.color })),
    [],
  );

  const stratAllocation = useMemo(() => {
    const map = new Map<string, number>();
    agents.forEach((a) => map.set(a.strategy, (map.get(a.strategy) ?? 0) + a.delegationFilled));
    return [...map.entries()].map(([name, value]) => ({ name, value, color: STRAT_COLORS[name] }));
  }, []);

  const leaderboard = useMemo(() => [...agents].sort((a, b) => a.brierScore - b.brierScore).slice(0, 8), []);

  const recentResolved = predictions.filter((p) => p.status === "resolved").slice(0, 6);

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl md:text-3xl">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">Protocol-wide intelligence. Updated live from Arc Testnet.</p>
        </div>
        <div className="w-full md:w-[420px]"><ArcStatus /></div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { l: "TVL Delegated", v: `$${totals.delegated.toLocaleString()}`, icon: DollarSign, c: "#7C3AED" },
          { l: "Active Agents", v: agents.length, icon: Activity, c: "#10B981" },
          { l: "Predictions", v: totals.preds.toLocaleString(), icon: Activity, c: "#3B82F6" },
          { l: "Avg 7d PnL", v: `${totals.avgPnl7 > 0 ? "+" : ""}${totals.avgPnl7.toFixed(1)}%`, icon: totals.avgPnl7 >= 0 ? TrendingUp : TrendingDown, c: totals.avgPnl7 >= 0 ? "#10B981" : "#EF4444" },
          { l: "Avg 30d PnL", v: `${totals.avgPnl30 > 0 ? "+" : ""}${totals.avgPnl30.toFixed(1)}%`, icon: totals.avgPnl30 >= 0 ? TrendingUp : TrendingDown, c: totals.avgPnl30 >= 0 ? "#10B981" : "#EF4444" },
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
            <div className="font-mono text-lg mt-1">{totals.accuracy.toFixed(1)}% protocol average</div>
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
              <YAxis stroke="#5B5478" fontSize={10} tickLine={false} axisLine={false} domain={[40, 90]} />
              <Tooltip contentStyle={{ background: "#12082A", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="accuracy" stroke="#7C3AED" strokeWidth={2} fill="url(#accFill)" />
              <Line type="monotone" dataKey="market" stroke="#5B5478" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
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

      {/* Leaderboard */}
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
            <div className="hidden md:grid grid-cols-[40px_2fr_70px_90px_90px_90px] gap-4 px-5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div>#</div><div>Agent</div><div>Rep</div><div>Brier</div><div>7d</div><div>30d</div>
            </div>
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
                <div className="font-mono text-xs">{a.brierScore.toFixed(3)}</div>
                <div className={`font-mono text-xs ${a.pnl7d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl7d > 0 ? "+" : ""}{a.pnl7d.toFixed(1)}%</div>
                <div className={`font-mono text-xs ${a.pnl30d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl30d > 0 ? "+" : ""}{a.pnl30d.toFixed(1)}%</div>
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
