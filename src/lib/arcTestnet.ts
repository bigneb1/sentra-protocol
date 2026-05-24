// Live Arc Testnet status via JSON-RPC.
export const ARC_RPC_URL =
  (import.meta.env.VITE_ARC_RPC_URL as string | undefined) ?? "https://rpc.testnet.arc.network";
export const ARC_RPC_WS_URL =
  (import.meta.env.VITE_ARC_RPC_WS_URL as string | undefined) ?? "wss://rpc.testnet.arc.network";

export const ARC_CHAIN_ID = 5042002;
export const ARC_CHAIN_ID_HEX = "0x4cef52";
export const ARC_CIRCLE_BLOCKCHAIN = "ARC-TESTNET";
export const ARC_CCTP_DOMAIN = 26;
export const ARC_NETWORK_NAME = "Arc Testnet";
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;
export const ARC_ERC8004_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const ARC_ERC8004_REPUTATION_REGISTRY =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
export const ARC_ERC8004_VALIDATION_REGISTRY =
  "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const;
// Arc native gas is represented internally with 18 decimals; the ERC-20 USDC
// interface and product displays use 6 decimals.
export const ARC_NATIVE_CURRENCY_DECIMALS = 18;
export const ARC_USDC_DECIMALS = 6;
export const ARC_REQUIRED_CONFIRMATIONS = 1;

export const ARC_GATEWAY = {
  apiBaseUrl: "https://gateway-api-testnet.circle.com/v1/",
  wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  minter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
  domain: ARC_CCTP_DOMAIN,
} as const;

export const ARC_ERC8004_REGISTRIES = {
  identity: ARC_ERC8004_IDENTITY_REGISTRY,
  reputation: ARC_ERC8004_REPUTATION_REGISTRY,
  validation: ARC_ERC8004_VALIDATION_REGISTRY,
} as const;

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
  const gasPriceWei = BigInt(gasHex);
  const gasPriceUsdc = Number(gasPriceWei) / 10 ** ARC_NATIVE_CURRENCY_DECIMALS;
  return {
    blockNumber: parseInt(blockHex, 16),
    gasPriceMicroUsdc: gasPriceUsdc * 10 ** ARC_USDC_DECIMALS,
    network: ARC_NETWORK_NAME,
    chainId: ARC_CHAIN_ID,
  };
}
