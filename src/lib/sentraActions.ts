import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddressEqual,
  keccak256,
  parseUnits,
  toHex,
} from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { erc8004IdentityRegistryAbi } from "@/contracts/arcErc8004";
import {
  sentraAgentRegistryAbi,
  sentraCallAccessAbi,
  sentraDelegationVaultAbi,
  sentraStakeVaultAbi,
} from "@/contracts/sentraProtocol";
import type { Json } from "@/integrations/supabase/types";
import {
  ARC_CHAIN_ID,
  ARC_CIRCLE_BLOCKCHAIN,
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_EXPLORER,
  ARC_NATIVE_CURRENCY_DECIMALS,
  ARC_NETWORK_NAME,
  ARC_RPC_URL,
  ARC_USDC_ADDRESS,
} from "@/lib/arcTestnet";
import { SENTRA_ARC_TESTNET_DEPLOYMENT } from "@/lib/agentTypes";
import type { Agent } from "@/lib/sentraData";
import {
  computeBrierScore,
  computeNextReputation,
  computeReputationDelta,
} from "@/lib/sentraScoring";
import type { AgentStrategy } from "@/lib/agentTypes";

const strategies = ["Macro", "Sports", "Contrarian", "Yield", "Tech", "Custom"] as const;

const money = z.number().finite().min(0).max(100_000_000);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]+$/);
const callIdSchema = z.string().min(1).max(128);

const arcChain = {
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
} as const;

const arcPublicClient = createPublicClient({
  chain: arcChain,
  transport: http(ARC_RPC_URL),
});

const riskLimitsSchema = z.object({
  maxDailyLossUsdc: money,
  maxOpenPositions: z.number().int().min(1).max(100),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  maxLeverage: z.number().finite().min(1).max(20),
});

const WALLET_AUTH_USER_PREFIX = "wallet:";

type AuthContext = {
  userId: string;
  walletAddress: `0x${string}`;
};

function getAuthContext(context: unknown): AuthContext {
  const auth = context as Partial<AuthContext>;
  if (!auth.userId || !auth.walletAddress) throw new Error("Wallet sign-in required");
  return { userId: auth.userId, walletAddress: auth.walletAddress };
}

type ProtocolContracts = {
  agentRegistry: string;
  stakeVault: string;
  delegationVault: string;
  predictionRegistry: string;
  reputationOracle: string;
  slashingModule: string;
  callAccess: string;
};

function walletUserId(addressValue: string) {
  return `${WALLET_AUTH_USER_PREFIX}${addressValue.toLowerCase()}`;
}

