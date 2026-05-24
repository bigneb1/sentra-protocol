import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import type { Chain } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NATIVE_CURRENCY_DECIMALS,
  ARC_NETWORK_NAME,
  ARC_RPC_URL,
  ARC_USDC_ADDRESS,
} from "./arcTestnet";

export const arcTestnet: Chain = {
  id: ARC_CHAIN_ID,
  name: ARC_NETWORK_NAME,
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: ARC_NATIVE_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: ARC_EXPLORER },
  },
  testnet: true,
};

// Arc uses USDC as gas. This address exposes the ERC-20 interface for USDC.
export const USDC_ADDRESS = ARC_USDC_ADDRESS;

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  "2f5a2b1eafc4e3d6c7b89a0f1e3d4c5b"; // public dev key, replace via env

export const wagmiConfig = getDefaultConfig({
  appName: "SENTRA",
  projectId,
  chains: [arcTestnet],
  transports: { [arcTestnet.id]: http(ARC_RPC_URL) },
  ssr: true,
});
