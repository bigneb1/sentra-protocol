import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  connect: () => void;
  disconnect: () => void;
}

const WalletCtx = createContext<WalletState | null>(null);
const MOCK_ADDR = "0x9F3a2b7E4c1d8e2A5B6c9D0e1F2a3B4c5D6e7F89";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(localStorage.getItem("sentra_wallet") === "1");
  }, []);
  const connect = () => {
    setConnected(true);
    localStorage.setItem("sentra_wallet", "1");
  };
  const disconnect = () => {
    setConnected(false);
    localStorage.removeItem("sentra_wallet");
  };
  return (
    <WalletCtx.Provider value={{ connected, address: connected ? MOCK_ADDR : null, balance: 500, connect, disconnect }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export function truncate(addr: string, head = 6, tail = 4) {
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