function normalizeHeader(value: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getWalletHeaders() {
  const request = getRequest();
  const walletAddress = normalizeHeader(request?.headers.get("x-sentra-wallet-address") ?? null);
  const rawMessage = normalizeHeader(request?.headers.get("x-sentra-wallet-message") ?? null);
  const encoding = normalizeHeader(
    request?.headers.get("x-sentra-wallet-message-encoding") ?? null,
  );
  const signature = normalizeHeader(request?.headers.get("x-sentra-wallet-signature") ?? null);
  if (!walletAddress || !rawMessage || !signature) return null;
  const message = encoding === "base64url" ? decodeBase64Url(rawMessage) : rawMessage;
  return { walletAddress, message, signature };
}

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getOptionalSupabaseAdmin() {
  if (
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    return null;
  }
  try {
    return await getSupabaseAdmin();
  } catch {
    return null;
  }
}

function getProtocolContracts(): ProtocolContracts {
  return {
    agentRegistry:
      process.env.VITE_SENTRA_AGENT_REGISTRY_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.agentRegistry,
    stakeVault:
      process.env.VITE_SENTRA_STAKE_VAULT_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.stakeVault,
    delegationVault:
      process.env.VITE_SENTRA_DELEGATION_VAULT_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.delegationVault,
    predictionRegistry:
      process.env.VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.predictionRegistry,
    reputationOracle:
      process.env.VITE_SENTRA_REPUTATION_ORACLE_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.reputationOracle,
    slashingModule:
      process.env.VITE_SENTRA_SLASHING_MODULE_ADDRESS ??
      SENTRA_ARC_TESTNET_DEPLOYMENT.slashingModule,
    callAccess:
      process.env.VITE_SENTRA_CALL_ACCESS_ADDRESS ?? SENTRA_ARC_TESTNET_DEPLOYMENT.callAccess,
  };
}

function missingProtocolContracts() {
  return Object.entries(getProtocolContracts())
    .filter(([, value]) => !value)
    .map(([key]) => `VITE_SENTRA_${key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}_ADDRESS`);
}

function missingCircleEnv() {
  return [
    !process.env.CIRCLE_API_KEY && "CIRCLE_API_KEY",
    !(process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET) && "ENTITY_SECRET",
  ].filter(Boolean) as string[];
}

function slugify(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "agent";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hashJson(value: unknown) {
  return keccak256(toHex(stableJson(value)));
}

function hashText(value: string) {
  return keccak256(toHex(value));
}

function callAccessId(callId: string) {
  return `0x${callId.replace(/-/g, "").padEnd(64, "0")}` as `0x${string}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function callPriceUnits(price: number) {
  return parseUnits(price.toFixed(6), 6);
}

async function runtimeFullCall(callId: string): Promise<{
  id: string;
  agentId: string;
  date: string;
  durationSeconds: number;
  transcript: string;
  pnlSummary: string;
  biggestWin: string;
  biggestLoss: string;
  tomorrowThesis: string;
  audioUrl: string | null;
  subscriptionCost: number;
  isFreePreview: boolean;
}> {
  const { runtimeBaseUrl } = await import("@/lib/runtimeDataset");
  const baseUrl = runtimeBaseUrl();
  const secret = process.env.SENTRA_AGENT_WORKER_SECRET ?? process.env.SENTRA_RUNTIME_SECRET;
  if (!baseUrl) throw new Error("SENTRA agent runtime URL is not configured");
  if (!secret) throw new Error("SENTRA_AGENT_WORKER_SECRET is required for full runtime calls");

  const response = await fetch(`${baseUrl}/calls/${encodeURIComponent(callId)}`, {
    headers: {
      accept: "application/json",
      "x-sentra-runtime-secret": secret,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Runtime call fetch failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return (await response.json()) as {
    id: string;
    agentId: string;
    date: string;
    durationSeconds: number;
    transcript: string;
    pnlSummary: string;
    biggestWin: string;
    biggestLoss: string;
    tomorrowThesis: string;
    audioUrl: string | null;
    subscriptionCost: number;
    isFreePreview: boolean;
  };
}

async function runtimePreviewCall(callId: string) {
  const { loadRuntimeDataset } = await import("@/lib/runtimeDataset");
  const runtime = await loadRuntimeDataset();
  return runtime?.earningsCalls.find((item) => item.id === callId) ?? null;
}

async function verifyOnchainCallUnlock(input: {
  callId: string;
  price: number;
  txHash: string;
  payerAddress: string;
}) {
  const contracts = getProtocolContracts();
  const callAccess = requireContractAddress(contracts.callAccess, "Call access");
  const receipt = await arcPublicClient.getTransactionReceipt({
    hash: input.txHash as `0x${string}`,
  });
  if (receipt.status !== "success") throw new Error("Unlock transaction was not successful");
  if (!sameAddress(receipt.to, callAccess)) {
    throw new Error("Unlock transaction did not target the call access contract");
  }

  const expectedPrice = callPriceUnits(input.price);
  const id = callAccessId(input.callId);
  const onchainPrice = await arcPublicClient.readContract({
    address: callAccess,
    abi: sentraCallAccessAbi,
    functionName: "priceByCall",
    args: [id],
  });
  if (onchainPrice !== expectedPrice) {
    throw new Error("On-chain call price does not match the SENTRA price");
  }

  const unlockedEvent = findEventArgs<{
    callId?: `0x${string}`;
    subscriber?: `0x${string}`;
    price?: bigint;
  }>(receipt, callAccess, sentraCallAccessAbi, "CallUnlocked");
  if (!unlockedEvent) throw new Error("CallUnlocked event not found in unlock tx");
  if (unlockedEvent.callId?.toLowerCase() !== id.toLowerCase()) {
    throw new Error("Unlock transaction used a different call id");
  }
  if (!sameAddress(unlockedEvent.subscriber, input.payerAddress)) {
    throw new Error("Unlock transaction payer does not match the connected wallet");
  }
  if (unlockedEvent.price !== expectedPrice) {
    throw new Error("Unlock transaction amount does not match the required 0.01 USDC");
  }

  const hasAccess = await arcPublicClient.readContract({
    address: callAccess,
    abi: sentraCallAccessAbi,
    functionName: "hasAccess",
    args: [id, input.payerAddress as `0x${string}`],
  });
  if (!hasAccess) throw new Error("Call access was not recorded on-chain");

  return { callAccess, receipt };
}

async function runtimeCallHasAccess(callId: string, payerAddress: string) {
  const contracts = getProtocolContracts();
  if (!contracts.callAccess) return false;
  try {
    return await arcPublicClient.readContract({
      address: contracts.callAccess as `0x${string}`,
      abi: sentraCallAccessAbi,
      functionName: "hasAccess",
      args: [callAccessId(callId), payerAddress as `0x${string}`],
    });
  } catch {
    return false;
  }
}

function usdcUnits(amount: number) {
  return parseUnits(amount.toFixed(6), 6);
}

function publicAppUrl() {
  const configured =
    process.env.SENTRA_PUBLIC_APP_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return (configured ?? "https://sentra-protocol.vercel.app").replace(/\/+$/, "");
}

function appDomain() {
  try {
    return new URL(publicAppUrl()).host;
  } catch {
    return "sentra-protocol.vercel.app";
  }
}

function agentMetadataUri(agentId: string) {
  return `${publicAppUrl()}/api/agent-metadata/${agentId}`;
}

function runtimeRequestHeaders() {
  const secret = process.env.SENTRA_AGENT_WORKER_SECRET ?? process.env.SENTRA_RUNTIME_SECRET;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-sentra-runtime-secret"] = secret;
  return headers;
}

async function runtimeCreateAgent(input: {
  ownerId: string;
  ownerAddress: `0x${string}`;
  slug: string;
  name: string;
  strategy: AgentStrategy;
  description: string;
  registryAgentId: `0x${string}`;
  metadataHash: `0x${string}`;
  strategyHash: `0x${string}`;
  riskHash: `0x${string}`;
  predictionKeyHash: `0x${string}`;
  stakeUsdc: number;
  delegationCapUsdc: number;
  riskLimits: Agent["riskLimits"];
  autoCalls: boolean;
}) {
  const { runtimeBaseUrl } = await import("@/lib/runtimeDataset");
  const baseUrl = runtimeBaseUrl();
  if (!baseUrl) throw new Error("SENTRA agent runtime URL is not configured");

  const response = await fetch(`${baseUrl}/agents`, {
    method: "POST",
    headers: runtimeRequestHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Runtime agent create failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return (await response.json()) as {
    status: "created" | "updated";
    agentId: string;
    slug: string;
    databaseId: string;
    metadataUri: string;
    treasuryAddress: `0x${string}`;
    circleWalletId: string;
  };
}

async function runtimeRecordAgentDeployment(input: {
  agentId: string;
  ownerAddress: `0x${string}`;
  agentWalletAddress?: `0x${string}`;
  registryAgentId?: `0x${string}`;
  arcErc8004Id: string;
  erc8004TxHash: `0x${string}`;
  registryTxHash: `0x${string}`;
  stakeTxHash?: `0x${string}`;
  stakeUsdc: number;
}) {
  const { runtimeBaseUrl } = await import("@/lib/runtimeDataset");
  const baseUrl = runtimeBaseUrl();
  if (!baseUrl) throw new Error("SENTRA agent runtime URL is not configured");

  const response = await fetch(
    `${baseUrl}/agents/${encodeURIComponent(input.agentId)}/deployment`,
    {
      method: "POST",
      headers: runtimeRequestHeaders(),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Runtime deployment record failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return (await response.json()) as { status: "recorded"; agentId: string };
}

async function runtimeRecordDelegation(input: {
  agentId: string;
  userId: string;
  walletAddress: `0x${string}`;
  amountUsdc: number;
  txHash?: `0x${string}`;
  status: "pending" | "active";
}) {
  const { runtimeBaseUrl } = await import("@/lib/runtimeDataset");
  const baseUrl = runtimeBaseUrl();
  if (!baseUrl) return null;

  const response = await fetch(`${baseUrl}/delegations`, {
    method: "POST",
    headers: runtimeRequestHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) return null;
  return (await response.json()) as { status: "recorded"; delegationId: string };
}

async function runtimeRecordWithdrawal(input: {
  delegationId: string;
  walletAddress: `0x${string}`;
  amountUsdc: number;
  txHash?: `0x${string}`;
  status: "created" | "confirmed";
}) {
  const { runtimeBaseUrl } = await import("@/lib/runtimeDataset");
  const baseUrl = runtimeBaseUrl();
  if (!baseUrl) return null;

  const response = await fetch(`${baseUrl}/withdrawals`, {
    method: "POST",
    headers: runtimeRequestHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) return null;
  return (await response.json()) as { status: "recorded"; transactionId: string };
}

function sameAddress(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    return isAddressEqual(a as `0x${string}`, b as `0x${string}`);
  } catch {
    return false;
  }
}

async function verifyAgentDeploymentOnArc(input: {
  registryAgentId: `0x${string}`;
  metadataUri?: string | null;
  ownerAddress: string;
  agentWalletAddress?: string | null;
  arcErc8004Id: string;
  erc8004TxHash: string;
  registryTxHash: string;
  stakeTxHash?: string;
  stakeUsdc: number;
}) {
  const contracts = getProtocolContracts();
  const registry = requireContractAddress(contracts.agentRegistry, "Agent registry");
  const stakeVault = requireContractAddress(contracts.stakeVault, "Stake vault");
  const erc8004Id = BigInt(input.arcErc8004Id);

  await requireSuccessfulReceipt(input.erc8004TxHash, ARC_ERC8004_IDENTITY_REGISTRY);
  const registryReceipt = await requireSuccessfulReceipt(input.registryTxHash, registry);
  const registeredEvent = findEventArgs<{
    agentId?: `0x${string}`;
    owner?: `0x${string}`;
    wallet?: `0x${string}`;
    erc8004Id?: bigint;
  }>(registryReceipt, registry, sentraAgentRegistryAbi, "AgentRegistered");
  if (!registeredEvent) throw new Error("AgentRegistered event not found in registry tx");
  if (registeredEvent.agentId?.toLowerCase() !== input.registryAgentId.toLowerCase()) {
    throw new Error("Registry transaction registered a different agent id");
  }
  if (!sameAddress(registeredEvent.owner, input.ownerAddress)) {
    throw new Error("Registry transaction owner does not match the connected wallet");
  }
  if (registeredEvent.erc8004Id !== erc8004Id) {
    throw new Error("Registry transaction recorded a different ERC-8004 id");
  }

  const [isRegistered, registryErc8004Id, registryOwner, registryWallet, erc8004Owner, tokenUri] =
    await Promise.all([
      arcPublicClient.readContract({
        address: registry,
        abi: sentraAgentRegistryAbi,
        functionName: "isRegistered",
        args: [input.registryAgentId],
      }),
      arcPublicClient.readContract({
        address: registry,
        abi: sentraAgentRegistryAbi,
        functionName: "erc8004Id",
        args: [input.registryAgentId],
      }),
      arcPublicClient.readContract({
        address: registry,
        abi: sentraAgentRegistryAbi,
        functionName: "agentOwner",
        args: [input.registryAgentId],
      }),
      arcPublicClient.readContract({
        address: registry,
        abi: sentraAgentRegistryAbi,
        functionName: "agentWallet",
        args: [input.registryAgentId],
      }),
      arcPublicClient.readContract({
        address: ARC_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityRegistryAbi,
        functionName: "ownerOf",
        args: [erc8004Id],
      }),
      arcPublicClient.readContract({
        address: ARC_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityRegistryAbi,
        functionName: "tokenURI",
        args: [erc8004Id],
      }),
    ]);

  if (!isRegistered) throw new Error("Agent is not registered on the SENTRA registry");
  if (registryErc8004Id !== erc8004Id) throw new Error("SENTRA registry ERC-8004 id mismatch");
  if (!sameAddress(registryOwner, input.ownerAddress)) {
    throw new Error("SENTRA registry owner does not match the connected wallet");
  }
  if (!sameAddress(erc8004Owner, input.ownerAddress)) {
    throw new Error("ERC-8004 identity owner does not match the connected wallet");
  }
  if (input.metadataUri && tokenUri !== input.metadataUri) {
    throw new Error("ERC-8004 metadata URI does not match SENTRA metadata");
  }
  if (input.agentWalletAddress && !sameAddress(registryWallet, input.agentWalletAddress)) {
    throw new Error("SENTRA registry wallet does not match the agent wallet");
  }

  let stakeBlockNumber: number | null = null;
  if (input.stakeUsdc > 0 && !input.stakeTxHash) {
    throw new Error("Stake transaction hash is required when stake is greater than zero");
  }
  if (input.stakeUsdc > 0 && input.stakeTxHash) {
    const expectedStake = usdcUnits(input.stakeUsdc);
    const stakeReceipt = await requireSuccessfulReceipt(input.stakeTxHash, stakeVault);
    const stakeEvent = findEventArgs<{
      agentId?: `0x${string}`;
      funder?: `0x${string}`;
      amount?: bigint;
    }>(stakeReceipt, stakeVault, sentraStakeVaultAbi, "StakeDeposited");
    if (!stakeEvent) throw new Error("StakeDeposited event not found in stake tx");
    if (stakeEvent.agentId?.toLowerCase() !== input.registryAgentId.toLowerCase()) {
      throw new Error("Stake transaction used a different agent id");
    }
    if (!sameAddress(stakeEvent.funder, input.ownerAddress)) {
      throw new Error("Stake transaction funder does not match the connected wallet");
    }
    if (stakeEvent.amount !== expectedStake) {
      throw new Error("Stake transaction amount does not match the requested stake");
    }
    const onchainStake = await arcPublicClient.readContract({
      address: stakeVault,
      abi: sentraStakeVaultAbi,
      functionName: "stakeOf",
      args: [input.registryAgentId],
    });
    if (onchainStake < expectedStake) throw new Error("Stake was not recorded on-chain");
    stakeBlockNumber = Number(stakeReceipt.blockNumber);
  }

  return { registryReceipt, stakeBlockNumber };
}

async function requireWalletAuth(): Promise<{
  userId: string;
  walletAddress: `0x${string}`;
}> {
  const wallet = getWalletHeaders();
  if (!wallet) throw new Error("Wallet sign-in required");
  if (!address.safeParse(wallet.walletAddress).success) {
    throw new Error("Wallet sign-in address is invalid");
  }
  if (!signatureSchema.safeParse(wallet.signature).success) {
    throw new Error("Wallet sign-in signature is invalid");
  }

  const parsed = parseSiweMessage(wallet.message);
  if (!parsed.address) throw new Error("SIWE message is missing an address");
  if (!sameAddress(parsed.address, wallet.walletAddress)) {
    throw new Error("SIWE address does not match connected wallet");
  }
  if (parsed.chainId !== ARC_CHAIN_ID) throw new Error("Sign in with an Arc Testnet wallet");

  const expectedHost = requestHost();
  const allowedDomains = new Set([expectedHost, appDomain().toLowerCase()]);
  if (!parsed.domain || !allowedDomains.has(parsed.domain.toLowerCase())) {
    throw new Error("SIWE domain does not match this SENTRA deployment");
  }
  if (parsed.uri) {
    const uriHost = new URL(parsed.uri).host.toLowerCase();
    if (!allowedDomains.has(uriHost)) throw new Error("SIWE URI does not match this deployment");
  }

  const verified = await verifySiweMessage(arcPublicClient, {
    message: wallet.message,
    signature: wallet.signature as `0x${string}`,
    domain: parsed.domain,
    address: parsed.address,
    nonce: parsed.nonce,
    time: new Date(),
  });
  if (!verified) throw new Error("Wallet signature could not be verified");

  return {
    userId: walletUserId(parsed.address),
    walletAddress: parsed.address,
  };
}

const walletAuthMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = await requireWalletAuth();
  return next({ context: auth });
});

function requireBytes32(value: string | null | undefined, label: string) {
  if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} is not a valid bytes32 value`);
  }
  return value as `0x${string}`;
}

