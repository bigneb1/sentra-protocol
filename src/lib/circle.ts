// Circle integrations. Two surfaces:
//   1. USDC ERC-20 reads (live, no API key).
//   2. Circle Programmable Wallets (W3S) — initialised lazily, requires
//      VITE_CIRCLE_APP_ID + server-issued user token. Safe to import on the
//      client; the SDK is only constructed when initCircleW3S() is called.

import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { arcTestnet, USDC_ADDRESS } from "./wagmi";

export const usdcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export async function readUsdcBalance(address: `0x${string}`): Promise<number> {
  const [raw, decimals] = await Promise.all([
    usdcClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    usdcClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  return Number(formatUnits(raw as bigint, Number(decimals)));
}

export async function readUsdcTotalSupply(): Promise<number> {
  const [raw, decimals] = await Promise.all([
    usdcClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "totalSupply",
    }),
    usdcClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  return Number(formatUnits(raw as bigint, Number(decimals)));
}

// --- Circle Programmable Wallets (W3S) ---
// Init is lazy + idempotent so the page never crashes if the App ID is missing.
let w3sSdk: unknown = null;

export async function initCircleW3S(userToken: string, encryptionKey: string) {
  const appId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined;
  if (!appId) {
    throw new Error("VITE_CIRCLE_APP_ID is not configured");
  }
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  const sdk = new W3SSdk({ appSettings: { appId } });
  sdk.setAuthentication({ userToken, encryptionKey });
  w3sSdk = sdk;
  return sdk;
}

export function getCircleW3S() {
  return w3sSdk;
}
