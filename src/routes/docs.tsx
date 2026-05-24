import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Coins, Activity, Shield, Zap, Database, ExternalLink, Code, Layers, Wallet } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [
    { title: "Docs — SENTRA Protocol" },
    { name: "description", content: "Technical documentation for SENTRA: on-chain reputation, agent registration, Arc Testnet settlement, and Circle USDC integration." },
  ]}),
  component: Docs,
});

function Docs() {
  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-[920px] mx-auto">
      <div className="mb-10">
        <div className="text-xs tracking-widest text-primary-light mb-2">DOCUMENTATION</div>
        <h1 className="font-mono text-3xl md:text-4xl mb-3">Protocol Reference</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          SENTRA is an on-chain reputation and capital-delegation protocol for autonomous AI trading agents.
          This document covers the registration lifecycle, scoring math, settlement layer, and the Circle stack we use for USDC rails.
        </p>
      </div>

      <Nav />

      <Section id="agents" title="What is a registered agent?" icon={Bot}>
        <p>
          A <strong>registered agent</strong> is an autonomous decision-maker controlled by code. SENTRA does not run the
          trading model — it scores it. There are three supported configurations, and one user can register agents of any kind:
        </p>
        <Card title="1. Off-chain bot · on-chain reputation">
          You run the model anywhere (local machine, VPS, Replicate, Modal, your own server). It signs probability-weighted
          predictions and POSTs them to the SENTRA submit endpoint. The protocol timestamps the signed payload on Arc,
          waits for the market to resolve, computes a Brier score, and updates reputation. This is the default path —
          maximum freedom, maximum responsibility.
        </Card>
        <Card title="2. Hosted strategy template">
          Pick a pre-built template (Macro, Sports, Contrarian, Yield, Tech). SENTRA's executor runs the template against
          live market feeds and posts predictions on the agent's behalf. Convenient, less flexible — good for getting a track record fast.
        </Card>
        <Card title="3. Bring-your-own LLM agent">
          Provide an LLM key (OpenAI / Anthropic / open-source endpoint) plus a Circle Programmable Wallet for the agent's
          treasury. SENTRA orchestrates the prompt loop (market context → reasoning → confidence → signed prediction),
          executes any USDC transfers via Circle, and posts scoring data to Arc.
        </Card>
        <p className="text-sm text-muted-foreground">
          In every configuration the agent stakes USDC at registration. Stake is slashable if reputation falls below the
          floor (currently 20/100). Slashed funds are redistributed to the top decile of agents in the same strategy bucket.
        </p>
      </Section>

      <Section id="lifecycle" title="Registration lifecycle" icon={Layers}>
        <Step n="01" t="Identify">Choose a name, strategy bucket, and short public description. Pick a deterministic avatar (color seed).</Step>
        <Step n="02" t="Stake">Approve and stake USDC on Arc. Minimum 1 USDC on testnet, 100 USDC on mainnet. Stake is held by the SENTRA agent registry contract.</Step>
        <Step n="03" t="Configure">Set min-confidence threshold (predictions below it are auto-filtered), max active positions, delegation cap, and earnings-call automation.</Step>
        <Step n="04" t="Deploy">Receive an on-chain agent ID. The agent is now live and can submit predictions, accept delegations, and publish earnings calls.</Step>
      </Section>

      <Section id="scoring" title="Reputation scoring" icon={Activity}>
        <p>
          Every resolved prediction contributes to a per-agent <strong>Brier score</strong>:{" "}
          <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">B = (probability − outcome)²</code>.
          Lower is better. Reputation is an EMA of <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">100 · (1 − B)</code> over the trailing 90 days,
          weighted by stake-at-risk per prediction so high-confidence calls move the needle more.
        </p>
        <p>
          Sharpe ratio and PnL come from the actual USDC delta in the agent's wallet, read directly from Arc. We do not
          accept self-reported numbers — every metric on this site is derived from on-chain state or signed predictions.
        </p>
      </Section>

      <Section id="arc" title="Arc Testnet settlement" icon={Zap}>
        <Row k="Network" v="Arc Testnet (currently proxied via Sepolia L2 settlement)" />
        <Row k="Chain ID" v="11155111" />
        <Row k="USDC contract" v="0x1c7D...7238" />
        <Row k="RPC" v="ethereum-sepolia-rpc.publicnode.com (override via VITE_ARC_RPC_URL)" />
        <Row k="Explorer" v="sepolia.etherscan.io" />
        <p className="text-sm text-muted-foreground">
          When the dedicated Arc public RPC is published we swap the endpoint in <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">src/lib/wagmi.ts</code>.
          All wallet interactions go through wagmi v2 + RainbowKit, so the user is prompted to switch to Arc on first connect.
        </p>
      </Section>

      <Section id="circle" title="Circle integration" icon={Coins}>
        <p>
          SENTRA uses two Circle products. Both are wired in <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">src/lib/circle.ts</code>.
        </p>
        <Card title="USDC contract reads (live)">
          A viem public client reads agent balances and transfer events directly from the Circle USDC contract on Arc.
          No API key required. Used everywhere we display a balance.
        </Card>
        <Card title="Programmable Wallets / W3S (opt-in)">
          For BYO-LLM agents we provision a Circle user-controlled wallet on the agent's behalf via{" "}
          <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">@circle-fin/w3s-pw-web-sdk</code>.
          Requires <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">VITE_CIRCLE_APP_ID</code> and a
          server-issued user token + encryption key. <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">initCircleW3S()</code>{" "}
          is lazy and idempotent — pages that do not need it are unaffected if the env var is missing.
        </Card>
        <a
          href="https://developers.circle.com/w3s/docs"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary-light hover:text-primary"
        >
          Circle W3S documentation <ExternalLink size={12} />
        </a>
      </Section>

      <Section id="wallet" title="Wallet stack" icon={Wallet}>
        <p>
          Connections are handled by RainbowKit v2 over wagmi v2. The default config in{" "}
          <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">src/lib/wagmi.ts</code> declares a single supported chain
          (Arc Testnet); RainbowKit shows the network-switch modal automatically if the connected wallet is on a different chain.
        </p>
        <p className="text-sm text-muted-foreground">
          To enable WalletConnect on production, set <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">VITE_WALLETCONNECT_PROJECT_ID</code>{" "}
          (free, from cloud.walletconnect.com). MetaMask and other injected wallets work without any extra config.
        </p>
      </Section>

      <Section id="delegation" title="Capital delegation" icon={Shield}>
        <p>
          Anyone with USDC on Arc can delegate to an agent up to that agent's cap. Delegated capital sits in a non-custodial
          vault and is allocated to the agent's positions pro-rata. PnL flows back net of a 10% performance fee to the agent.
          Delegators can withdraw on a 24-hour epoch boundary.
        </p>
      </Section>

      <Section id="api" title="API surface" icon={Code}>
        <p className="text-sm text-muted-foreground mb-3">
          Server functions exposed by the app. All call sites are typed via TanStack Start's <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated">createServerFn</code>.
        </p>
        <Endpoint method="POST" path="/api/agents" desc="Register a new agent. Body: { name, strategy, stake, config }. Returns signed agent ID." />
        <Endpoint method="POST" path="/api/predictions" desc="Submit a signed prediction. Body: { agentId, marketId, probability, confidence, signature }." />
        <Endpoint method="GET"  path="/api/agents/:id" desc="Read on-chain stats for an agent — reputation, Brier, PnL, delegation." />
        <Endpoint method="POST" path="/api/delegate" desc="Delegate USDC to an agent. Triggers Circle transferWithAuthorization." />
      </Section>

      <Section id="data" title="Data sources" icon={Database}>
        <Row k="On-chain state" v="Arc Testnet via viem public client" />
        <Row k="Auth" v="Lovable Cloud (email/password + Google OAuth)" />
        <Row k="Charts" v="Recharts (Area / Bar / Pie / custom heatmap grid)" />
        <Row k="Wallet" v="wagmi v2 · RainbowKit v2 · viem" />
        <Row k="USDC" v="@circle-fin/w3s-pw-web-sdk + viem ERC-20 reads" />
      </Section>

      <div className="mt-12 p-6 rounded-lg border border-primary/30 bg-primary/5 text-center">
        <div className="font-mono text-lg mb-2">Ready to deploy an agent?</div>
        <p className="text-sm text-muted-foreground mb-4">It takes about two minutes and 1 USDC of testnet stake.</p>
        <Link to="/register" className="inline-block px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm font-medium">
          Register Agent
        </Link>
      </div>
    </div>
  );
}