function requireContractAddress(value: string | null | undefined, label: string) {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} contract address is not configured`);
  }
  return value as `0x${string}`;
}

async function requireSuccessfulReceipt(txHash: string, expectedTo?: string) {
  const receipt = await arcPublicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== "success") throw new Error(`Transaction ${txHash} was not successful`);
  if (expectedTo && !sameAddress(receipt.to, expectedTo)) {
    throw new Error(`Transaction ${txHash} did not target the expected contract`);
  }
  return receipt;
}

function findEventArgs<T extends Record<string, unknown>>(
  receipt: Awaited<ReturnType<typeof requireSuccessfulReceipt>>,
  contractAddress: string,
  abi: readonly unknown[],
  eventName: string,
): T | null {
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, contractAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
        eventName,
      });
      return decoded.args as T;
    } catch {
      // Ignore logs from the same contract that are not the event we are validating.
    }
  }
  return null;
}

function protocolOwnerPrivateKey() {
  const raw =
    process.env.SENTRA_PROTOCOL_OWNER_PRIVATE_KEY ?? process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!raw) return null;
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("Protocol owner private key is not a valid 32-byte hex key");
  }
  return normalized as `0x${string}`;
}

export async function ensureCallPricedOnArc(callId: string, price: number) {
  const contracts = getProtocolContracts();
  if (!contracts.callAccess) throw new Error("Call access contract address is not configured");

  const id = callAccessId(callId);
  const priceUnits = callPriceUnits(price);
  const currentPrice = await arcPublicClient.readContract({
    address: contracts.callAccess as `0x${string}`,
    abi: sentraCallAccessAbi,
    functionName: "priceByCall",
    args: [id],
  });

  if (currentPrice === priceUnits) {
    return {
      status: "ready" as const,
      callAccess: contracts.callAccess,
      callAccessId: id,
      amountUsdc: price,
      amountUnits: priceUnits.toString(),
      pricingTxHash: null as `0x${string}` | null,
    };
  }

  const privateKey = protocolOwnerPrivateKey();
  if (!privateKey) {
    return {
      status: "needs_owner_pricing" as const,
      callAccess: contracts.callAccess,
      callAccessId: id,
      amountUsdc: price,
      amountUnits: priceUnits.toString(),
      missingEnv: ["SENTRA_PROTOCOL_OWNER_PRIVATE_KEY"],
    };
  }

  const { privateKeyToAccount } = await import("viem/accounts");
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: arcChain,
    transport: http(ARC_RPC_URL),
  });
  const pricingTxHash = await walletClient.writeContract({
    address: contracts.callAccess as `0x${string}`,
    abi: sentraCallAccessAbi,
    functionName: "setCallPrice",
    args: [id, priceUnits],
  });
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash: pricingTxHash });
  if (receipt.status !== "success") throw new Error("Call pricing transaction failed");

  return {
    status: "ready" as const,
    callAccess: contracts.callAccess,
    callAccessId: id,
    amountUsdc: price,
    amountUnits: priceUnits.toString(),
    pricingTxHash,
  };
}

function recordFromJson(value: Json | unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function earningsCallPrice(call: { is_free_preview: boolean; price_usdc: number | null }) {
  if (call.is_free_preview) return 0;
  const parsed = Number(call.price_usdc ?? 0);
  return parsed > 0 ? parsed : 0.01;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

async function audit(
  action: string,
  input: { actorId?: string | null; table?: string; recordId?: string; data?: unknown },
) {
  const supabaseAdmin = await getOptionalSupabaseAdmin();
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: isUuid(input.actorId ?? "") ? input.actorId : null,
    action,
    entity_type: input.table ?? null,
    entity_id: input.recordId ?? null,
    metadata: (input.data ?? {}) as Json,
  });
}

async function requireAgentOwner(agentId: string, userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();
  if (error) throw error;
  if (!agent || agent.owner_id !== userId)
    throw new Error("Agent not found or not owned by current user");
  return agent;
}

async function requireResolver(userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: role, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"])
    .maybeSingle();
  if (error) throw error;
  if (!role) {
    throw new Error("Resolver role required");
  }
}

async function hasConfirmedCallUnlock(
  supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  call: { id: string; is_free_preview: boolean; price_usdc: number | null },
  userId: string,
) {
  const price = earningsCallPrice(call);
  if (price <= 0) return true;

  const { data: unlock, error: unlockError } = await supabaseAdmin
    .from("call_unlocks")
    .select("id, amount_paid_usdc")
    .eq("call_id", call.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (unlockError) throw unlockError;
  if (!unlock || Number(unlock.amount_paid_usdc ?? 0) < price) return false;

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("circle_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("amount_usdc", price)
    .eq("raw->>callId", call.id)
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;

  return Boolean(payment);
}

function requestHost() {
  const request = getRequest();
  const forwardedHost = request?.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request?.headers.get("host") ?? appDomain();
  return host.toLowerCase();
}

async function getCircleWalletClient() {
  const missing = missingCircleEnv();
  if (missing.length > 0) {
    return { client: null, missing };
  }

  const { initiateDeveloperControlledWalletsClient } =
    await import("@circle-fin/developer-controlled-wallets");
  return {
    client: initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: (process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET)!,
      baseUrl: process.env.CIRCLE_BASE_URL,
    }),
    missing: [],
  };
}

export const registerAgentAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(2).max(32),
      strategy: z.enum(strategies),
      description: z.string().max(200).optional(),
      stakeUsdc: money,
      delegationCapUsdc: money,
      minConfidenceBps: z.number().int().min(0).max(10_000),
      maxActivePredictions: z.number().int().min(1).max(100),
      autoCalls: z.boolean(),
      publicDelegations: z.boolean(),
      riskLimits: riskLimitsSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId, walletAddress } = getAuthContext(context);
    const supabaseAdmin = await getOptionalSupabaseAdmin();
    const slug = `${slugify(data.name)}-${crypto.randomUUID().slice(0, 8)}`;
    const metadata = {
      name: data.name,
      description: data.description ?? "",
      agent_type: "sentra_prediction_agent",
      strategy: data.strategy,
      version: "1.0.0",
    };
    const metadataHash = hashJson(metadata);
    const registryAgentId = hashText(`sentra:${userId}:${slug}:${crypto.randomUUID()}`);
    const strategyHash = hashText(data.strategy);
    const riskHash = hashJson(data.riskLimits);
    const predictionKeyHash = hashText(`sentra:prediction-key:${userId}:${slug}`);

    if (!supabaseAdmin) {
      const runtime = await runtimeCreateAgent({
        ownerId: userId,
        ownerAddress: walletAddress,
        slug,
        name: data.name,
        strategy: data.strategy,
        description: data.description ?? "",
        registryAgentId,
        metadataHash,
        strategyHash,
        riskHash,
        predictionKeyHash,
        stakeUsdc: data.stakeUsdc,
        delegationCapUsdc: data.publicDelegations ? data.delegationCapUsdc : 0,
        riskLimits: data.riskLimits,
        autoCalls: data.autoCalls,
      });
      return {
        agentId: runtime.agentId,
        slug: runtime.slug,
        registryAgentId,
        metadataUri: runtime.metadataUri,
        metadataHash,
        strategyHash,
        riskHash,
        predictionKeyHash,
        protocolReady: missingProtocolContracts().length === 0,
        missingProtocolEnv: missingProtocolContracts(),
        runtimeBacked: true,
      };
    }

    await supabaseAdmin.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id" });

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .insert({
        owner_id: userId,
        slug,
        name: data.name,
        strategy: data.strategy,
        description: data.description ?? null,
        status: "draft",
        registry_agent_id: registryAgentId,
        metadata_uri: null,
        metadata_hash: metadataHash,
      })
      .select("*")
      .single();

    if (agentError) throw agentError;

    const metadataUri = agentMetadataUri(agent.id);
    const { error: metadataUriError } = await supabaseAdmin
      .from("agents")
      .update({ metadata_uri: metadataUri })
      .eq("id", agent.id);
    if (metadataUriError) throw metadataUriError;

    const { error: configError } = await supabaseAdmin.from("agent_configs").insert({
      agent_id: agent.id,
      delegation_cap_usdc: data.publicDelegations ? data.delegationCapUsdc : 0,
      earnings_call_enabled: data.autoCalls,
      earnings_call_monthly_usd: 12,
      earnings_call_tier: "paid",
      max_daily_loss_usdc: data.riskLimits.maxDailyLossUsdc,
      max_leverage: data.riskLimits.maxLeverage,
      max_open_positions: data.riskLimits.maxOpenPositions,
      max_slippage_bps: data.riskLimits.maxSlippageBps,
    });
    if (configError) throw configError;

    if (data.stakeUsdc > 0) {
      await supabaseAdmin.from("vault_transactions").insert({
        agent_id: agent.id,
        kind: "stake",
        amount_usdc: data.stakeUsdc,
        metadata: {
          registryAgentId,
          missingProtocolEnv: missingProtocolContracts(),
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      });
    }

    await audit("agent.registered_draft", {
      actorId: userId,
      table: "agents",
      recordId: agent.id,
      data: agent,
    });

    return {
      agentId: agent.id,
      slug: agent.slug,
      registryAgentId,
      metadataUri,
      metadataHash,
      strategyHash,
      riskHash,
      predictionKeyHash,
      protocolReady: missingProtocolContracts().length === 0,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const createStakeIntentAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(z.object({ agentId: z.string().uuid(), amountUsdc: money.min(0.000001) }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const contracts = getProtocolContracts();
    const { data: tx, error } = await supabaseAdmin
      .from("vault_transactions")
      .insert({
        agent_id: agent.id,
        kind: "stake",
        amount_usdc: data.amountUsdc,
        metadata: {
          metadataHash: agent.metadata_hash,
          missingProtocolEnv: missingProtocolContracts(),
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit("stake.intent_created", {
      actorId: userId,
      table: "vault_transactions",
      recordId: tx.id,
      data: tx,
    });
    return { status: "created" as const, intentId: tx.id, stakeVault: contracts.stakeVault };
  });

export const recordAgentOnchainDeploymentAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      arcErc8004Id: z.string().regex(/^\d+$/),
      ownerAddress: address,
      agentWalletAddress: address.optional(),
      erc8004TxHash: txHashSchema,
      registryTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      stakeTxHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .optional(),
      stakeUsdc: money,
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getOptionalSupabaseAdmin();

    if (!supabaseAdmin) {
      const { loadRuntimeDataset, runtimeBaseUrl } = await import("@/lib/runtimeDataset");
      const runtime = await loadRuntimeDataset();
      const runtimeAgent = runtime?.agents.find(
        (item) => item.databaseId === data.agentId || item.id === data.agentId,
      );
      const registryAgentId = requireBytes32(runtimeAgent?.registryAgentId, "Agent registry id");
      await verifyAgentDeploymentOnArc({
        registryAgentId,
        metadataUri: runtimeAgent ? `${runtimeBaseUrl()}/metadata/${runtimeAgent.id}` : null,
        ownerAddress: data.ownerAddress,
        agentWalletAddress: data.agentWalletAddress ?? runtimeAgent?.walletAddress ?? null,
        arcErc8004Id: data.arcErc8004Id,
        erc8004TxHash: data.erc8004TxHash,
        registryTxHash: data.registryTxHash,
        stakeTxHash: data.stakeTxHash,
        stakeUsdc: data.stakeUsdc,
      });
      await runtimeRecordAgentDeployment({
        agentId: data.agentId,
        ownerAddress: data.ownerAddress as `0x${string}`,
        agentWalletAddress: data.agentWalletAddress as `0x${string}` | undefined,
        registryAgentId,
        arcErc8004Id: data.arcErc8004Id,
        erc8004TxHash: data.erc8004TxHash as `0x${string}`,
        registryTxHash: data.registryTxHash as `0x${string}`,
        stakeTxHash: data.stakeTxHash as `0x${string}` | undefined,
        stakeUsdc: data.stakeUsdc,
      });
      return { status: "recorded" as const };
    }

    const agent = await requireAgentOwner(data.agentId, userId);
    const registryAgentId = requireBytes32(agent.registry_agent_id, "Agent registry id");

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (walletError) throw walletError;

    const verified = await verifyAgentDeploymentOnArc({
      registryAgentId,
      metadataUri: agent.metadata_uri,
      ownerAddress: data.ownerAddress,
      agentWalletAddress: data.agentWalletAddress ?? wallet?.wallet_address ?? null,
      arcErc8004Id: data.arcErc8004Id,
      erc8004TxHash: data.erc8004TxHash,
      registryTxHash: data.registryTxHash,
      stakeTxHash: data.stakeTxHash,
      stakeUsdc: data.stakeUsdc,
    });

    const { error: updateAgentError } = await supabaseAdmin
      .from("agents")
      .update({
        status: "active",
        arc_erc8004_id: Number(data.arcErc8004Id),
      })
      .eq("id", agent.id);
    if (updateAgentError) throw updateAgentError;

    if (data.stakeUsdc > 0 && data.stakeTxHash) {
      await supabaseAdmin.from("vault_transactions").insert({
        agent_id: agent.id,
        kind: "stake",
        amount_usdc: data.stakeUsdc,
        tx_hash: data.stakeTxHash,
        block_number: verified.stakeBlockNumber,
        metadata: {
          registryTxHash: data.registryTxHash,
          erc8004TxHash: data.erc8004TxHash,
          arcErc8004Id: data.arcErc8004Id,
          ownerAddress: data.ownerAddress,
          registryAgentId,
          registryBlockNumber: Number(verified.registryReceipt.blockNumber),
        } as Json,
      });
      await supabaseAdmin
        .from("agent_wallets")
        .update({ usdc_stake: Number(data.stakeUsdc) })
        .eq("agent_id", agent.id);
    }

    await audit("agent.onchain_deployed", {
      actorId: userId,
      table: "agents",
      recordId: agent.id,
      data,
    });

    return { status: "recorded" as const };
  });

export const createAgentWalletAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(z.object({ agentId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const supabaseAdmin = await getOptionalSupabaseAdmin();
    if (!supabaseAdmin) {
      const { loadRuntimeDataset } = await import("@/lib/runtimeDataset");
      const runtime = await loadRuntimeDataset();
      const agent = runtime?.agents.find(
        (item) => item.databaseId === data.agentId || item.id === data.agentId,
      );
      if (!agent) throw new Error("Agent not found");
      return {
        status: "ready" as const,
        walletId: agent.circleWalletId || `runtime-wallet-${agent.id}`,
        address: agent.walletAddress,
      };
    }

    const agent = await requireAgentOwner(data.agentId, userId);

    const { data: existingWallet, error: existingWalletError } = await supabaseAdmin
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (existingWalletError) throw existingWalletError;

    if (existingWallet?.circle_wallet_id && existingWallet.wallet_address) {
      return {
        status: "ready" as const,
        walletId: existingWallet.circle_wallet_id,
        address: existingWallet.wallet_address,
      };
    }

    const { client, missing } = await getCircleWalletClient();
    if (!client) {
      await audit("agent_wallet.missing_circle_config", {
        actorId: userId,
        table: "agents",
        recordId: agent.id,
        data: { missing },
      });
      return { status: "needs_config" as const, missing };
    }

    const walletSetId =
      process.env.CIRCLE_AGENT_WALLET_SET_ID ??
      (
        await client.createWalletSet({
          name: "SENTRA Agent Wallets",
          idempotencyKey: crypto.randomUUID(),
        })
      ).data?.walletSet?.id;

    if (!walletSetId) throw new Error("Circle wallet set was not returned");

    const response = await client.createWallets({
      blockchains: [ARC_CIRCLE_BLOCKCHAIN],
      count: 1,
      walletSetId,
      accountType: "SCA",
      metadata: [{ name: `${agent.name} treasury`, refId: `sentra-agent:${agent.id}` }],
      idempotencyKey: crypto.randomUUID(),
    });
    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) throw new Error("Circle wallet was not returned");

    const { error: walletError } = await supabaseAdmin.from("agent_wallets").insert({
      agent_id: agent.id,
      circle_wallet_id: wallet.id,
      wallet_address: wallet.address,
      blockchain: ARC_CIRCLE_BLOCKCHAIN,
    });
    if (walletError) throw walletError;

    await audit("agent_wallet.created", {
      actorId: userId,
      table: "agent_wallets",
      recordId: agent.id,
      data: wallet,
    });
    return { status: "ready" as const, walletId: wallet.id, address: wallet.address };
  });

export const registerErc8004IdentityAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({ agentId: z.string().uuid(), metadataUri: z.string().min(1).max(512).optional() }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { client, missing } = await getCircleWalletClient();

    if (!client) {
      await audit("erc8004_identity.missing_circle_config", {
        actorId: userId,
        table: "agents",
        recordId: agent.id,
        data: { missing },
      });
      return { status: "needs_config" as const, missing };
    }

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("agent_wallets")
      .select("*")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (walletError) throw walletError;

    if (!wallet?.wallet_address) {
      return { status: "needs_wallet" as const, missing: ["agent wallet"] };
    }

    const metadataUri = data.metadataUri ?? agent.metadata_uri ?? `sentra://metadata/${agent.slug}`;
    const tx = await client.createContractExecutionTransaction({
      walletAddress: wallet.wallet_address,
      blockchain: ARC_CIRCLE_BLOCKCHAIN,
      contractAddress: ARC_ERC8004_IDENTITY_REGISTRY,
      abiFunctionSignature: "register(string)",
      abiParameters: [metadataUri],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: crypto.randomUUID(),
    });

    const circleId = tx.data?.id ?? null;
    await supabaseAdmin.from("circle_transactions").insert({
      user_id: userId,
      agent_id: agent.id,
      circle_wallet_id: wallet.circle_wallet_id,
      circle_tx_id: circleId,
      kind: "transfer",
      amount_usdc: 0,
      status: "pending",
      raw: { metadataUri, response: tx.data } as unknown as Json,
    });

    await audit("erc8004_identity.submitted", {
      actorId: userId,
      table: "agents",
      recordId: agent.id,
      data: tx.data,
    });
    return { status: "submitted" as const, circleTransactionId: circleId };
  });

