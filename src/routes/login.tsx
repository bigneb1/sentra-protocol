import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { ArrowLeft, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/sentra/Logo";
import { useToast } from "@/lib/toast";
import { arcTestnet } from "@/lib/wagmi";
import { truncate, useWallet } from "@/lib/wallet";
import { siweWalletSignInAction } from "@/lib/sentraActions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SENTRA" },
      {
        name: "description",
        content: "Sign in with an Arc wallet.",
      },
    ],
  }),
  component: Login,
});

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function walletSignInMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/web3 provider is disabled/i.test(message)) {
    return "Supabase Web3 wallet auth is disabled and the server SIWE fallback did not complete.";
  }
  return message;
}

function Login() {
  const nav = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState<"wallet" | null>(null);

  const walletSignIn = async () => {
    setBusy("wallet");
    try {
      if (!wallet.connected || !address) {
        wallet.connect();
        toast.push("Choose a wallet, then sign the SENTRA login message");
        return;
      }

      if (!wallet.chainOk) {
        wallet.switchToArc();
        toast.push("Switching wallet to Arc Testnet before signing");
        return;
      }

      const now = new Date();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to SENTRA Protocol on Arc Testnet.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId || arcTestnet.id,
        nonce: randomNonce(),
        issuedAt: now,
        expirationTime: new Date(now.getTime() + 10 * 60 * 1000),
      });
      const signature = await signMessageAsync({ message });
      const { error } = await supabase.auth.signInWithWeb3({
        chain: "ethereum",
        message,
        signature,
      });
      if (error) {
        if (!/web3 provider is disabled/i.test(error.message)) throw error;
        const fallback = await siweWalletSignInAction({
          data: { message, signature },
        });
        const { error: otpError } = await supabase.auth.verifyOtp({
          email: fallback.email,
          token: fallback.token,
          type: "email",
        });
        if (otpError) throw otpError;
      }
      toast.push("Wallet signed in");
      nav({ to: "/arena" });
    } catch (err: unknown) {
      const message = walletSignInMessage(err);
      toast.push(`Wallet sign-in failed: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo size={32} />
          <h1 className="font-mono text-2xl">Sign in</h1>
          <p className="text-xs text-muted-foreground text-center">
            Connect an Arc wallet and sign once to enter SENTRA.
          </p>
        </div>

        <div>
          <button
            onClick={walletSignIn}
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-primary text-primary-light hover:bg-primary/10 transition text-sm font-medium disabled:opacity-50"
          >
            {busy === "wallet" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : wallet.connected && wallet.address ? (
              <CheckCircle2 size={15} />
            ) : (
              <Wallet size={15} />
            )}
            {wallet.connected && wallet.address
              ? `Sign with ${truncate(wallet.address)}`
              : "Connect wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}
