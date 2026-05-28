import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { parseUnits, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { Wallet, ArrowRight, Check, Layers } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { loadSentraDataset, type SentraDataset } from "@/lib/sentraData";
import { createDelegationIntentAction, createWithdrawalIntentAction } from "@/lib/sentraActions";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { walletSessionHeaders } from "@/lib/walletSession";
import {
  erc20ApprovalAbi,
  sentraDelegationVaultAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";
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
  loader: () => loadSentraDataset(),
  component: Delegate,
});

function Delegate() {
  const dataset = Route.useLoaderData() as SentraDataset;
  const { agents, delegations } = dataset;
  const wallet = useWallet();
  const toast = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(50);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [confetti, setConfetti] = useState(false);
  const [busy, setBusy] = useState<"approve" | "delegate" | "undelegate" | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const selected = agents.find((a) => a.id === agentId) ?? agents[0];
  const estReturn = selected ? (amount * selected.sharpeRatio * 0.08).toFixed(2) : "0.00";
  const allocBreakdown = delegations.map((al) => {
    const a = agents.find((x) => x.id === al.agentId);
    return {
      ...al,
      name: a?.name ?? "Unknown agent",
      color: a?.color ?? "#7C3AED",
      ret: al.amount ? ((al.current - al.amount) / al.amount) * 100 : 0,
    };
  });

  if (!wallet.connected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        <div className="sentra-card bracket p-10 text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-5">
            <Wallet size={28} className="text-primary-light" />
          </div>
          <h2 className="font-mono text-xl mb-2">Wallet sign-in required</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with a wallet on the auth page before delegating USDC to agents.
          </p>
          <Link
            to="/login"
            className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] transition"
          >
            Wallet sign-in
          </Link>
        </div>
      </div>
    );
  }

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    if (!selected) return;
    const authHeaders = walletSessionHeaders(wallet.address);
    if (!authHeaders) {
      toast.push("Open Sign in and sign the wallet message before delegating");
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then confirm the delegation");
      return;
    }
    if (!selected.registryAgentId) {
      toast.push("This agent is missing its on-chain registry id");
      return;
    }
    if (!sentraProtocolContracts.delegationVault) {
      toast.push("Delegation vault address is not configured");
      return;
    }
    setConfetti(true);
    try {
      const vault = sentraProtocolContracts.delegationVault as Address;
      const amountUnits = parseUnits(amount.toFixed(6), 6);
      setBusy("approve");
      const approvalHash = await writeContractAsync({
        address: sentraProtocolContracts.usdc as Address,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [vault, amountUnits],
      });
      toast.push("USDC approval submitted");
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      setBusy("delegate");
      const delegateHash = await writeContractAsync({
        address: vault,
        abi: sentraDelegationVaultAbi,
        functionName: "delegate",
        args: [selected.registryAgentId, amountUnits],
      });
      toast.push("Delegation transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: delegateHash });

      await createDelegationIntentAction({
        data: {
          agentId: selected.databaseId,
          amountUsdc: amount,
          delegatorAddress: wallet.address ?? undefined,
          txHash: delegateHash,
        },
        headers: authHeaders,
      });
      setLastTxHash(delegateHash);
      toast.push(`Delegated ${amount} USDC to ${selected.name}`);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delegation failed";
      toast.push(message);
    } finally {
      setBusy(null);
      setTimeout(() => setConfetti(false), 2800);
    }
  };

  const requestUndelegation = async (
    delegationId: string,
    agentName: string,
    amountUsdc: number,
  ) => {
    const authHeaders = walletSessionHeaders(wallet.address);
    if (!authHeaders) {
      toast.push("Open Sign in and sign the wallet message before undelegating");
      return;
    }
    const delegation = delegations.find((item) => item.id === delegationId);
    const agent = delegation ? agents.find((item) => item.id === delegation.agentId) : null;
    if (!delegation || !agent?.registryAgentId) {
      toast.push("This delegation is missing its on-chain agent id");
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then undelegate");
      return;
    }
    if (!sentraProtocolContracts.delegationVault) {
      toast.push("Delegation vault address is not configured");
      return;
    }
    try {
      setBusy("undelegate");
      const withdrawHash = await writeContractAsync({
        address: sentraProtocolContracts.delegationVault as Address,
        abi: sentraDelegationVaultAbi,
        functionName: "withdraw",
        args: [agent.registryAgentId, parseUnits(amountUsdc.toFixed(6), 6)],
      });
      toast.push("Undelegation transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: withdrawHash });

      const result = await createWithdrawalIntentAction({
        data: {
          delegationId,
          amountUsdc,
          txHash: withdrawHash,
          withdrawerAddress: wallet.address ?? undefined,
        },
        headers: authHeaders,
      });
      toast.push(
        result.status === "confirmed"
          ? `Undelegated ${amountUsdc} USDC from ${agentName}`
          : `Undelegation intent queued for ${agentName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Undelegation intent failed";
      toast.push(message);
    } finally {
      setBusy(null);
    }
  };
  const applyBasket = (basket: string, ids: string[]) => {
    setAgentId(ids[0] ?? agents[0]?.id ?? "");
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
                {agents.length > 0 ? (
                  <>
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
                      <AgentAvatar
                        name={selected.name}
                        color={selected.color}
                        imageUrl={selected.imageUrl}
                        size={36}
                      />
                      <div>
                        <div className="font-mono">{selected.name}</div>
                        <div className="mt-1">
                          <StrategyChip strategy={selected.strategy} size="xs" />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No agents are open for delegation yet.
                  </p>
                )}
              </div>
            )}
            {step === 3 && (
              <div>
                <div className="text-xs tracking-widest text-primary-light mb-2">
                  STEP 3 · CONFIRM
                </div>
                <h3 className="font-mono text-xl mb-4">Review allocation</h3>
                <dl className="space-y-3 text-sm">
                  <Row k="Agent" v={selected?.name ?? "No agent selected"} />
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
                  Tx{" "}
                  <span className="font-mono">
                    {lastTxHash ? `${lastTxHash.slice(0, 8)}...${lastTxHash.slice(-6)}` : "pending"}
                  </span>
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
                    disabled={!selected || busy !== null}
                    className="px-5 py-2 rounded bg-primary text-primary-foreground hover:bg-[#6D28D9] text-sm"
                  >
                    {busy === "approve"
                      ? "Approving USDC..."
                      : busy === "delegate"
                        ? "Delegating..."
                        : busy === "undelegate"
                          ? "Undelegating..."
                          : "Confirm Delegation"}
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
                ids: [...agents]
                  .sort((a, b) => a.brierScore - b.brierScore)
                  .slice(0, 3)
                  .map((a) => a.id),
                desc: "Lowest 3 Brier scores. Conservative.",
              },
              {
                name: "Max Diversification",
                ids: agents
                  .filter(
                    (agent, index, list) =>
                      list.findIndex((a) => a.strategy === agent.strategy) === index,
                  )
                  .slice(0, 3)
                  .map((a) => a.id),
                desc: "Mixed strategies. Balanced risk.",
              },
              {
                name: "High Risk/Reward",
                ids: [...agents]
                  .sort((a, b) => b.delegationCap - a.delegationCap)
                  .slice(0, 3)
                  .map((a) => a.id),
                desc: "Volatile contrarian + tech. High variance.",
              },
            ].map((b) => (
              <div key={b.name} className="sentra-card p-5 hover:border-primary transition">
                <Layers size={18} className="text-primary-light mb-3" />
                <div className="font-mono">{b.name}</div>
                <p className="text-xs text-muted-foreground mt-1">{b.desc}</p>
                <div className="mt-3 flex gap-1">
                  {b.ids.map((id) => {
                    const a = agents.find((x) => x.id === id);
                    if (!a) return null;
                    return (
                      <AgentAvatar
                        key={id}
                        name={a.name}
                        color={a.color}
                        imageUrl={a.imageUrl}
                        size={26}
                      />
                    );
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
            <div className="font-mono text-3xl mt-1">${wallet.balance.toFixed(2)}</div>
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
                    onClick={() => requestUndelegation(al.id, al.name, al.current)}
                    disabled={busy === "undelegate"}
                    className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-elevated disabled:opacity-50"
                  >
                    Undelegate
                  </button>
                </div>
              ))}
              {allocBreakdown.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No active delegations yet.
                </div>
              )}
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