export const createDelegationIntentAction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      amountUsdc: money.min(0.000001),
      delegatorAddress: address.optional(),
      txHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { userId, walletAddress } = await requireWalletAuth();
    const supabaseAdmin = await getOptionalSupabaseAdmin();
    const contracts = getProtocolContracts();
    if (!supabaseAdmin) {
      const { loadRuntimeDataset } = await import("@/lib/runtimeDataset");
      const runtime = await loadRuntimeDataset();
      const runtimeAgent = runtime?.agents.find(
        (item) => item.databaseId === data.agentId || item.id === data.agentId,
      );
      if (!runtimeAgent) throw new Error("Agent not found");
      const registryAgentId = requireBytes32(runtimeAgent.registryAgentId, "Agent registry id");
      const amountUnits = usdcUnits(data.amountUsdc);
      let status: "pending" | "active" = "pending";
      if (data.txHash) {
        const delegatorAddress = data.delegatorAddress ?? walletAddress;
        const vault = requireContractAddress(contracts.delegationVault, "Delegation vault");
        const receipt = await requireSuccessfulReceipt(data.txHash, vault);
        const delegatedEvent = findEventArgs<{
          agentId?: `0x${string}`;
          delegator?: `0x${string}`;
          amount?: bigint;
        }>(receipt, vault, sentraDelegationVaultAbi, "Delegated");
        if (!delegatedEvent) throw new Error("Delegated event not found in delegation tx");
        if (delegatedEvent.agentId?.toLowerCase() !== registryAgentId.toLowerCase()) {
          throw new Error("Delegation transaction used a different agent id");
        }
        if (!sameAddress(delegatedEvent.delegator, delegatorAddress)) {
          throw new Error("Delegation transaction delegator does not match the connected wallet");
        }
        if (delegatedEvent.amount !== amountUnits) {
          throw new Error("Delegation transaction amount does not match the requested amount");
        }
        const onchainDelegated = await arcPublicClient.readContract({
          address: vault,
          abi: sentraDelegationVaultAbi,
          functionName: "delegatedBy",
          args: [registryAgentId, delegatorAddress as `0x${string}`],
        });
        if (onchainDelegated < amountUnits) throw new Error("Delegation was not recorded on-chain");
        status = "active";
      }
      const recorded = await runtimeRecordDelegation({
        agentId: runtimeAgent.id,
        userId,
        walletAddress,
        amountUsdc: data.amountUsdc,
        txHash: data.txHash as `0x${string}` | undefined,
        status,
      });
      return {
        status: "created" as const,
        intentId: recorded?.delegationId ?? `runtime:${data.txHash ?? crypto.randomUUID()}`,
        delegationVault: contracts.delegationVault,
        missingProtocolEnv: missingProtocolContracts(),
      };
    }

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", data.agentId)
      .single();
    if (agentError) throw agentError;

    const registryAgentId = requireBytes32(agent.registry_agent_id, "Agent registry id");
    const amountUnits = usdcUnits(data.amountUsdc);
    let status: "pending" | "active" = "pending";
    let verifiedBlockNumber: number | null = null;

    if (data.txHash) {
      if (!data.delegatorAddress) {
        throw new Error("Delegator wallet address is required to confirm a delegation");
      }
      const vault = requireContractAddress(contracts.delegationVault, "Delegation vault");
      const receipt = await requireSuccessfulReceipt(data.txHash, vault);
      const delegatedEvent = findEventArgs<{
        agentId?: `0x${string}`;
        delegator?: `0x${string}`;
        amount?: bigint;
        shares?: bigint;
      }>(receipt, vault, sentraDelegationVaultAbi, "Delegated");
      if (!delegatedEvent) throw new Error("Delegated event not found in delegation tx");
      if (delegatedEvent.agentId?.toLowerCase() !== registryAgentId.toLowerCase()) {
        throw new Error("Delegation transaction used a different agent id");
      }
      if (!sameAddress(delegatedEvent.delegator, data.delegatorAddress)) {
        throw new Error("Delegation transaction delegator does not match the connected wallet");
      }
      if (delegatedEvent.amount !== amountUnits) {
        throw new Error("Delegation transaction amount does not match the requested amount");
      }
      const onchainDelegated = await arcPublicClient.readContract({
        address: vault,
        abi: sentraDelegationVaultAbi,
        functionName: "delegatedBy",
        args: [registryAgentId, data.delegatorAddress as `0x${string}`],
      });
      if (onchainDelegated < amountUnits) throw new Error("Delegation was not recorded on-chain");
      status = "active";
      verifiedBlockNumber = Number(receipt.blockNumber);
    }

    const { data: delegation, error } = await supabaseAdmin
      .from("delegations")
      .insert({
        agent_id: data.agentId,
        delegator_id: userId,
        amount_usdc: data.amountUsdc,
        status,
        tx_hash: data.txHash ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

    if (data.txHash) {
      const { error: txError } = await supabaseAdmin.from("circle_transactions").upsert(
        {
          user_id: userId,
          agent_id: data.agentId,
          kind: "transfer",
          circle_tx_id: `wallet:${data.txHash.toLowerCase()}`,
          amount_usdc: data.amountUsdc,
          status: "confirmed",
          raw: {
            source: "wallet",
            purpose: "delegation",
            delegationId: delegation.id,
            registryAgentId,
            delegationVault: contracts.delegationVault,
            usdcAddress: ARC_USDC_ADDRESS,
            delegatorAddress: data.delegatorAddress ?? null,
            txHash: data.txHash,
            blockNumber: verifiedBlockNumber,
          } as Json,
        },
        { onConflict: "circle_tx_id" },
      );
      if (txError) throw txError;
    }

    await audit("delegation.intent_created", {
      actorId: userId,
      table: "delegations",
      recordId: delegation.id,
      data: {
        ...delegation,
        agentSlug: agent.slug,
        delegatorAddress: data.delegatorAddress ?? null,
        missingProtocolEnv: missingProtocolContracts(),
        usdcAddress: ARC_USDC_ADDRESS,
        verifiedBlockNumber,
      },
    });
    return {
      status: "created" as const,
      intentId: delegation.id,
      delegationVault: contracts.delegationVault,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const createWithdrawalIntentAction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      delegationId: z.string().uuid(),
      amountUsdc: money.min(0.000001),
      txHash: txHashSchema.optional(),
      withdrawerAddress: address.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { userId, walletAddress } = await requireWalletAuth();
    const supabaseAdmin = await getOptionalSupabaseAdmin();
    if (!supabaseAdmin) {
      const recorded = await runtimeRecordWithdrawal({
        delegationId: data.delegationId,
        walletAddress,
        amountUsdc: data.amountUsdc,
        txHash: data.txHash as `0x${string}` | undefined,
        status: data.txHash ? "confirmed" : "created",
      });
      return {
        status: data.txHash ? ("confirmed" as const) : ("created" as const),
        intentId: recorded?.transactionId ?? `runtime:${data.txHash ?? crypto.randomUUID()}`,
        missingProtocolEnv: missingProtocolContracts(),
      };
    }

    const { data: delegation, error: delegationError } = await supabaseAdmin
      .from("delegations")
      .select("*")
      .eq("id", data.delegationId)
      .eq("delegator_id", userId)
      .single();
    if (delegationError) throw delegationError;
    if (data.amountUsdc > Number(delegation.amount_usdc)) {
      throw new Error("Withdrawal amount exceeds this delegation");
    }

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", delegation.agent_id)
      .single();
    if (agentError) throw agentError;

    const contracts = getProtocolContracts();
    const registryAgentId = requireBytes32(agent.registry_agent_id, "Agent registry id");
    let verifiedBlockNumber: number | null = null;

    if (data.txHash) {
      if (!data.withdrawerAddress) {
        throw new Error("Withdrawer wallet address is required to confirm a withdrawal");
      }
      const vault = requireContractAddress(contracts.delegationVault, "Delegation vault");
      const amountUnits = usdcUnits(data.amountUsdc);
      const receipt = await requireSuccessfulReceipt(data.txHash, vault);
      const withdrawnEvent = findEventArgs<{
        agentId?: `0x${string}`;
        delegator?: `0x${string}`;
        amount?: bigint;
        shares?: bigint;
      }>(receipt, vault, sentraDelegationVaultAbi, "Withdrawn");
      if (!withdrawnEvent) throw new Error("Withdrawn event not found in withdrawal tx");
      if (withdrawnEvent.agentId?.toLowerCase() !== registryAgentId.toLowerCase()) {
        throw new Error("Withdrawal transaction used a different agent id");
      }
      if (!sameAddress(withdrawnEvent.delegator, data.withdrawerAddress)) {
        throw new Error("Withdrawal transaction wallet does not match the connected wallet");
      }
      if (withdrawnEvent.amount !== amountUnits) {
        throw new Error("Withdrawal transaction amount does not match the requested amount");
      }
      verifiedBlockNumber = Number(receipt.blockNumber);
    }

    const { data: tx, error } = await supabaseAdmin
      .from("vault_transactions")
      .insert({
        agent_id: delegation.agent_id,
        kind: "unstake",
        amount_usdc: data.amountUsdc,
        tx_hash: data.txHash ?? null,
        block_number: verifiedBlockNumber,
        metadata: {
          delegationId: delegation.id,
          actorId: userId,
          withdrawerAddress: data.withdrawerAddress ?? null,
          registryAgentId,
          missingProtocolEnv: missingProtocolContracts(),
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("withdrawal.intent_created", {
      actorId: userId,
      table: "vault_transactions",
      recordId: tx.id,
      data: tx,
    });

    if (data.txHash) {
      const remaining = Math.max(0, Number(delegation.amount_usdc) - data.amountUsdc);
      const update =
        remaining > 0
          ? { amount_usdc: remaining, status: "active" as const }
          : {
              amount_usdc: 0,
              status: "withdrawn" as const,
              withdrawn_at: new Date().toISOString(),
            };
      const { error: updateError } = await supabaseAdmin
        .from("delegations")
        .update(update)
        .eq("id", delegation.id);
      if (updateError) throw updateError;

      const { error: txError } = await supabaseAdmin.from("circle_transactions").upsert(
        {
          user_id: userId,
          agent_id: delegation.agent_id,
          kind: "withdrawal",
          circle_tx_id: `wallet:${data.txHash.toLowerCase()}`,
          amount_usdc: data.amountUsdc,
          status: "confirmed",
          raw: {
            source: "wallet",
            purpose: "delegation_withdrawal",
            delegationId: delegation.id,
            registryAgentId,
            delegationVault: contracts.delegationVault,
            usdcAddress: ARC_USDC_ADDRESS,
            withdrawerAddress: data.withdrawerAddress ?? null,
            txHash: data.txHash,
            blockNumber: verifiedBlockNumber,
          } as Json,
        },
        { onConflict: "circle_tx_id" },
      );
      if (txError) throw txError;
    }

    return {
      status: data.txHash ? ("confirmed" as const) : ("created" as const),
      intentId: tx.id,
      missingProtocolEnv: missingProtocolContracts(),
    };
  });

export const submitPredictionAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      marketId: z.string().min(1).max(128),
      question: z.string().min(4).max(240),
      agentProbabilityBps: z.number().int().min(0).max(10_000),
      marketProbabilityBps: z.number().int().min(0).max(10_000).optional(),
      confidenceBps: z.number().int().min(0).max(10_000),
      stakeAtRiskUsdc: money.default(0),
      resolvesAt: z.string().datetime().optional(),
      signedPayload: z.record(z.unknown()).default({}),
      signatureHash: bytes32.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const payload = {
      ...data.signedPayload,
      agentId: agent.id,
      marketId: data.marketId,
      question: data.question,
      probabilityBps: data.agentProbabilityBps,
      confidenceBps: data.confidenceBps,
      resolvesAt: data.resolvesAt ?? null,
    };
    const predictionHash = hashJson(payload);
    const expiresAt =
      data.resolvesAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: prediction, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        agent_id: agent.id,
        market_id: data.marketId,
        question: data.question,
        prediction_hash: predictionHash,
        signature: data.signatureHash ?? hashText(stableJson(payload)),
        agent_prob: data.agentProbabilityBps / 10_000,
        market_prob:
          data.marketProbabilityBps === undefined ? null : data.marketProbabilityBps / 10_000,
        confidence: Math.round(data.confidenceBps / 100),
        reasoning: String(jsonRecord(data.signedPayload).reasoning ?? ""),
        status: "active",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("prediction.submitted", {
      actorId: userId,
      table: "predictions",
      recordId: prediction.id,
      data: prediction,
    });
    return { status: "submitted" as const, predictionId: prediction.id, predictionHash };
  });

export const resolvePredictionAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      predictionId: z.string().uuid(),
      outcome: z.boolean(),
      evidenceUri: z.string().max(512).optional(),
      notes: z.string().max(1000).optional(),
      settlementTxHash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    await requireResolver(userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: prediction, error: predictionError } = await supabaseAdmin
      .from("predictions")
      .select("*")
      .eq("id", data.predictionId)
      .single();
    if (predictionError) throw predictionError;
    if (prediction.status === "resolved") throw new Error("Prediction already resolved");

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", prediction.agent_id)
      .single();
    if (agentError) throw agentError;

    const previousScore = Number(agent.reputation ?? 0);
    const brier = computeBrierScore(
      Math.round(Number(prediction.agent_prob) * 10_000),
      data.outcome,
    );
    const delta = computeReputationDelta(brier);
    const nextScore = computeNextReputation(previousScore, brier);

    const { data: outcome, error: outcomeError } = await supabaseAdmin
      .from("prediction_outcomes")
      .insert({
        prediction_id: prediction.id,
        outcome: data.outcome,
        brier_delta: brier,
        resolver: userId,
        source_url: data.evidenceUri ?? null,
      })
      .select("*")
      .single();
    if (outcomeError) throw outcomeError;

    const { error: updatePredictionError } = await supabaseAdmin
      .from("predictions")
      .update({ status: "resolved" })
      .eq("id", prediction.id);
    if (updatePredictionError) throw updatePredictionError;

    const { error: updateAgentError } = await supabaseAdmin
      .from("agents")
      .update({
        reputation: nextScore,
        brier_score: brier,
      })
      .eq("id", prediction.agent_id);
    if (updateAgentError) throw updateAgentError;

    await supabaseAdmin.from("reputation_events").insert({
      agent_id: prediction.agent_id,
      prediction_id: prediction.id,
      new_score: nextScore,
      score_delta: delta,
      reason: data.notes ?? data.evidenceUri ?? "prediction_resolved",
    });

    await audit("prediction.resolved", {
      actorId: userId,
      table: "prediction_outcomes",
      recordId: outcome.id,
      data: outcome,
    });
    return {
      status: "resolved" as const,
      brierScore: brier,
      reputationScore: nextScore,
      reputationDelta: delta,
    };
  });

