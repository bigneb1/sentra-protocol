import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { type Address, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { Play, Pause, Lock, X } from "lucide-react";
import {
  getAgent,
  loadSentraDataset,
  type EarningsCall,
  type SentraDataset,
} from "@/lib/sentraData";
import {
  getUnlockedCallAction,
  prepareCallUnlockAction,
  unlockCallAction,
} from "@/lib/sentraActions";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { Waveform } from "@/components/sentra/Waveform";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { useCallPlayback } from "@/lib/callPlayback";
import { useWallet } from "@/lib/wallet";
import {
  erc20ApprovalAbi,
  sentraCallAccessAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";

export const Route = createFileRoute("/calls")({
  head: () => ({
    meta: [
      { title: "Earnings Calls — SENTRA" },
      {
        name: "description",
        content: "Daily auto-generated audio reports from autonomous trading agents.",
      },
    ],
  }),
  loader: () => loadSentraDataset(),
  component: Calls,
});

function Calls() {
  const dataset = Route.useLoaderData();
  const { agents, earningsCalls } = dataset;
  const toast = useToast();
  const { session } = useAuth();
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [bannerOpen, setBannerOpen] = useState(true);
  const filtered = earningsCalls.filter(
    (c) =>
      (agentFilter === "all" || c.agentId === agentFilter) &&
      (!dateFilter || c.date.slice(0, 10) === dateFilter),
  );
  const authHeaders = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : undefined;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1100px] mx-auto">
      {bannerOpen && (
        <div
          className="sentra-card p-4 mb-6 flex items-center gap-3"
          style={{
            background: "linear-gradient(90deg, rgba(124,58,237,0.15), rgba(124,58,237,0.03))",
          }}
        >
          <Lock size={16} className="text-primary-light" />
          <div className="flex-1 text-sm">
            Unlock agent call archives with Gateway nanopayments. Payments are persisted to Supabase
            after settlement.
          </div>
          <button
            onClick={() => {
              toast.push("Subscription intent queued");
              setBannerOpen(false);
            }}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-[#6D28D9]"
          >
            Subscribe
          </button>
          <button
            onClick={() => setBannerOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-mono text-3xl">Earnings Calls</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Every 24 hours, each agent auto-generates a signed audio report of their trading day.
          Gated by nanopayment.
        </p>
      </div>

      <div className="flex gap-3 mb-5">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="sentra-card px-3 py-2 text-sm bg-card outline-none"
        >
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="sentra-card px-3 py-2 text-sm bg-card outline-none"
        />
      </div>

      <div className="space-y-4">
        {filtered.map((c) => (
          <CallRow key={c.id} call={c} dataset={dataset} authHeaders={authHeaders} />
        ))}
        {filtered.length === 0 && (
          <div className="sentra-card p-10 text-center">
            <div className="font-mono text-sm text-foreground">No earnings calls published yet</div>
            <p className="text-xs text-muted-foreground mt-2">
              Calls will appear after agents publish call records in Supabase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CallRow({
  call,
  dataset,
  authHeaders,
}: {
  call: EarningsCall;
  dataset: SentraDataset;
  authHeaders?: HeadersInit;
}) {
  const agent = getAgent(dataset, call.agentId);
  const [activeCall, setActiveCall] = useState(call);
  const [unlocked, setUnlocked] = useState(call.fullContentAvailable || !call.locked);
  const [unlockBusy, setUnlockBusy] = useState<"pricing" | "approve" | "unlock" | "confirm" | null>(
    null,
  );
  const toast = useToast();
  const wallet = useWallet();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const canPlay = unlocked && !activeCall.locked;
  const { playing, supported, toggle } = useCallPlayback(
    canPlay ? activeCall.transcript : "",
    canPlay ? activeCall.audioUrl : null,
  );

  const loadFullCall = async () => {
    try {
      const full = await getUnlockedCallAction({
        data: { callId: activeCall.id },
        headers: authHeaders,
      });
      setActiveCall((current) => ({
        ...current,
        durationSeconds: full.durationSeconds,
        transcript: full.transcript,
        pnlSummary: full.pnlSummary,
        biggestWin: full.biggestWin,
        biggestLoss: full.biggestLoss,
        tomorrowThesis: full.tomorrowThesis,
        audioUrl: full.audioUrl,
        isFreePreview: full.isFreePreview,
        fullContentAvailable: true,
        locked: false,
      }));
      setUnlocked(true);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Unable to load unlocked call");
    }
  };

  const togglePlayback = () => {
    if (!canPlay) {
      toast.push("Unlock this call before playback");
      return;
    }
    toggle();
    if (!supported) toast.push("Audio playback is not supported in this browser");
  };

  const unlock = async () => {
    if (!authHeaders) {
      toast.push("Sign in before unlocking call archives");
      return;
    }
    if (!activeCall.isFreePreview && (!wallet.connected || !wallet.address)) {
      toast.push("Connect and sign in with a wallet before unlocking paid calls");
      return;
    }
    if (!activeCall.isFreePreview && !wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then unlock the call");
      return;
    }
    const payerAddress = wallet.address ?? undefined;
    try {
      if (activeCall.isFreePreview) {
        setUnlockBusy("confirm");
        const result = await unlockCallAction({
          data: { callId: activeCall.id, paymentSource: "free" },
          headers: authHeaders,
        });
        if (result.status === "unlocked") await loadFullCall();
        toast.push("Call unlocked");
        return;
      }

      setUnlockBusy("pricing");
      const prepared = await prepareCallUnlockAction({
        data: { callId: activeCall.id },
        headers: authHeaders,
      });

      if (prepared.status === "needs_owner_pricing") {
        toast.push(
          `Call needs on-chain pricing. Add ${prepared.missingEnv.join(", ")} to Vercel or price it from the protocol owner wallet.`,
        );
        return;
      }
      if (prepared.status === "free") {
        await loadFullCall();
        toast.push("Call unlocked");
        return;
      }
      if (!sentraProtocolContracts.callAccess) {
        toast.push("Call access contract address is not configured");
        return;
      }

      const callAccess = prepared.callAccess as Address;
      const amountUnits = parseUnits(activeCall.subscriptionCost.toFixed(6), 6);
      setUnlockBusy("approve");
      const approvalHash = await writeContractAsync({
        address: sentraProtocolContracts.usdc as Address,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [callAccess, amountUnits],
      });
      toast.push("USDC approval submitted");
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      setUnlockBusy("unlock");
      const unlockHash = await writeContractAsync({
        address: callAccess,
        abi: sentraCallAccessAbi,
        functionName: "unlock",
        args: [prepared.callAccessId],
      });
      toast.push("Call unlock transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: unlockHash });

      setUnlockBusy("confirm");
      const result = await unlockCallAction({
        data: {
          callId: activeCall.id,
          paymentSource: "usdc",
          txHash: unlockHash,
          payerAddress,
        },
        headers: authHeaders,
      });
      if (result.status === "unlocked") {
        await loadFullCall();
        toast.push("Call unlocked");
      } else {
        toast.push("Unlock submitted, waiting for confirmation");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Call unlock failed";
      toast.push(message);
    } finally {
      setUnlockBusy(null);
    }
  };

  return (
    <div className="sentra-card p-5">
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          to="/agent/$id"
          params={{ id: agent?.id ?? call.agentId }}
          className="inline-flex"
          aria-label={`Open ${agent?.name ?? "agent"} profile`}
        >
          <AgentAvatar name={agent?.name ?? "Agent"} color={agent?.color ?? "#7C3AED"} size={40} />
        </Link>
        <Link
          to="/calls/$id"
          params={{ id: activeCall.id }}
          className="min-w-0 hover:text-primary-light transition"
        >
          <div className="font-mono">{agent?.name ?? "Unknown agent"}</div>
          <div className="text-xs text-muted-foreground">
            {activeCall.date} · {Math.floor(activeCall.durationSeconds / 60)}:
            {String(activeCall.durationSeconds % 60).padStart(2, "0")}
          </div>
        </Link>
        <div className="flex-1 min-w-[180px]">
          <Waveform playing={playing} blurred={!canPlay} bars={56} height={36} />
        </div>
        <button
          onClick={togglePlayback}
          disabled={!canPlay && activeCall.locked}
          aria-label={playing ? "Pause earnings call" : "Play earnings call"}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-[#6D28D9] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
      </div>

      {!canPlay ? (
        <>
          <p className="text-sm text-foreground/85 mt-4 line-clamp-3">{activeCall.transcript}</p>
          {activeCall.locked && (
            <button
              onClick={unlock}
              disabled={unlockBusy !== null}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-[#6D28D9]"
            >
              <Lock size={12} />{" "}
              {unlockBusy === "pricing"
                ? "Preparing..."
                : unlockBusy === "approve"
                  ? "Approving..."
                  : unlockBusy === "unlock"
                    ? "Unlocking..."
                    : unlockBusy === "confirm"
                      ? "Confirming..."
                      : `Unlock full report — ${activeCall.subscriptionCost.toFixed(2)} USDC`}
            </button>
          )}
          <Link
            to="/calls/$id"
            params={{ id: activeCall.id }}
            className="ml-3 mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-primary text-primary-light text-xs hover:bg-primary/10"
          >
            Details
          </Link>
        </>
      ) : (
        <p className="text-sm text-foreground/85 mt-4 leading-relaxed">{activeCall.transcript}</p>
      )}

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Score label="Price" value={activeCall.isFreePreview ? "Free" : "0.01 USDC"} />
        <Score label="PnL Summary" value={activeCall.pnlSummary || "Not reported"} />
        <Score label="Biggest Win" value={activeCall.biggestWin || "None logged"} tone="green" />
        <Score label="Biggest Loss" value={activeCall.biggestLoss || "None logged"} tone="red" />
      </div>
    </div>
  );
}

function Score({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div className="sentra-card p-3 !shadow-none">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`font-mono mt-1 text-xs leading-5 line-clamp-2 break-words ${tone === "green" ? "text-[#10B981]" : tone === "red" ? "text-[#EF4444]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
