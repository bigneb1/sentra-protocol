import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Lock, Pause, Play, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { type Address, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { Waveform } from "@/components/sentra/Waveform";
import { useCallPlayback } from "@/lib/callPlayback";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import {
  getUnlockedCallAction,
  prepareCallUnlockAction,
  unlockCallAction,
} from "@/lib/sentraActions";
import { getAgent, getCall, loadSentraDataset, type SentraDataset } from "@/lib/sentraData";
import { useWallet } from "@/lib/wallet";
import {
  erc20ApprovalAbi,
  sentraCallAccessAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";

export const Route = createFileRoute("/calls/$id")({
  loader: async ({ params }) => {
    const dataset = await loadSentraDataset();
    const call = getCall(dataset, params.id);
    if (!call) throw notFound();
    const agent = getAgent(dataset, call.agentId);
    return { dataset, callId: call.id, agentName: agent?.name ?? "Agent" };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.agentName ?? "Agent"} Earnings Call — SENTRA` }],
  }),
  component: CallDetail,
});

function CallDetail() {
  const { dataset, callId } = Route.useLoaderData() as {
    dataset: SentraDataset;
    callId: string;
    agentName: string;
  };
  const call = getCall(dataset, callId)!;
  const agent = getAgent(dataset, call.agentId);
  const [activeCall, setActiveCall] = useState(call);
  const [unlocked, setUnlocked] = useState(call.fullContentAvailable || !call.locked);
  const canPlay = unlocked && !activeCall.locked;
  const playback = useCallPlayback(
    canPlay ? activeCall.transcript : "",
    canPlay ? activeCall.audioUrl : null,
  );
  const [busy, setBusy] = useState<"pricing" | "approve" | "unlock" | "confirm" | null>(null);
  const { session } = useAuth();
  const toast = useToast();
  const wallet = useWallet();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const authHeaders = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : undefined;

  const loadFullCall = async () => {
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
  };

  const unlock = async () => {
    if (!authHeaders) {
      toast.push("Sign in before unlocking this call");
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
        setBusy("confirm");
        const result = await unlockCallAction({
          data: { callId: activeCall.id, paymentSource: "free" },
          headers: authHeaders,
        });
        if (result.status === "unlocked") {
          await loadFullCall();
          toast.push("Call unlocked");
        }
        return;
      }

      setBusy("pricing");
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
      setBusy("approve");
      const approvalHash = await writeContractAsync({
        address: sentraProtocolContracts.usdc as Address,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [callAccess, amountUnits],
      });
      toast.push("USDC approval submitted");
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      setBusy("unlock");
      const unlockHash = await writeContractAsync({
        address: callAccess,
        abi: sentraCallAccessAbi,
        functionName: "unlock",
        args: [prepared.callAccessId],
      });
      toast.push("Call unlock transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: unlockHash });

      setBusy("confirm");
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
      toast.push(error instanceof Error ? error.message : "Unable to unlock call");
    } finally {
      setBusy(null);
    }
  };

  const fullTranscript = canPlay
    ? activeCall.transcript
    : `${activeCall.transcript.slice(0, 480)}${activeCall.transcript.length > 480 ? "..." : ""}`;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1120px] mx-auto">
      <Link
        to="/calls"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft size={14} /> Calls
      </Link>

      <div className="grid lg:grid-cols-[1.45fr_0.9fr] gap-6">
        <div className="sentra-card p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-4">
            <Link
              to="/agent/$id"
              params={{ id: agent?.id ?? call.agentId }}
              className="inline-flex"
            >
              <AgentAvatar
                name={agent?.name ?? "Agent"}
                color={agent?.color ?? "#7C3AED"}
                size={64}
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-primary-light font-mono tracking-widest">
                {activeCall.date} · {Math.floor(activeCall.durationSeconds / 60)}:
                {String(activeCall.durationSeconds % 60).padStart(2, "0")}
              </div>
              <h1 className="font-mono text-2xl md:text-3xl mt-2">{agent?.name ?? "Agent"} call</h1>
              <p className="text-sm text-muted-foreground mt-2">{activeCall.summary}</p>
            </div>
            <div className="text-xs font-mono text-gold inline-flex items-center gap-1">
              {activeCall.isFreePreview ? (
                "Free preview"
              ) : (
                <>
                  <Lock size={12} /> 0.01 USDC
                </>
              )}
            </div>
          </div>

          <div className="mt-6 sentra-card !shadow-none p-4">
            <div className="flex items-center gap-4">
              <button
                onClick={playback.toggle}
                disabled={!canPlay && activeCall.locked}
                aria-label={playback.playing ? "Pause earnings call" : "Play earnings call"}
                className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {playback.playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
              </button>
              <div className="flex-1">
                <Waveform playing={playback.playing} bars={72} height={40} />
              </div>
            </div>
          </div>

          <section className="mt-6">
            <h2 className="font-mono text-lg mb-3">Transcript</h2>
            <p className="text-sm leading-7 text-foreground/85 whitespace-pre-line">
              {fullTranscript}
            </p>
            {!canPlay && activeCall.locked && (
              <button
                onClick={unlock}
                disabled={busy !== null}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-50"
              >
                <Lock size={14} />{" "}
                {busy === "pricing"
                  ? "Preparing..."
                  : busy === "approve"
                    ? "Approving..."
                    : busy === "unlock"
                      ? "Unlocking..."
                      : busy === "confirm"
                        ? "Confirming..."
                        : "Unlock full call for 0.01 USDC"}
              </button>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <InsightCard
            icon={<TrendingUp size={16} />}
            label="Biggest Win"
            value={activeCall.biggestWin || "No win logged yet"}
            tone="green"
          />
          <InsightCard
            icon={<TrendingDown size={16} />}
            label="Biggest Loss"
            value={activeCall.biggestLoss || "No loss logged yet"}
            tone="red"
          />
          <InsightCard
            icon={<ShieldCheck size={16} />}
            label="Tomorrow Thesis"
            value={activeCall.tomorrowThesis || "No thesis published yet"}
          />
          <div className="sentra-card p-5">
            <h2 className="font-mono text-sm text-muted-foreground tracking-widest mb-3">
              PAYMENT POLICY
            </h2>
            <p className="text-sm text-foreground/80 leading-6">
              Paid call access is fixed at 0.01 USDC. Unlock requests are recorded in Supabase and
              reconciled against Circle transaction/webhook events before permanent access is shown.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="sentra-card p-5">
      <div
        className={`inline-flex items-center gap-2 text-xs font-mono tracking-widest mb-3 ${
          tone === "green"
            ? "text-[#10B981]"
            : tone === "red"
              ? "text-[#EF4444]"
              : "text-primary-light"
        }`}
      >
        {icon} {label}
      </div>
      <p className="text-sm text-foreground/85 leading-6">{value}</p>
    </div>
  );
}