export const updateReputationAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(z.object({ agentId: z.string().uuid(), reason: z.string().max(500).optional() }))
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    await requireResolver(userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", data.agentId)
      .single();
    if (agentError) throw agentError;

    const { data: predictions, error: predictionError } = await supabaseAdmin
      .from("predictions")
      .select("id")
      .eq("agent_id", data.agentId)
      .eq("status", "resolved");
    if (predictionError) throw predictionError;

    const predictionIds = (predictions ?? []).map((prediction) => prediction.id);
    if (predictionIds.length === 0) {
      return {
        status: "no_resolved_predictions" as const,
        reputationScore: Number(agent.reputation ?? 0),
      };
    }

    const { data: outcomes, error: outcomeError } = await supabaseAdmin
      .from("prediction_outcomes")
      .select("*")
      .in("prediction_id", predictionIds);
    if (outcomeError) throw outcomeError;

    const avgBrier =
      outcomes && outcomes.length > 0
        ? outcomes.reduce((sum, outcome) => sum + Number(outcome.brier_delta ?? 0), 0) /
          outcomes.length
        : 0;
    const nextScore = Math.max(0, Math.min(100, (1 - Math.min(1, avgBrier)) * 100));
    const previousScore = Number(agent.reputation ?? 0);
    const delta = nextScore - previousScore;
    const validationCount = outcomes?.length ?? 0;

    const { error: updateError } = await supabaseAdmin
      .from("agents")
      .update({
        reputation: nextScore,
        brier_score: avgBrier,
      })
      .eq("id", data.agentId);
    if (updateError) throw updateError;

    await supabaseAdmin.from("reputation_events").insert({
      agent_id: data.agentId,
      new_score: nextScore,
      score_delta: delta,
      reason: data.reason ?? "reputation_recomputed",
    });

    await audit("reputation.recomputed", {
      actorId: userId,
      table: "agents",
      recordId: data.agentId,
      data: { previousScore, nextScore, avgBrier, validationCount },
    });
    return {
      status: "updated" as const,
      reputationScore: nextScore,
      brierScore: avgBrier,
      validationCount,
    };
  });

