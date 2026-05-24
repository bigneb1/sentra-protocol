import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { http } from "wagmi";
import type { Chain } from "viem";

// Arc Testnet config. Arc settles on an Ethereum L2 testnet; until the dedicated
// Arc RPC ships publicly we proxy via Sepolia (set VITE_ARC_RPC_URL to override).
export const ARC_RPC_URL =
  (import.meta.env.VITE_ARC_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

export const arcTestnet: Chain = {
  ...sepolia,
  id: 11155111,
  name: "Arc Testnet",
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
};

// Circle USDC on Sepolia (acts as the testnet USDC for Arc settlement).
export const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

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
