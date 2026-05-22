import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { agents } from "@/lib/mockData";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { BrierBadge } from "@/components/sentra/BrierBadge";
import { StrategyChip } from "@/components/sentra/StrategyChip";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "My Portfolio — SENTRA" }] }),
  component: Portfolio,
});

const allocs = [
  { agentId: "macrohawk",   amount: 150, entry: "2026-01-04", current: 168.4 },
  { agentId: "fedwatcher",  amount: 100, entry: "2026-01-08", current: 108.7 },
  { agentId: "stableyield", amount: 80,  entry: "2026-01-10", current: 82.1 },
  { agentId: "sportsflow",  amount: 50,  entry: "2026-01-14", current: 53.2 },
];

const txs = Array.from({ length: 10 }).map((_, i) => ({
  hash: `0x${(i * 1234567).toString(16).padStart(8, "0")}${"abcdef98765"}${i}`,
  kind: i % 3 === 0 ? "withdraw" : "deposit",
  amount: 10 + i * 12,
  date: `2026-01-${String(20 - i).padStart(2, "0")}`,
}));

function portfolioSeries() {
  const out = [];
  let v = 380;
  for (let i = 0; i < 30; i++) {
    v = v * (1 + Math.sin(i * 0.6) * 0.012 + 0.004);
    out.push({ day: i + 1, value: Math.round(v * 100) / 100 });
  }
  return out;
}

function Portfolio() {
  const { connected, connect } = useWallet();
  const toast = useToast();
  const [followed, setFollowed] = useState<string[]>([]);
  useEffect(() => {
    setFollowed(JSON.parse(localStorage.getItem("sentra_follows") || "[]"));
  }, []);

  if (!connected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        <div className="sentra-card bracket p-10 text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-5">
            <Wallet size={28} className="text-primary-light" />
          </div>
          <h2 className="font-mono text-xl mb-2">Connect to view portfolio</h2>
          <button onClick={connect} className="mt-4 px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9]">Connect Wallet</button>
        </div>
      </div>
    );
  }

  const total = allocs.reduce((s, a) => s + a.current, 0);
  const cost = allocs.reduce((s, a) => s + a.amount, 0);
  const delta = total - cost;
  const followedAgents = agents.filter((a) => followed.includes(a.id));
  const series = portfolioSeries();

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1300px] mx-auto space-y-6">
      <h1 className="font-mono text-3xl">My Portfolio</h1>

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-6">
        <div className="sentra-card bracket p-6">
          <div className="text-xs text-muted-foreground">Total value</div>
          <div className="font-mono text-4xl mt-1">${total.toFixed(2)}</div>
          <div className={`mt-2 inline-flex items-center gap-1 text-sm font-mono ${delta >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
            {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {delta >= 0 ? "+" : ""}${delta.toFixed(2)} (24h)
          </div>
        </div>
        <div className="sentra-card p-6">
          <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">30-DAY PERFORMANCE</h3>
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={series}>
                <XAxis dataKey="day" hide />
                <Tooltip contentStyle={{ background: "#1A0F3C", border: "1px solid #2D1B6B", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#A78BFA" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Allocation table */}
      <div className="sentra-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-mono text-sm">Allocations</div>
        <div className="hidden md:grid grid-cols-[2fr_100px_120px_100px_100px_100px_100px] gap-3 px-5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
          <div>Agent</div><div>Amount</div><div>Entry</div><div>Current</div><div>PnL</div><div>Brier</div><div></div>
        </div>
        {allocs.map((al) => {
          const a = agents.find((x) => x.id === al.agentId)!;
          const pnl = ((al.current - al.amount) / al.amount) * 100;
          return (
            <div key={al.agentId} className="grid grid-cols-[2fr_100px_120px_100px_100px_100px_100px] gap-3 px-5 py-3 text-sm border-b border-border last:border-0 items-center row-glow">
              <Link to="/agent/$id" params={{ id: a.id }} className="flex items-center gap-3 min-w-0">
                <AgentAvatar name={a.name} color={a.color} size={32} />
                <div className="min-w-0">
                  <div className="truncate">{a.name}</div>
                  <StrategyChip strategy={a.strategy} size="xs" />
                </div>
              </Link>
              <div className="font-mono">${al.amount}</div>
              <div className="text-xs text-muted-foreground">{al.entry}</div>
              <div className="font-mono">${al.current.toFixed(2)}</div>
              <div className={`font-mono ${pnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>{pnl > 0 ? "+" : ""}{pnl.toFixed(1)}%</div>
              <div><BrierBadge value={a.brierScore} /></div>
              <button onClick={() => toast.push(`Withdrew from ${a.name}`)} className="text-xs text-muted-foreground hover:text-foreground">Withdraw</button>
            </div>
          );
        })}
      </div>

      {/* Subscriptions */}
      <div className="sentra-card p-5">
        <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">EARNINGS CALL SUBSCRIPTIONS</h3>
        {["macrohawk", "fedwatcher"].map((id) => {
          const a = agents.find((x) => x.id === id)!;
          return (
            <div key={id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <AgentAvatar name={a.name} color={a.color} size={28} />
              <div className="flex-1">
                <div className="text-sm">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">Renews 2026-02-01 · 0.05 USDC/wk</div>
              </div>
              <button onClick={() => toast.push(`Canceled ${a.name} subscription`)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          );
        })}
      </div>

      {/* Transactions */}
      <div className="sentra-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-mono text-sm">Recent transactions</div>
        {txs.map((t, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0 text-sm">
            <span className={`text-xs px-2 py-0.5 rounded ${t.kind === "deposit" ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#EF4444]/15 text-[#EF4444]"}`}>{t.kind}</span>
            <span className="font-mono text-xs text-muted-foreground">{t.hash.slice(0, 10)}…{t.hash.slice(-6)}</span>
            <span className="font-mono ml-auto">${t.amount}</span>
            <span className="text-xs text-muted-foreground">{t.date}</span>
          </div>
        ))}
      </div>

      {/* Followed */}
      {followedAgents.length > 0 && (
        <div>
          <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">FOLLOWED AGENTS</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {followedAgents.map((a) => (
              <Link key={a.id} to="/agent/$id" params={{ id: a.id }} className="sentra-card p-4 hover:border-primary transition">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} size={36} />
                  <div>
                    <div className="font-mono text-sm">{a.name}</div>
                    <StrategyChip strategy={a.strategy} size="xs" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-3">Rep {a.reputation} · 30d <span className="text-[#10B981]">+{a.pnl30d}%</span></div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
