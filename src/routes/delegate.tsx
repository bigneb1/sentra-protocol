import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, ArrowRight, Check, Layers } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { agents } from "@/lib/mockData";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { AgentAvatar } from "@/components/sentra/Avatar";

export const Route = createFileRoute("/delegate")({
  head: () => ({
    meta: [
      { title: "Delegation Hub — SENTRA" },
      {
        name: "description",
        content: "Allocate USDC to Arc agents with verifiable SENTRA track records.",
      },
    ],
  }),
  component: Delegate,
});

const mockAllocs = [
  { agentId: "macrohawk", amount: 150, current: 168.4, ret: 12.3 },
  { agentId: "fedwatcher", amount: 100, current: 108.7, ret: 8.7 },
  { agentId: "stableyield", amount: 80, current: 82.1, ret: 2.6 },
];

function Delegate() {
  const { connected, connect } = useWallet();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(50);
  const [agentId, setAgentId] = useState("macrohawk");
  const [confetti, setConfetti] = useState(false);

  const selected = agents.find((a) => a.id === agentId)!;
  const estReturn = (amount * selected.sharpeRatio * 0.08).toFixed(2);
  const allocBreakdown = mockAllocs.map((al) => {
    const a = agents.find((x) => x.id === al.agentId)!;
    return { ...al, name: a.name, color: a.color };
  });

  if (!connected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        <div className="sentra-card bracket p-10 text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-5">
            <Wallet size={28} className="text-primary-light" />
          </div>
          <h2 className="font-mono text-xl mb-2">Connect your wallet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Connect to delegate USDC to agents with verifiable reputation.
          </p>
          <button
            onClick={connect}
            className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] transition"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));
  const finish = () => {
    setConfetti(true);
    toast.push(`Delegated ${amount} USDC to ${selected.name}`);
    setTimeout(() => setConfetti(false), 2800);
    next();
  };
  const applyBasket = (basket: string, ids: string[]) => {
    setAgentId(ids[0]);
    setAmount(120);
    setStep(3);
    toast.push(`Loaded basket: ${basket}`);
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1300px] mx-auto">
      <h1 className="font-mono text-3xl mb-1">Delegation Hub</h1>
      <p className="text-muted-foreground mb-6">
        Allocate capital by reputation, scoring history, and risk limits.
      </p>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div>
          {/* Wizard */}
          <div className="sentra-card p-6 relative overflow-hidden">
            {confetti && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 60 }).map((_, i) => (
                  <span
                    key={i}
                    className="confetti-piece"
                    style={{
                      left: `${(i * 17) % 100}%`,
                      background: ["#7C3AED", "#A78BFA", "#D97706", "#10B981"][i % 4],
                      animationDelay: `${(i % 10) * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: step >= s ? "100%" : "0%", background: "#7C3AED" }}
                  />
                </div>
              ))}
            </div>

            {step === 1 && (
              <div>
                <div className="text-xs tracking-widest text-primary-light mb-2">
                  STEP 1 · AMOUNT
                </div>
                <h3 className="font-mono text-xl mb-4">How much USDC?</h3>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  max={500}
                  className="w-full bg-elevated px-3 py-2.5 rounded font-mono text-xl outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="range"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  max={500}
                  className="w-full mt-4 accent-[#7C3AED]"
                />
                <div className="text-sm text-muted-foreground mt-2 font-mono">
                  Est. annual return: <span className="text-foreground">${estReturn}</span>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <div className="text-xs tracking-widest text-primary-light mb-2">
                  STEP 2 · AGENT
                </div>
                <h3 className="font-mono text-xl mb-4">Pick your agent</h3>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full bg-elevated px-3 py-2.5 rounded outline-none focus:ring-1 focus:ring-primary"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.strategy} · Brier {a.brierScore.toFixed(2)} · Cap $
                      {(a.delegationCap - a.delegationFilled).toLocaleString()}
                    </option>
                  ))}
                </select>
                <div className="mt-5 sentra-card !shadow-none p-4 flex items-center gap-3">
                  <AgentAvatar name={selected.name} color={selected.color} size={36} />
                  <div>
                    <div className="font-mono">{selected.name}</div>
                    <div className="mt-1">
                      <StrategyChip strategy={selected.strategy} size="xs" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <div className="text-xs tracking-widest text-primary-light mb-2">
                  STEP 3 · CONFIRM
                </div>
                <h3 className="font-mono text-xl mb-4">Review allocation</h3>
                <dl className="space-y-3 text-sm">
                  <Row k="Agent" v={selected.name} />
                  <Row k="Amount" v={`${amount} USDC`} />
                  <Row
                    k="Expected return (1y)"
                    v={`$${(amount * 0.04).toFixed(2)} – $${estReturn}`}
                  />
                  <Row k="Lock period" v="24 hours" />
                </dl>
              </div>
            )}
            {step === 4 && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center mb-4">
                  <Check size={28} />
                </div>
                <h3 className="font-mono text-xl">Delegation submitted</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Tx <span className="font-mono">0xab12…ef89</span>
                </p>
                <Link
                  to="/portfolio"
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9]"
                >
                  View Portfolio <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {step < 4 && (
              <div className="flex justify-between mt-8">
                <button
                  onClick={back}
                  disabled={step === 1}
                  className="px-4 py-2 rounded text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  Back
                </button>
                {step < 3 ? (
                  <button
                    onClick={next}
                    className="px-5 py-2 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={finish}
                    className="px-5 py-2 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm"
                  >
                    Confirm Delegation
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Baskets */}
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {[
              {
                name: "Top 3 Brier",
                ids: ["macrohawk", "fedwatcher", "stableyield"],
                desc: "Lowest 3 Brier scores. Conservative.",
              },
              {
                name: "Max Diversification",
                ids: ["macrohawk", "sportsflow", "stableyield"],
                desc: "Mixed strategies. Balanced risk.",
              },
              {
                name: "High Risk/Reward",
                ids: ["crowdfade", "alphabot", "techsignal"],
                desc: "Volatile contrarian + tech. High variance.",
              },
            ].map((b) => (
              <div key={b.name} className="sentra-card p-5 hover:border-primary transition">
                <Layers size={18} className="text-primary-light mb-3" />
                <div className="font-mono">{b.name}</div>
                <p className="text-xs text-muted-foreground mt-1">{b.desc}</p>
                <div className="mt-3 flex gap-1">
                  {b.ids.map((id) => {
                    const a = agents.find((x) => x.id === id)!;
                    return <AgentAvatar key={id} name={a.name} color={a.color} size={26} />;
                  })}
                </div>
                <button
                  onClick={() => applyBasket(b.name, b.ids)}
                  className="mt-4 w-full px-3 py-2 rounded border border-primary text-primary-light hover:bg-primary/10 text-xs"
                >
                  Allocate Basket
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="sentra-card p-5">
            <div className="text-xs text-muted-foreground">Available USDC</div>
            <div className="font-mono text-3xl mt-1">$500.00</div>
            <div className="text-[11px] text-muted-foreground mt-1">via Circle on Arc</div>
          </div>
          <div className="sentra-card p-5">
            <h3 className="font-mono text-sm tracking-widest text-muted-foreground mb-3">
              ACTIVE ALLOCATIONS
            </h3>
            <div className="h-40 relative">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={allocBreakdown}
                    dataKey="amount"
                    innerRadius={40}
                    outerRadius={62}
                    stroke="none"
                  >
                    {allocBreakdown.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {allocBreakdown.map((al) => (
                <div key={al.agentId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: al.color }} />
                  <span className="flex-1">{al.name}</span>
                  <span className="font-mono">${al.current.toFixed(0)}</span>
                  <span className="font-mono text-[#10B981]">+{al.ret.toFixed(1)}%</span>
                  <button
                    onClick={() => toast.push(`Withdrew from ${al.name}`)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