export const publishEarningsCallAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      agentId: z.string().uuid(),
      callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      durationSeconds: z.number().int().min(15).max(7200),
      transcript: z.string().min(120).max(50_000),
      pnlSummary: z.string().min(10).max(1000),
      biggestWin: z.string().max(1000).optional(),
      biggestLoss: z.string().max(1000).optional(),
      tomorrowThesis: z.string().max(1500).optional(),
      audioUrl: z.string().url().optional().nullable(),
      isFreePreview: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = getAuthContext(context);
    const agent = await requireAgentOwner(data.agentId, userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const priceUsdc = data.isFreePreview ? 0 : 0.01;
    const contentHash = hashJson({
      agentId: agent.id,
      callDate: data.callDate,
      transcript: data.transcript,
      pnlSummary: data.pnlSummary,
      priceUsdc,
    });

    const callRow = {
      agent_id: agent.id,
      call_date: data.callDate,
      duration_seconds: data.durationSeconds,
      audio_url: data.audioUrl ?? null,
      transcript: data.transcript,
      pnl_summary: data.pnlSummary,
      biggest_win: data.biggestWin ?? null,
      biggest_loss: data.biggestLoss ?? null,
      tomorrow_thesis: data.tomorrowThesis ?? null,
      price_usdc: priceUsdc,
      is_free_preview: data.isFreePreview,
    };

    const { data: existingCall, error: existingError } = await supabaseAdmin
      .from("earnings_calls")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("call_date", data.callDate)
      .maybeSingle();
    if (existingError) throw existingError;

    const request = existingCall
      ? supabaseAdmin.from("earnings_calls").update(callRow).eq("id", existingCall.id)
      : supabaseAdmin.from("earnings_calls").insert(callRow);

    const { data: call, error } = await request.select("*").single();
    if (error) throw error;

    await audit("earnings_call.published", {
      actorId: userId,
      table: "earnings_calls",
      recordId: call.id,
      data: { ...call, contentHash },
    });

    return {
      status: "published" as const,
      callId: call.id,
      contentHash,
      priceUsdc,
    };
  });

