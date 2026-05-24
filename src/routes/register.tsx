import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Check, Shield, Wallet, KeyRound, Radio } from "lucide-react";
import { useToast } from "@/lib/toast";
import { ARC_ERC8004_REGISTRIES, ARC_GATEWAY } from "@/lib/arcTestnet";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Register Agent — SENTRA" }] }),
  component: Register,
});

const strategies = ["Macro", "Sports", "Tech", "Contrarian", "Yield", "Custom"];
const colors = ["#7C3AED", "#0D9488", "#D97706"];

function Register() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("Macro");
  const [desc, setDesc] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [stake, setStake] = useState(1);
  const [approved, setApproved] = useState(false);
  const [conf, setConf] = useState(70);
  const [maxActive, setMaxActive] = useState(5);
  const [cap, setCap] = useState(10000);
  const [autoCalls, setAutoCalls] = useState(true);
  const [publicDel, setPublicDel] = useState(true);
  const [dailyLoss, setDailyLoss] = useState(250);
  const [slippage, setSlippage] = useState(75);
  const [faqOpen, setFaqOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  const deploy = () => {
    setDeploying(true);
    setTimeout(() => {
      setDeploying(false);
      setDeployed(true);
      toast.push(`Agent ${name || "Untitled"} deployed`);
    }, 3000);
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-[820px] mx-auto">
      <h1 className="font-mono text-3xl mb-1">Register Agent</h1>
      <p className="text-muted-foreground mb-6">Stake. Configure. Deploy.</p>

      <div className="sentra-card p-5 mb-6 border-l-2 border-primary">
        <div className="text-xs tracking-widest text-primary-light mb-2">
          WHAT A REGISTERED AGENT DOES
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed mb-3">
          An agent is an autonomous decision-maker you own. Once registered, it stakes USDC on Arc,
          submits signed probability-weighted predictions to live markets, and earns reputation as
          those predictions resolve. Other users can delegate USDC to back agents they trust — you
          earn a performance fee on their PnL.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can run the agent three ways: <span className="text-foreground">(1)</span> your own
          off-chain bot signing predictions, <span className="text-foreground">(2)</span> a hosted
          SENTRA strategy template, or <span className="text-foreground">(3)</span> a BYO-LLM agent
          with a Circle developer-controlled wallet. Pick on Step 1 — all three settle on Arc and
          accrue the same on-chain reputation.{" "}
          <Link to="/docs" className="text-primary-light hover:text-primary">
            Full docs →
          </Link>
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-6">
        <SetupChip icon={Shield} k="ERC-8004" v="Arc identity + reputation" />
        <SetupChip icon={Wallet} k="Treasury" v="Circle dev wallet" />
        <SetupChip icon={KeyRound} k="Signing" v="Prediction key" />
        <SetupChip icon={Radio} k="Gateway" v={`Domain ${ARC_GATEWAY.domain}`} />
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: step >= s ? "100%" : "0%", background: "#7C3AED" }}
            />
          </div>
        ))}
      </div>

      <div className="sentra-card p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-xs tracking-widest text-primary-light">STEP 1 · IDENTITY</div>
            <Field label={`Name (${name.length}/32)`}>
              <input
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MyTradingAgent"
                className="w-full bg-elevated px-3 py-2 rounded outline-none focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label="Strategy">
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-elevated px-3 py-2 rounded outline-none focus:ring-1 focus:ring-primary"
              >
                {strategies.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label={`Description (${desc.length}/200)`}>
              <textarea
                value={desc}
                maxLength={200}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="w-full bg-elevated px-3 py-2 rounded outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </Field>
            <div>
              <div className="text-xs text-muted-foreground mb-2">Avatar preview</div>
              <div className="flex items-center gap-3">
                <div
                  className="rounded-full w-16 h-16 flex items-center justify-center font-mono text-2xl text-white"
                  style={{ background: colors[colorIdx] }}
                >
                  {(name || "A").charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={() => setColorIdx((i) => (i + 1) % colors.length)}
                  className="px-3 py-1.5 rounded border border-primary text-primary-light hover:bg-primary/10 text-sm"
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="text-xs tracking-widest text-primary-light">STEP 2 · STAKE</div>
            <div className="text-sm text-muted-foreground">
              Min stake: <span className="font-mono text-foreground">1 USDC</span> (testnet)
            </div>
            <Field label="Stake amount (USDC)">
              <input
                type="number"
                value={stake}
                min={1}
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-full bg-elevated px-3 py-2 rounded font-mono outline-none focus:ring-1 focus:ring-primary"
              />
            </Field>
            <div className="sentra-card !shadow-none p-4">
              <button
                onClick={() => setFaqOpen(!faqOpen)}
                className="w-full flex items-center justify-between text-sm"
              >
                <span>What happens if my agent is consistently wrong?</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${faqOpen ? "rotate-180" : ""}`}
                />
              </button>
              {faqOpen && (
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  If reputation falls below{" "}
                  <span className="text-foreground font-mono">20/100</span>, your stake becomes
                  slashable. Slashed funds are redistributed to top performers. This keeps the
                  system honest — every agent has skin in the game.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setApproved(true)}
                disabled={approved}
                className={`flex-1 py-2.5 rounded text-sm transition ${approved ? "bg-[#10B981]/20 text-[#10B981]" : "border border-primary text-primary-light hover:bg-primary/10"}`}
              >
                {approved ? (
                  <>
                    <Check size={14} className="inline mr-1" /> USDC Approved
                  </>
                ) : (
                  "Approve USDC"
                )}
              </button>
              <button
                disabled={!approved}
                className="flex-1 py-2.5 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm disabled:opacity-40"
              >
                Stake & Register
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="text-xs tracking-widest text-primary-light">STEP 3 · CONFIGURE</div>
            <Field label={`Min confidence threshold: ${conf}%`}>
              <input
                type="range"
                min={50}
                max={90}
                value={conf}
                onChange={(e) => setConf(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </Field>
            <Field label={`Max active predictions: ${maxActive}`}>
              <input
                type="range"
                min={1}
                max={10}
                value={maxActive}
                onChange={(e) => setMaxActive(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </Field>
            <Field label="Delegation cap (USDC)">
              <input
                type="number"
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                className="w-full bg-elevated px-3 py-2 rounded font-mono outline-none focus:ring-1 focus:ring-primary"
              />
            </Field>
            <Field label={`Max daily loss: ${dailyLoss} USDC`}>
              <input
                type="range"
                min={25}
                max={1000}
                step={25}
                value={dailyLoss}
                onChange={(e) => setDailyLoss(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </Field>
            <Field label={`Max slippage: ${slippage} bps`}>
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </Field>
            <Toggle
              label="Auto-generate earnings calls"
              value={autoCalls}
              onChange={setAutoCalls}
            />
            <Toggle
              label="Accept delegations from public"
              value={publicDel}
              onChange={setPublicDel}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="text-xs tracking-widest text-primary-light">STEP 4 · REVIEW</div>
            {!deployed ? (
              <>
                <div className="sentra-card !shadow-none p-4 space-y-2 text-sm">
                  <Row k="Name" v={name || "—"} />
                  <Row k="Strategy" v={strategy} />
                  <Row k="Stake" v={`${stake} USDC`} />
                  <Row k="Confidence threshold" v={`${conf}%`} />
                  <Row k="Max active" v={String(maxActive)} />
                  <Row k="Cap" v={`${cap.toLocaleString()} USDC`} />
                  <Row k="Risk limits" v={`${dailyLoss} USDC/day · ${slippage} bps`} />
                  <Row
                    k="ERC-8004 identity"
                    v={ARC_ERC8004_REGISTRIES.identity.slice(0, 10) + "…"}
                  />
                  <Row
                    k="Reputation registry"
                    v={ARC_ERC8004_REGISTRIES.reputation.slice(0, 10) + "…"}
                  />
                  <Row
                    k="Validation registry"
                    v={ARC_ERC8004_REGISTRIES.validation.slice(0, 10) + "…"}
                  />
                  <Row k="Gateway balance" v="Initialized after wallet funding" />
                  <Row k="Auto calls" v={autoCalls ? "On" : "Off"} />
                  <Row k="Public delegations" v={publicDel ? "On" : "Off"} />
                </div>
                <button
                  onClick={deploy}
                  disabled={deploying}
                  className="w-full py-3 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-60 font-medium"
                >
                  {deploying ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-primary-foreground animate-pulse" />
                      Deploying to Arc…
                    </span>
                  ) : (
                    "Deploy Agent"
                  )}
                </button>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center mb-4">
                  <Check size={28} />
                </div>
                <h3 className="font-mono text-xl">Agent live</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  ID: <span className="font-mono">agent_{Math.floor(Math.random() * 99999)}</span>
                </p>
                <div className="mt-5 flex gap-2 justify-center">
                  <Link
                    to="/agent/$id"
                    params={{ id: "macrohawk" }}
                    className="px-4 py-2 rounded border border-primary text-primary-light hover:bg-primary/10 text-sm"
                  >
                    View Agent
                  </Link>
                  <button
                    onClick={() => toast.push("Funding wallet…")}
                    className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm"
                  >
                    Fund Agent Wallet
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!deployed && step < 4 && (
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="px-5 py-2 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm"
            >
              Next
            </button>
          </div>
        )}
        {!deployed && step === 4 && (
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
function SetupChip({
  icon: Icon,
  k,
  v,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  k: string;
  v: string;
}) {
  return (
    <div className="sentra-card p-3">
      <div className="flex items-center gap-2 text-primary-light text-xs font-mono">
        <Icon size={14} /> {k}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{v}</div>
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition relative ${value ? "bg-primary" : "bg-elevated"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
