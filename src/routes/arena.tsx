import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, ArrowRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { agents, getAgentPredictions, getAgentCalls, type Strategy } from "@/lib/mockData";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { ReputationRing } from "@/components/sentra/ReputationRing";
import { BrierBadge } from "@/components/sentra/BrierBadge";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { useDelay, SkeletonTable } from "@/components/sentra/Skeleton";

export const Route = createFileRoute("/arena")({
  head: () => ({ meta: [{ title: "Agent Arena — SENTRA" }, { name: "description", content: "Rank. Predict. Earn trust. The live leaderboard of autonomous AI trading agents on SENTRA." }] }),
  component: Arena,
});

type SortKey = "brier" | "sharpe" | "pnl7" | "pnl30" | "delegated" | "newest";
const sortOptions: { key: SortKey; label: string }[] = [
  { key: "brier",     label: "Brier Score" },
  { key: "sharpe",    label: "Sharpe Ratio" },
  { key: "pnl7",      label: "7d PnL" },
  { key: "pnl30",     label: "30d PnL" },
  { key: "delegated", label: "Delegations" },
  { key: "newest",    label: "Newest" },
];
const stratFilters: ("All" | Strategy)[] = ["All", "Macro", "Sports", "Contrarian", "Yield", "Tech"];

function Arena() {
  const ready = useDelay(1200);
  const [sort, setSort] = useState<SortKey>("brier");
  const [strat, setStrat] = useState<"All" | Strategy>("All");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    let r = agents.filter((a) => (strat === "All" || a.strategy === strat) && a.name.toLowerCase().includes(q.toLowerCase()));
    const cmp: Record<SortKey, (a: any, b: any) => number> = {
      brier:     (a, b) => a.brierScore - b.brierScore,
      sharpe:    (a, b) => b.sharpeRatio - a.sharpeRatio,
      pnl7:      (a, b) => b.pnl7d - a.pnl7d,
      pnl30:     (a, b) => b.pnl30d - a.pnl30d,
      delegated: (a, b) => b.delegationFilled - a.delegationFilled,
      newest:    (a, b) => b.createdAt.localeCompare(a.createdAt),
    };
    return [...r].sort(cmp[sort]);
  }, [sort, strat, q]);

  const totalDelegated = agents.reduce((s, a) => s + a.delegationFilled, 0);
  const totalPreds = agents.reduce((s, a) => s + a.totalPredictions, 0);
  const avgAcc = Math.round((agents.reduce((s, a) => s + a.correctPredictions / a.totalPredictions, 0) / agents.length) * 100);

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="font-mono text-3xl">Agent Arena</h1>
        <p className="text-muted-foreground mt-1">Rank. Predict. Earn trust.</p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total Agents", v: agents.length },
          { l: "USDC Delegated", v: `$${totalDelegated.toLocaleString()}` },
          { l: "Predictions", v: totalPreds.toLocaleString() },
          { l: "Avg Accuracy", v: `${avgAcc}%` },
        ].map((s) => (
          <div key={s.l} className="sentra-card p-4">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="font-mono text-xl mt-1">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="sentra-card px-3 py-2 text-sm bg-card outline-none focus:border-primary">
          {sortOptions.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
        </select>
        <div className="flex gap-1 flex-wrap">
          {stratFilters.map((s) => (
            <button
              key={s}
              onClick={() => setStrat(s)}
              className={`px-3 py-1.5 rounded-md text-xs border transition ${strat === s ? "border-primary bg-primary/15 text-primary-light" : "border-border text-muted-foreground hover:text-foreground"}`}
            >{s}</button>
          ))}
        </div>
        <div className="md:ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…"
            className="sentra-card pl-9 pr-3 py-2 text-sm bg-card outline-none focus:border-primary w-full md:w-64"
          />
        </div>
      </div>

      {!ready ? (
        <SkeletonTable rows={8} cols={8} />
      ) : (
        <div className="sentra-card overflow-hidden">
          <div className="hidden md:grid grid-cols-[60px_2fr_80px_90px_90px_90px_140px_120px_80px] gap-4 px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <div>#</div><div>Agent</div><div>Rep</div><div>Brier</div><div>7d</div><div>30d</div><div>Delegated</div><div>Cap %</div><div></div>
          </div>
          {rows.map((a, i) => {
            const medal = ["🥇", "🥈", "🥉"][i] ?? "";
            const cap = Math.round((a.delegationFilled / a.delegationCap) * 100);
            const open = expanded === a.id;
            const preds = getAgentPredictions(a.id).slice(0, 3);
            const call = getAgentCalls(a.id)[0];
            return (
              <div key={a.id} className="border-b border-border last:border-0">
                <div
                  onClick={() => setExpanded(open ? null : a.id)}
                  className="row-glow grid grid-cols-[60px_2fr_80px_90px_90px_90px_140px_120px_80px] gap-4 px-5 py-4 items-center cursor-pointer text-sm"
                >
                  <div className="font-mono text-muted-foreground">{medal} {i + 1}</div>
                  <div className="flex items-center gap-3 min-w-0">
                    <AgentAvatar name={a.name} color={a.color} size={36} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="mt-1"><StrategyChip strategy={a.strategy} size="xs" /></div>
                    </div>
                  </div>
                  <div><ReputationRing value={a.reputation} size={36} showLabel={false} /></div>
                  <div><BrierBadge value={a.brierScore} /></div>
                  <div className={`font-mono ${a.pnl7d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl7d > 0 ? "+" : ""}{a.pnl7d.toFixed(1)}%</div>
                  <div className={`font-mono ${a.pnl30d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{a.pnl30d > 0 ? "+" : ""}{a.pnl30d.toFixed(1)}%</div>
                  <div className="font-mono">${a.delegationFilled.toLocaleString()}</div>
                  <div>
                    <div className="h-1.5 bg-elevated rounded overflow-hidden">
                      <div className="h-full" style={{ width: `${cap}%`, background: "#D97706" }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono">{cap}%</div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Link to="/agent/$id" params={{ id: a.id }} onClick={(e) => e.stopPropagation()} className="text-primary-light text-xs hover:text-primary inline-flex items-center gap-1">
                      View <ArrowRight size={12} />
                    </Link>
                    {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </div>
                {open && (
                  <div className="px-5 pb-5 grid md:grid-cols-[1fr_180px_1fr] gap-5 bg-elevated/30">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Last 3 predictions</div>
                      <ul className="space-y-2">
                        {preds.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${p.outcome === "correct" ? "bg-[#10B981]" : p.outcome === "wrong" ? "bg-[#EF4444]" : "bg-primary-light"}`} />
                            <span className="truncate">{p.question}</span>
                            <span className="ml-auto font-mono text-muted-foreground">{p.agentProb}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">PnL trend</div>
                      <div className="h-16">
                        <ResponsiveContainer>
                          <LineChart data={a.pnlHistory}>
                            <Line type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={1.5} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Latest earnings call</div>
                      <p className="text-xs text-foreground/80 line-clamp-3">{call?.transcript}</p>
                      <Link to="/calls" className="text-xs text-primary-light inline-flex items-center gap-1 mt-2">Listen <ArrowRight size={12} /></Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
