import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount, useBalance, useDisconnect, useSwitchChain, useChainId } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { arcTestnet, USDC_ADDRESS } from "./wagmi";

interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  chainOk: boolean;
  connect: () => void;
  disconnect: () => void;
  switchToArc: () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: usdc } = useBalance({
    address,
    token: USDC_ADDRESS,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const value = useMemo<WalletState>(
    () => ({
      connected: isConnected,
      address: address ?? null,
      balance: usdc ? Number(usdc.formatted) : 0,
      chainOk: chainId === arcTestnet.id,
      connect: () => openConnectModal?.(),
      disconnect: () => disconnect(),
      switchToArc: () => switchChain({ chainId: arcTestnet.id }),
    }),
    [isConnected, address, usdc, chainId, openConnectModal, disconnect, switchChain],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export function truncate(addr: string, head = 6, tail = 4) {
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
