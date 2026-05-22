// Live Arc Testnet status via JSON-RPC.
// Using Sepolia public RPC as the Arc Testnet bridge endpoint (Arc settles on Ethereum L2 testnet).
// Swap the URL via VITE_ARC_RPC_URL if a dedicated endpoint becomes available.
export const ARC_RPC_URL =
  (import.meta.env.VITE_ARC_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

export const ARC_CHAIN_ID = 11155111; // Sepolia (proxy for Arc Testnet)
export const ARC_NETWORK_NAME = "Arc Testnet";
export const ARC_EXPLORER = "https://sepolia.etherscan.io";

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(ARC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} → ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export async function getArcStatus() {
  const [blockHex, gasHex] = await Promise.all([
    rpc<string>("eth_blockNumber"),
    rpc<string>("eth_gasPrice"),
  ]);
  return {
    blockNumber: parseInt(blockHex, 16),
    gasPriceGwei: parseInt(gasHex, 16) / 1e9,
    network: ARC_NETWORK_NAME,
    chainId: ARC_CHAIN_ID,
  };
}