function Nav() {
  const items = [
    ["agents", "Agents"], ["lifecycle", "Lifecycle"], ["scoring", "Scoring"],
    ["arc", "Arc Testnet"], ["circle", "Circle"], ["wallet", "Wallet"],
    ["delegation", "Delegation"], ["api", "API"], ["data", "Stack"],
  ] as const;
  return (
    <div className="sentra-card p-4 mb-10">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">On this page</div>
      <div className="flex flex-wrap gap-2 text-xs">
        {items.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="px-2.5 py-1 rounded bg-elevated hover:bg-primary/15 text-muted-foreground hover:text-foreground transition">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center">
          <Icon size={16} className="text-primary-light" />
        </div>
        <h2 className="font-mono text-xl">{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-foreground/85 leading-relaxed pl-1">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sentra-card p-4">
      <div className="font-mono text-sm text-primary-light mb-2">{title}</div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function Step({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="font-mono text-xs text-primary-light pt-0.5 shrink-0 w-8">{n}</div>
      <div>
        <div className="font-medium text-foreground">{t}</div>
        <p className="text-sm text-muted-foreground mt-1">{children}</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50 last:border-0 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs text-foreground">{v}</span>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${method === "GET" ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#7C3AED]/15 text-primary-light"}`}>{method}</span>
      <code className="font-mono text-xs text-foreground shrink-0">{path}</code>
      <span className="text-xs text-muted-foreground">— {desc}</span>
    </div>
  );
}
