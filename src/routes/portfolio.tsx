import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { loadSentraDataset, type SentraDataset } from "@/lib/sentraData";
import { createWithdrawalIntentAction } from "@/lib/sentraActions";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { BrierBadge } from "@/components/sentra/BrierBadge";
import { StrategyChip } from "@/components/sentra/StrategyChip";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "My Portfolio — SENTRA" }] }),
  loader: () => loadSentraDataset(),
  component: Portfolio,
});

function portfolioSeries(total: number) {
  return Array.from({ length: 30 }, (_, day) => ({
    day: day + 1,
    value: total,
  }));
}

function Portfolio() {
  const { agents, delegations: allocs, vaultTransactions: txs } = Route.useLoaderData() as SentraDataset;
  const { connected } = useWallet();
  const { session } = useAuth();
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
          <h2 className="font-mono text-xl mb-2">Wallet sign-in required</h2>
          <Link
            to="/login"
            className="mt-4 px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9]"
          >
            Wallet sign-in
          </Link>
        </div>
      </div>
    );
  }

  const total = allocs.reduce((s, a) => s + a.current, 0);
  const cost = allocs.reduce((s, a) => s + a.amount, 0);
  const delta = total - cost;
  const followedAgents = agents.filter((a) => followed.includes(a.id));
  const series = portfolioSeries(total);
  const authHeaders = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : undefined;

  const requestWithdrawal = async (delegationId: string, agentName: string, amountUsdc: number) => {
    if (!authHeaders) {
      toast.push("Sign in before creating a withdrawal intent");
      return;
    }
    try {
      await createWithdrawalIntentAction({
        data: { delegationId, amountUsdc },
        headers: authHeaders,
      });
      toast.push(`Withdrawal intent queued for ${agentName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Withdrawal intent failed";
      toast.push(message);
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1300px] mx-auto space-y-6">
      <h1 className="font-mono text-3xl">My Portfolio</h1>

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-6">
        <div className="sentra-card bracket p-6">
          <div className="text-xs text-muted-foreground">Total value</div>
          <div className="font-mono text-4xl mt-1">${total.toFixed(2)}</div>
          <div
            className={`mt-2 inline-flex items-center gap-1 text-sm font-mono ${delta >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}
          >
            {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
            {delta >= 0 ? "+" : ""}${delta.toFixed(2)} (24h)
          </div>
        </div>
        <div className="sentra-card p-6">
          <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">
            30-DAY PERFORMANCE
          </h3>
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={series}>
                <XAxis dataKey="day" hide />
                <Tooltip
                  contentStyle={{
                    background: "#1A0F3C",
                    border: "1px solid #2D1B6B",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#A78BFA"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Allocation table */}
      <div className="sentra-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-mono text-sm">Allocations</div>
        <div className="hidden md:grid grid-cols-[2fr_100px_120px_100px_100px_100px_100px] gap-3 px-5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
          <div>Agent</div>
          <div>Amount</div>
          <div>Entry</div>
          <div>Current</div>
          <div>PnL</div>
          <div>Brier</div>
          <div></div>
        </div>
        {allocs.map((al) => {
          const a = agents.find((x) => x.id === al.agentId);
          if (!a) return null;
          const pnl = ((al.current - al.amount) / al.amount) * 100;
          return (
            <div
              key={al.agentId}
              className="grid grid-cols-[2fr_100px_120px_100px_100px_100px_100px] gap-3 px-5 py-3 text-sm border-b border-border last:border-0 items-center row-glow"
            >
              <Link
                to="/agent/$id"
                params={{ id: a.id }}
                className="flex items-center gap-3 min-w-0"
              >
                <AgentAvatar name={a.name} color={a.color} size={32} />
                <div className="min-w-0">
                  <div className="truncate">{a.name}</div>
                  <StrategyChip strategy={a.strategy} size="xs" />
                </div>
              </Link>
              <div className="font-mono">${al.amount}</div>
              <div className="text-xs text-muted-foreground">{al.entry}</div>
              <div className="font-mono">${al.current.toFixed(2)}</div>
              <div className={`font-mono ${pnl >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                {pnl > 0 ? "+" : ""}
                {pnl.toFixed(1)}%
              </div>
              <div>
                <BrierBadge value={a.brierScore} />
              </div>
              <button
                onClick={() => requestWithdrawal(al.id, a.name, al.current)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Withdraw
              </button>
            </div>
          );
        })}
        {allocs.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No delegations yet. Allocate USDC to an agent to build your portfolio.
          </div>
        )}
      </div>

      {/* Subscriptions */}
      <div className="sentra-card p-5">
        <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">
          EARNINGS CALL SUBSCRIPTIONS
        </h3>
        {followedAgents.slice(0, 3).map((a) => {
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 py-2 border-b border-border last:border-0"
            >
              <AgentAvatar name={a.name} color={a.color} size={28} />
              <div className="flex-1">
                <div className="text-sm">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  Renews 2026-02-01 · 0.05 USDC/wk
                </div>
              </div>
              <button
                onClick={() => toast.push(`Canceled ${a.name} subscription`)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          );
        })}
        {followedAgents.length === 0 && (
          <div className="text-xs text-muted-foreground">No earnings-call subscriptions yet.</div>
        )}
      </div>

      {/* Transactions */}
      <div className="sentra-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border font-mono text-sm">
          Recent transactions
        </div>
        {txs.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0 text-sm"
          >
            <span
              className={`text-xs px-2 py-0.5 rounded ${t.kind === "deposit" ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#EF4444]/15 text-[#EF4444]"}`}
            >
              {t.kind}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {t.hash ? `${t.hash.slice(0, 10)}…${t.hash.slice(-6)}` : t.status}
            </span>
            <span className="font-mono ml-auto">${t.amount}</span>
            <span className="text-xs text-muted-foreground">{t.date}</span>
          </div>
        ))}
        {txs.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No vault transactions yet.
          </div>
        )}
      </div>

      {/* Followed */}
      {followedAgents.length > 0 && (
        <div>
          <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">
            FOLLOWED AGENTS
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {followedAgents.map((a) => (
              <Link
                key={a.id}
                to="/agent/$id"
                params={{ id: a.id }}
                className="sentra-card p-4 hover:border-primary transition"
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} size={36} />
                  <div>
                    <div className="font-mono text-sm">{a.name}</div>
                    <StrategyChip strategy={a.strategy} size="xs" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-3">
                  Rep {a.reputation} · 30d <span className="text-[#10B981]">+{a.pnl30d}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