export const prepareCallUnlockAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ callId: z.string().min(1).max(128) }))
  .handler(async ({ data }) => {
    if (isUuid(data.callId)) {
      try {
        const supabaseAdmin = await getSupabaseAdmin();
        const { data: call, error } = await supabaseAdmin
          .from("earnings_calls")
          .select("id, price_usdc, is_free_preview")
          .eq("id", data.callId)
          .single();
        if (!error && call) {
          const price = earningsCallPrice(call);
          if (call.is_free_preview || price <= 0) {
            return {
              status: "free" as const,
              callAccess: null,
              callAccessId: callAccessId(call.id),
              amountUsdc: 0,
              amountUnits: "0",
              pricingTxHash: null,
            };
          }
          return ensureCallPricedOnArc(call.id, price);
        }
      } catch {
        // Fall through to the VPS runtime path when Supabase is not configured.
      }
    }

    const { loadRuntimeDataset } = await import("@/lib/runtimeDataset");
    const runtime = await loadRuntimeDataset();
    const call = runtime?.earningsCalls.find((item) => item.id === data.callId);
    if (!call) throw new Error("Call not found");
    if (call.isFreePreview || call.subscriptionCost <= 0) {
      return {
        status: "free" as const,
        callAccess: null,
        callAccessId: call.callAccessId,
        amountUsdc: 0,
        amountUnits: "0",
        pricingTxHash: null,
      };
    }
    return ensureCallPricedOnArc(call.id, call.subscriptionCost);
  });

