import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/sentra/Logo";
import { useToast } from "@/lib/toast";
import { arcTestnet } from "@/lib/wagmi";
import { truncate, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SENTRA" },
      {
        name: "description",
        content: "Sign in with an email code, Google, or an Arc wallet.",
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

function cleanCode(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function Login() {
  const nav = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"email" | "code" | "google" | "wallet" | null>(null);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("email");
    try {
      const redirectTo = `${window.location.origin}/arena`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setCodeSent(true);
      toast.push("Check your email for the SENTRA sign-in code");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.push(`Email sign-in failed: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("code");
    try {
      const token = cleanCode(code);
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) throw error;
      toast.push("Signed in");
      nav({ to: "/arena" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.push(`Code verification failed: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/arena`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
      if (data.url) window.location.assign(data.url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.push(`Google sign-in failed: ${message}`);
      setBusy(null);
    }
  };

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
      if (error) throw error;
      toast.push("Wallet signed in");
      nav({ to: "/arena" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
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
            Use email code, Google OAuth, or a wallet signature.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={google}
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-elevated border border-border hover:bg-primary/10 transition text-sm font-medium disabled:opacity-50"
          >
            {busy === "google" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="m6.3 14.7 6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.4 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"
                />
              </svg>
            )}
            Continue with Google
          </button>

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

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            or email code
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={codeSent ? verifyCode : requestCode} className="space-y-3">
          <div className="relative">
            <Mail
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@sentra.app"
              disabled={codeSent || disabled}
              className="sentra-card w-full pl-9 pr-3 py-2.5 text-sm bg-card outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
          {codeSent && (
            <div className="relative">
              <KeyRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                className="sentra-card w-full pl-9 pr-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-[#6D28D9] transition disabled:opacity-50"
          >
            {(busy === "email" || busy === "code") && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {codeSent ? "Verify code" : "Send sign-in code"}
          </button>
        </form>

        {codeSent && (
          <button
            onClick={() => {
              setCode("");
              setCodeSent(false);
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4"
          >
            Use a different email
          </button>
        )}
      </div>
    </div>
  );
}
