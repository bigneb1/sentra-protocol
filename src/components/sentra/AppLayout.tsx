import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Swords, Radio, Coins, PieChart, UserPlus, Wallet, Menu, X, BarChart3, LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";

import { useWallet, truncate } from "@/lib/wallet";
import { useAuth } from "@/lib/auth";

const nav = [
  { to: "/arena",     label: "Arena",         icon: Swords },
  { to: "/analytics", label: "Analytics",     icon: BarChart3 },
  { to: "/calls",     label: "Calls",         icon: Radio },
  { to: "/delegate",  label: "Delegate",      icon: Coins },
  { to: "/portfolio", label: "Portfolio",     icon: PieChart },
  { to: "/register",  label: "Register Agent",icon: UserPlus },
] as const;

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { connected, address, balance, connect, disconnect } = useWallet();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (path === "/login") return <Outlet />;

  // Landing page = no sidebar chrome
  if (path === "/") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border bg-card sticky top-0 h-screen">
        <Link to="/" className="px-5 py-5 flex items-center gap-2 border-b border-border">
          <Logo size={24} />
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
        </Link>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {nav.map((n) => {
            const active = path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors relative ${
                  active
                    ? "text-primary-light bg-primary/10 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-elevated"
                }`}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r" />}
                <Icon size={18} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          {user ? (
            <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-elevated hover:bg-primary/10 text-left text-xs">
              <LogOut size={14} className="text-primary-light" />
              <span className="flex-1 truncate font-mono">{user.email}</span>
            </button>
          ) : (
            <Link to="/login" className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-primary/10 text-xs">
              <LogIn size={14} /> Sign in
            </Link>
          )}
          {connected && address ? (
            <button onClick={disconnect} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md bg-elevated hover:bg-primary/10 transition-colors text-left">
              <Wallet size={16} className="text-primary-light" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs truncate text-foreground">{truncate(address)}</div>
                <div className="text-[11px] text-muted-foreground">${balance.toFixed(2)} USDC</div>
              </div>
            </button>
          ) : (
            <button onClick={connect} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary hover:bg-[#6D28D9] text-primary-foreground text-sm font-medium transition-colors">
              <Wallet size={16} /> Connect Wallet
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar desktop */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
          <div />
          <div className="flex items-center gap-3">
            <div
              title="Running on Arc Network testnet. Sub-second finality. USDC-native fees."
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "rgba(249,115,22,0.12)", color: "#F97316", border: "1px solid rgba(249,115,22,0.3)" }}
            >
              <span className="w-2 h-2 rounded-full bg-[#F97316] dot-pulse" />
              Arc Testnet
            </div>
            {connected && address ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="font-mono">{truncate(address)}</span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="px-4 py-1.5 rounded-md bg-primary hover:bg-[#6D28D9] text-primary-foreground text-sm font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* Top bar mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 z-40 bg-background">
          <Link to="/" onClick={() => setMobileOpen(false)}><Logo size={22} /></Link>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium"
              style={{ background: "rgba(249,115,22,0.12)", color: "#F97316", border: "1px solid rgba(249,115,22,0.3)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] dot-pulse" />
              Arc
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2" aria-label="Toggle menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {/* Mobile menu drawer */}
        {mobileOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 top-[57px] bg-background/80 backdrop-blur-sm z-30"
              onClick={() => setMobileOpen(false)}
            />
            <div className="md:hidden fixed top-[57px] left-0 right-0 bg-card border-b border-border z-40 p-4 flex flex-col gap-1 shadow-lg">
              {nav.map((n) => {
                const active = path.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors ${
                      active ? "text-primary-light bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-elevated"
                    }`}
                  >
                    <Icon size={18} />
                    {n.label}
                  </Link>
                );
              })}
              <div className="border-t border-border mt-2 pt-3">
                {connected && address ? (
                  <button
                    onClick={() => { disconnect(); setMobileOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md bg-elevated text-left"
                  >
                    <Wallet size={16} className="text-primary-light" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs truncate">{truncate(address)}</div>
                      <div className="text-[11px] text-muted-foreground">${balance.toFixed(2)} USDC · Tap to disconnect</div>
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => { connect(); setMobileOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
                  >
                    <Wallet size={16} />
                    Connect Wallet
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card z-40 grid grid-cols-5">
          {nav.map((n) => {
            const active = path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-1 py-2 text-[10px] ${active ? "text-primary-light" : "text-muted-foreground"}`}>
                <Icon size={18} />
                <span className="truncate max-w-[60px]">{n.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
