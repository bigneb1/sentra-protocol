import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Swords,
  Radio,
  Coins,
  PieChart,
  UserPlus,
  Wallet,
  Menu,
  X,
  BarChart3,
  LogIn,
  LogOut,
  BookOpen,
  Network,
  CandlestickChart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

import { useWallet, truncate } from "@/lib/wallet";
import { clearWalletSession, readWalletSession } from "@/lib/walletSession";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_NAME,
  ARC_RPC_URL,
  ARC_USDC_ADDRESS,
} from "@/lib/arcTestnet";

const nav = [
  { to: "/markets", label: "Markets", icon: CandlestickChart },
  { to: "/arena", label: "Arena", icon: Swords },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/calls", label: "Calls", icon: Radio },
  { to: "/delegate", label: "Delegate", icon: Coins },
  { to: "/portfolio", label: "Portfolio", icon: PieChart },
  { to: "/register", label: "Register Agent", icon: UserPlus },
  { to: "/docs", label: "Docs", icon: BookOpen },
] as const;

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { connected, address, balance, chainOk, switchToArc, disconnect } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletSigned, setWalletSigned] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);

  useEffect(() => {
    const sync = () => setWalletSigned(Boolean(readWalletSession(address)));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("sentra-wallet-session", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sentra-wallet-session", sync);
    };
  }, [address]);

  if (path === "/login") return <Outlet />;

  // Landing page = no sidebar chrome
  if (path === "/") {
    return <Outlet />;
  }
  const userLabel = address ? truncate(address) : "Wallet signed";
  const disconnectWallet = () => {
    clearWalletSession();
    disconnect();
  };
  const openArc = () => {
    if (!chainOk) switchToArc();
    setChainOpen((value) => !value);
  };

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
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r" />
                )}
                <Icon size={18} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          {walletSigned ? (
            <button
              onClick={() => {
                clearWalletSession();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-elevated hover:bg-primary/10 text-left text-xs"
            >
              <LogOut size={14} className="text-primary-light" />
              <span className="flex-1 truncate font-mono">{userLabel}</span>
            </button>
          ) : (
            <Link
              to="/login"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-primary/10 text-xs"
            >
              <LogIn size={14} /> Sign in
            </Link>
          )}
          {connected && address ? (
            <button
              onClick={disconnectWallet}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md bg-elevated hover:bg-primary/10 transition-colors text-left"
            >
              <Wallet size={16} className="text-primary-light" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs truncate text-foreground">
                  {truncate(address)}
                </div>
                <div className="text-[11px] text-muted-foreground">${balance.toFixed(2)} USDC</div>
              </div>
            </button>
          ) : (
            <Link
              to="/login"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary hover:bg-[#6D28D9] text-primary-foreground text-sm font-medium transition-colors"
            >
              <Wallet size={16} /> Wallet sign-in
            </Link>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar desktop */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
          <div />
          <div className="flex items-center gap-3">
            <ArcChainButton chainOk={chainOk} open={chainOpen} onClick={openArc} />
            {connected && address ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="font-mono">{truncate(address)}</span>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-1.5 rounded-md bg-primary hover:bg-[#6D28D9] text-primary-foreground text-sm font-medium transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* Top bar mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 z-40 bg-background">
          <Link to="/" onClick={() => setMobileOpen(false)}>
            <Logo size={22} />
          </Link>
          <div className="flex items-center gap-2">
            <ArcChainButton compact chainOk={chainOk} open={chainOpen} onClick={openArc} />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2"
              aria-label="Toggle menu"
            >
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
                      active
                        ? "text-primary-light bg-primary/10 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-elevated"
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
                    onClick={() => {
                      disconnectWallet();
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md bg-elevated text-left"
                  >
                    <Wallet size={16} className="text-primary-light" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs truncate">{truncate(address)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        ${balance.toFixed(2)} USDC · Tap to disconnect
                      </div>
                    </div>
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => {
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
                  >
                    <Wallet size={16} />
                    Wallet sign-in
                  </Link>
                )}
              </div>
            </div>
          </>
        )}

        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card z-40 grid grid-cols-6">
          {nav.slice(0, 6).map((n) => {
            const active = path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] ${active ? "text-primary-light" : "text-muted-foreground"}`}
              >
                <Icon size={18} />
                <span className="truncate max-w-[50px]">{n.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function ArcChainButton({
  chainOk,
  open,
  compact = false,
  onClick,
}: {
  chainOk: boolean;
  open: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        title="Arc Testnet chain selector"
        className={`flex items-center gap-2 rounded-full font-medium ${compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}`}
        style={{
          background: "rgba(249,115,22,0.12)",
          color: "#F97316",
          border: "1px solid rgba(249,115,22,0.3)",
        }}
      >
        <span className="w-5 h-5 rounded-full bg-[#F97316] text-[#12082A] inline-flex items-center justify-center">
          <Network size={compact ? 11 : 12} />
        </span>
        {compact ? "Arc" : ARC_NETWORK_NAME}
        <span
          className={`w-2 h-2 rounded-full ${chainOk ? "bg-[#10B981] dot-pulse" : "bg-[#EF4444]"}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[260px] rounded-md border border-border bg-card p-4 shadow-xl z-50 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F97316] text-[#12082A] inline-flex items-center justify-center">
              <Network size={17} />
            </div>
            <div>
              <div className="font-mono text-sm text-foreground">{ARC_NETWORK_NAME}</div>
              <div className="text-muted-foreground">Chain ID {ARC_CHAIN_ID}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-muted-foreground">
            <div className="flex justify-between gap-3">
              <span>Token</span>
              <span className="font-mono text-foreground">USDC</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>USDC</span>
              <span className="font-mono text-foreground truncate max-w-[150px]">
                {ARC_USDC_ADDRESS}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>RPC</span>
              <span className="font-mono text-foreground truncate max-w-[150px]">
                {ARC_RPC_URL.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>
          <a
            href={ARC_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block rounded border border-primary px-3 py-2 text-center text-primary-light hover:bg-primary/10"
          >
            Open Explorer
          </a>
          {!chainOk && (
            <div className="mt-3 rounded bg-[#EF4444]/10 px-3 py-2 text-[#FCA5A5]">
              Wrong network. Click the Arc chip again to request Arc Testnet in your wallet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