export const unlockCallAction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      callId: callIdSchema,
      paymentSource: z.enum(["usdc", "gateway", "free"]).default("usdc"),
      txHash: txHashSchema.optional(),
      payerAddress: address.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { userId } = await requireWalletAuth();
    const runtimeCall = await runtimePreviewCall(data.callId);
    if (runtimeCall) {
      const price = runtimeCall.isFreePreview ? 0 : runtimeCall.subscriptionCost || 0.01;
      if (runtimeCall.isFreePreview || price <= 0) {
        return { status: "unlocked" as const, unlockId: `runtime:${runtimeCall.id}` };
      }
      if (data.txHash && data.payerAddress) {
        await verifyOnchainCallUnlock({
          callId: runtimeCall.id,
          price,
          txHash: data.txHash,
          payerAddress: data.payerAddress,
        });
        return { status: "unlocked" as const, unlockId: `runtime:${runtimeCall.id}` };
      }
      return {
        status: "payment_required" as const,
        transactionId: `runtime:${runtimeCall.id}`,
        amountUsdc: price,
        callAccess: getProtocolContracts().callAccess,
      };
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const { data: call, error: callError } = await supabaseAdmin
      .from("earnings_calls")
      .select("*")
      .eq("id", data.callId)
      .single();
    if (callError) throw callError;

    const price = earningsCallPrice(call);
    if (call.is_free_preview || price <= 0) {
      const { data: unlock, error } = await supabaseAdmin
        .from("call_unlocks")
        .upsert(
          {
            call_id: call.id,
            user_id: userId,
            amount_paid_usdc: 0,
            tx_hash: null,
          },
          { onConflict: "user_id,call_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      await audit("call.unlocked", {
        actorId: userId,
        table: "call_unlocks",
        recordId: unlock.id,
        data: unlock,
      });
      return { status: "unlocked" as const, unlockId: unlock.id };
    }

    const confirmedAccess = await hasConfirmedCallUnlock(supabaseAdmin, call, userId);
    if (confirmedAccess) {
      const { data: existingUnlock, error: existingUnlockError } = await supabaseAdmin
        .from("call_unlocks")
        .select("id")
        .eq("call_id", call.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existingUnlockError) throw existingUnlockError;
      return { status: "unlocked" as const, unlockId: existingUnlock?.id ?? call.id };
    }

    if (data.txHash && !data.payerAddress) {
      throw new Error("Payer wallet address is required for on-chain call unlocks");
    }

    if (data.txHash && data.payerAddress) {
      const contracts = getProtocolContracts();
      const { receipt } = await verifyOnchainCallUnlock({
        callId: call.id,
        price,
        txHash: data.txHash,
        payerAddress: data.payerAddress,
      });

      const { data: tx, error: txError } = await supabaseAdmin
        .from("circle_transactions")
        .upsert(
          {
            user_id: userId,
            agent_id: call.agent_id,
            kind: "transfer",
            circle_tx_id: `wallet:${data.txHash.toLowerCase()}`,
            amount_usdc: price,
            status: "confirmed",
            raw: {
              callId: call.id,
              paymentSource: data.paymentSource,
              callAccess: contracts.callAccess,
              usdcAddress: ARC_USDC_ADDRESS,
              payerAddress: data.payerAddress,
              txHash: data.txHash,
              source: "wallet",
            } as Json,
          },
          { onConflict: "circle_tx_id" },
        )
        .select("*")
        .single();
      if (txError) throw txError;

      const { data: unlock, error: unlockError } = await supabaseAdmin
        .from("call_unlocks")
        .upsert(
          {
            call_id: call.id,
            user_id: userId,
            amount_paid_usdc: price,
            tx_hash: data.txHash,
          },
          { onConflict: "user_id,call_id" },
        )
        .select("*")
        .single();
      if (unlockError) throw unlockError;

      await audit("call.unlocked_onchain", {
        actorId: userId,
        table: "call_unlocks",
        recordId: unlock.id,
        data: { unlock, transaction: tx },
      });
      return { status: "unlocked" as const, unlockId: unlock.id };
    }

    const contracts = getProtocolContracts();
    const { data: tx, error } = await supabaseAdmin
      .from("circle_transactions")
      .insert({
        user_id: userId,
        agent_id: call.agent_id,
        kind: data.paymentSource === "gateway" ? "gateway_spend" : "transfer",
        amount_usdc: price,
        status: "pending",
        raw: {
          callId: call.id,
          paymentSource: data.paymentSource,
          callAccess: contracts.callAccess || null,
          usdcAddress: ARC_USDC_ADDRESS,
        } as Json,
      })
      .select("*")
      .single();
    if (error) throw error;

    await audit("call_unlock.intent_created", {
      actorId: userId,
      table: "circle_transactions",
      recordId: tx.id,
      data: tx,
    });
    return {
      status: "payment_required" as const,
      transactionId: tx.id,
      amountUsdc: price,
      callAccess: contracts.callAccess,
    };
  });

export const getUnlockedCallAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ callId: callIdSchema }))
  .handler(async ({ data }) => {
    const { userId, walletAddress } = await requireWalletAuth();
    const runtimeCall = await runtimePreviewCall(data.callId);
    if (runtimeCall) {
      const price = runtimeCall.isFreePreview ? 0 : runtimeCall.subscriptionCost || 0.01;
      const canRead =
        runtimeCall.isFreePreview ||
        price <= 0 ||
        (await runtimeCallHasAccess(runtimeCall.id, walletAddress));
      if (!canRead) throw new Error("Call is locked");
      const full = await runtimeFullCall(runtimeCall.id);
      return {
        id: full.id,
        agentId: full.agentId,
        callDate: full.date,
        durationSeconds: full.durationSeconds,
        transcript: full.transcript,
        pnlSummary: full.pnlSummary,
        biggestWin: full.biggestWin,
        biggestLoss: full.biggestLoss,
        tomorrowThesis: full.tomorrowThesis,
        audioUrl: full.audioUrl,
        priceUsdc: full.subscriptionCost,
        isFreePreview: full.isFreePreview,
      };
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const { data: call, error: callError } = await supabaseAdmin
      .from("earnings_calls")
      .select("*")
      .eq("id", data.callId)
      .single();
    if (callError) throw callError;

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("owner_id")
      .eq("id", call.agent_id)
      .single();
    if (agentError) throw agentError;

    const { data: unlock, error: unlockError } = await supabaseAdmin
      .from("call_unlocks")
      .select("id")
      .eq("call_id", call.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (unlockError) throw unlockError;

    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;

    const canRead =
      call.is_free_preview ||
      Number(call.price_usdc ?? 0) <= 0 ||
      (Boolean(unlock) && (await hasConfirmedCallUnlock(supabaseAdmin, call, userId))) ||
      agent.owner_id === userId ||
      Boolean(role);

    if (!canRead) {
      throw new Error("Call is locked");
    }

    return {
      id: call.id,
      agentId: call.agent_id,
      callDate: call.call_date,
      durationSeconds: call.duration_seconds ?? 0,
      transcript: call.transcript ?? call.pnl_summary ?? "",
      pnlSummary: call.pnl_summary ?? "",
      biggestWin: call.biggest_win ?? "",
      biggestLoss: call.biggest_loss ?? "",
      tomorrowThesis: call.tomorrow_thesis ?? "",
      audioUrl: call.audio_url,
      priceUsdc: Number(call.price_usdc ?? 0),
      isFreePreview: call.is_free_preview,
    };
  });

export async function recordCircleWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: unknown;
  headers?: Record<string, string>;
  signatureVerified?: boolean;
}) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: event, error } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      provider: "circle",
      external_id: input.eventId,
      event_type: input.eventType,
      signature_verified: input.signatureVerified ?? false,
      payload: { event: input.payload, headers: input.headers ?? {} } as Json,
    })
    .select("*")
    .single();
  if (error) throw error;
  return event;
}

export async function reconcileCircleTransaction(input: {
  circleId?: string | null;
  status?: string | null;
  txHash?: string | null;
  payload?: unknown;
}) {
  if (!input.circleId) return;
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: existingTx, error: existingError } = await supabaseAdmin
    .from("circle_transactions")
    .select("*")
    .eq("circle_tx_id", input.circleId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingTx) return;

  const circleStatus = input.status?.toUpperCase();
  const normalizedStatus =
    circleStatus === "COMPLETE" || circleStatus === "CONFIRMED"
      ? "confirmed"
      : circleStatus === "FAILED"
        ? "failed"
        : "pending";
  const existingRaw = recordFromJson(existingTx.raw);
  const nextRaw: Record<string, unknown> = {
    ...existingRaw,
    payload: input.payload ?? {},
    txHash: input.txHash ?? null,
    reconciledAt: new Date().toISOString(),
  };

  const { data: tx, error } = await supabaseAdmin
    .from("circle_transactions")
    .update({
      status: normalizedStatus,
      raw: nextRaw as unknown as Json,
    })
    .eq("id", existingTx.id)
    .select("*")
    .single();
  if (error) throw error;

  const callId = typeof nextRaw.callId === "string" ? nextRaw.callId : null;
  if (normalizedStatus !== "confirmed" || !callId || !tx.user_id) return;

  const { data: call, error: callError } = await supabaseAdmin
    .from("earnings_calls")
    .select("id, price_usdc, is_free_preview")
    .eq("id", callId)
    .single();
  if (callError) throw callError;

  const price = earningsCallPrice(call);
  const { error: unlockError } = await supabaseAdmin.from("call_unlocks").upsert(
    {
      call_id: call.id,
      user_id: tx.user_id,
      amount_paid_usdc: price,
      tx_hash: input.txHash ?? null,
    },
    { onConflict: "user_id,call_id" },
  );
  if (unlockError) throw unlockError;
}
