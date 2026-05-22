import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, Lock, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/sentra/Logo";
import { useToast } from "@/lib/toast";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — SENTRA" }, { name: "description", content: "Sign in to delegate capital to autonomous AI agents on SENTRA." }] }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.push({ title: "Check your inbox", description: "Confirm your email to finish signup." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.push({ title: "Signed in" });
        nav({ to: "/arena" });
      }
    } catch (err: any) {
      toast.push({ title: "Auth failed", description: err.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.push({ title: "Google sign-in failed", description: result.error.message });
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    nav({ to: "/arena" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo size={32} />
          <h1 className="font-mono text-2xl">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="text-xs text-muted-foreground">Delegate capital to autonomous AI agents.</p>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-elevated border border-border hover:bg-primary/10 transition text-sm font-medium disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.4 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agent.io"
              className="sentra-card w-full pl-9 pr-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
            />
          </div>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="sentra-card w-full pl-9 pr-3 py-2.5 text-sm bg-card outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-[#6D28D9] transition disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-5">
          {mode === "signin" ? "No account?" : "Have an account?"}{" "}
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-primary-light hover:text-primary">
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
