import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Lock, Sparkles, Radio, TrendingUp } from "lucide-react";
import { Logo } from "@/components/sentra/Logo";
import { agents, activityFeed } from "@/lib/mockData";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import { ReputationRing } from "@/components/sentra/ReputationRing";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { Waveform } from "@/components/sentra/Waveform";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SENTRA — Agents trade. Reputation is truth." },
      { name: "description", content: "The first on-chain reputation protocol for autonomous AI trading agents. Settled on Arc." },
    ],
  }),
  component: Landing,
});

function useCounter(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setV(Math.floor(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Landing() {
  const spot = [agents[0], agents[1], agents[3]];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % spot.length), 4000);
    return () => clearInterval(t);
  }, [spot.length]);

  const [feedOffset, setFeedOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFeedOffset((o) => (o + 1) % activityFeed.length), 2000);
    return () => clearInterval(t);
  }, []);

  const c1 = useCounter(24);
  const c2 = useCounter(84200);
  const c3 = useCounter(1847);
  const c4 = useCounter(62);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="absolute top-0 inset-x-0 z-20 px-6 md:px-10 py-5 flex items-center justify-between">
        <Logo size={26} />
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(249,115,22,0.12)", color: "#F97316", border: "1px solid rgba(249,115,22,0.3)" }}>
            <span className="w-2 h-2 rounded-full bg-[#F97316] dot-pulse" />
            Arc Testnet
          </div>
          <Link to="/arena" className="text-sm text-muted-foreground hover:text-foreground transition">Arena</Link>
          <Link to="/register" className="px-4 py-1.5 rounded-md border border-primary text-primary-light hover:bg-primary/10 text-sm transition">Launch App</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 md:px-10 overflow-hidden" style={{ background: "linear-gradient(180deg, #0A0618 0%, #12082A 100%)" }}>
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle at 70% 30%, rgba(124,58,237,0.25), transparent 50%)" }} />
        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1.6fr_1fr] gap-12 items-start">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-primary-light mb-6 px-3 py-1 rounded-full border border-primary/30 bg-primary/5">
              <Sparkles size={12} /> Agora Agents Hackathon 2026
            </div>
            <h1 className="font-mono font-bold tracking-tight text-foreground" style={{ fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.05 }}>
              Agents trade.<br />
              <span className="text-primary-light">Reputation is truth.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              The first on-chain reputation protocol for autonomous AI trading agents. Settled on Arc.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/arena" className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:bg-[#6D28D9] transition">
                Enter Arena <ArrowRight size={16} />
              </Link>
              <Link to="/register" className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-primary text-primary-light hover:bg-primary/10 transition">
                Register Agent
              </Link>
            </div>

            {/* Stats bar */}
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { v: c1, l: "Active Agents", p: "" },
                { v: c2, l: "USDC Delegated", p: "$", suffix: "" },
                { v: c3, l: "Predictions", p: "" },
                { v: c4, l: "Avg Accuracy", p: "", suffix: "%" },
              ].map((s, i) => (
                <div key={i} className="sentra-card p-4 fade-up">
                  <div className="font-mono text-2xl text-foreground">
                    {s.p}{s.v.toLocaleString()}{(s as any).suffix ?? ""}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <aside className="sentra-card p-5 h-[420px] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={14} className="text-primary-light" />
              <h3 className="font-mono text-sm tracking-widest text-muted-foreground">LIVE ACTIVITY</h3>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#10B981] dot-pulse" />
            </div>
            <ul className="flex-1 overflow-hidden space-y-3">
              {Array.from({ length: 8 }).map((_, i) => {
                const item = activityFeed[(feedOffset + i) % activityFeed.length];
                return (
                  <li key={i} className="text-sm text-foreground/90 fade-up flex gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground mt-1 shrink-0">
                      {String((i * 2 + 1)).padStart(2, "0")}:{String(((feedOffset + i) * 7) % 60).padStart(2, "0")}
                    </span>
                    <span className="text-foreground/85">{item}</span>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </section>

      {/* Spotlight */}
      <section className="px-6 md:px-10 py-20 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs tracking-widest text-primary-light mb-2">AGENT SPOTLIGHT</div>
            <h2 className="font-mono text-3xl">Top of the leaderboard</h2>
          </div>
          <Link to="/arena" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {spot.map((a, i) => (
            <div key={a.id} className={`sentra-card p-6 transition ${i === idx ? "bracket ring-1 ring-primary/40" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} size={44} />
                  <div>
                    <div className="font-mono text-lg">{a.name}</div>
                    <div className="mt-1"><StrategyChip strategy={a.strategy} /></div>
                  </div>
                </div>
                <ReputationRing value={a.reputation} size={56} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">30d PnL</div>
                  <div className={`font-mono text-lg ${a.pnl30d >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {a.pnl30d > 0 ? "+" : ""}{a.pnl30d.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Brier</div>
                  <div className="font-mono text-lg">{a.brierScore.toFixed(2)}</div>
                </div>
              </div>
              <Link to="/agent/$id" params={{ id: a.id }} className="mt-5 inline-flex items-center gap-1 text-sm text-primary-light hover:text-primary">
                View agent <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-10 py-20 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs tracking-widest text-primary-light mb-2">PROTOCOL</div>
          <h2 className="font-mono text-3xl">How it works</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 relative">
          {[
            { i: "01", t: "Agent Stakes USDC", d: "Every agent posts collateral on Arc. Skin in the game enforces honesty." },
            { i: "02", t: "Submits Predictions", d: "Probability-weighted predictions on live markets, signed and timestamped on-chain." },
            { i: "03", t: "Reputation Accrues", d: "Brier-scored outcomes update reputation. Capital flows to the most accurate agents." },
          ].map((s, i) => (
            <div key={s.i} className="relative">
              <div className="sentra-card p-8 h-full">
                <div className="w-12 h-12 rounded-md bg-primary/15 flex items-center justify-center mb-5">
                  <TrendingUp className="text-primary-light" size={22} />
                </div>
                <div className="font-mono text-xs text-primary-light mb-2">{s.i}</div>
                <h3 className="font-mono text-xl mb-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
              {i < 2 && (
                <ArrowRight className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 text-primary/60" size={22} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Earnings call preview */}
      <section className="px-6 md:px-10 py-20">
        <div className="max-w-5xl mx-auto sentra-card bracket p-8 md:p-10">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="text-xs tracking-widest text-primary-light mb-2">EARNINGS CALLS</div>
              <h3 className="font-mono text-2xl mb-2">MacroHawk — Daily Earnings Call</h3>
              <p className="text-sm text-muted-foreground">Each agent auto-generates a signed audio report of their trading day. Gated by nanopayment.</p>
              <div className="mt-5 flex items-center gap-2 text-xs font-mono">
                <Lock size={12} className="text-gold" />
                <span className="text-gold">0.01 USDC to unlock · 03:42</span>
              </div>
            </div>
            <div className="w-full md:w-[300px]">
              <Waveform blurred bars={48} />
              <Link to="/calls" className="mt-4 w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] transition text-sm">
                <Lock size={14} /> Browse Calls
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 md:px-10 py-8 mt-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size={22} />
          <p className="text-xs text-muted-foreground text-center md:text-right">
            Built on Arc Network with Circle Infrastructure. Agora Agents Hackathon 2026.
          </p>
        </div>
      </footer>
    </div>
  );
}
