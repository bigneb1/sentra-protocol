import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc8004IdentityRegistryAbi } from "../src/contracts/arcErc8004";
import {
  sentraAgentRegistryAbi,
  sentraProtocolContracts,
  sentraStakeVaultAbi,
} from "../src/contracts/sentraProtocol";
import {
  ARC_CHAIN_ID,
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_EXPLORER,
  ARC_NATIVE_CURRENCY_DECIMALS,
  ARC_NETWORK_NAME,
  ARC_RPC_URL,
  ARC_USDC_ADDRESS,
} from "../src/lib/arcTestnet";
import type { AgentRiskLimits, AgentStrategy } from "../src/lib/agentTypes";

type LiveAgentSpec = {
  slug: string;
  name: string;
  strategy: Exclude<AgentStrategy, "Custom">;
  description: string;
  stakeUsdc: number;
  delegationCapUsdc: number;
  riskLimits: AgentRiskLimits;
};

type RuntimeAgentResponse = {
  agentId: string;
  slug: string;
  databaseId: string;
  metadataUri: string;
  treasuryAddress: Address;
  circleWalletId: string;
};

const zeroHash = `0x${"0".repeat(64)}` as `0x${string}`;
const zeroAddress = "0x0000000000000000000000000000000000000000";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const liveAgents: LiveAgentSpec[] = [
  {
    slug: "sentra-macro-one",
    name: "Sentra Macro One",
    strategy: "Macro",
    description:
      "Arc-native macro research agent focused on rates, dollar liquidity, stablecoin settlement depth, and high-impact catalyst risk.",
    stakeUsdc: 1,
    delegationCapUsdc: 250,
    riskLimits: {
      maxDailyLossUsdc: 25,
      maxOpenPositions: 4,
      maxSlippageBps: 50,
      maxLeverage: 1,
    },
  },
  {
    slug: "sentra-sports-edge",
    name: "Sentra Sports Edge",
    strategy: "Sports",
    description:
      "Sports-market probability agent that prices injury news, schedule fatigue, public overreaction, and closing-line edge before publishing paid calls.",
    stakeUsdc: 1,
    delegationCapUsdc: 150,
    riskLimits: {
      maxDailyLossUsdc: 15,
      maxOpenPositions: 6,
      maxSlippageBps: 75,
      maxLeverage: 1,
    },
  },
  {
    slug: "sentra-contrarian-alpha",
    name: "Sentra Contrarian Alpha",
    strategy: "Contrarian",
    description:
      "Contrarian allocation agent that looks for crowded consensus breaks where market-implied probability diverges from confirming data.",
    stakeUsdc: 1,
    delegationCapUsdc: 200,
    riskLimits: {
      maxDailyLossUsdc: 20,
      maxOpenPositions: 4,
      maxSlippageBps: 90,
      maxLeverage: 1,
    },
  },
  {
    slug: "sentra-yield-sentinel",
    name: "Sentra Yield Sentinel",
    strategy: "Yield",
    description:
      "Stablecoin yield agent that evaluates basis, utilization, incentive durability, counterparty concentration, and exit liquidity before capital allocation.",
    stakeUsdc: 1,
    delegationCapUsdc: 300,
    riskLimits: {
      maxDailyLossUsdc: 12,
      maxOpenPositions: 5,
      maxSlippageBps: 35,
      maxLeverage: 1,
    },
  },
  {
    slug: "sentra-tech-momentum",
    name: "Sentra Tech Momentum",
    strategy: "Tech",
    description:
      "Technology momentum agent focused on AI infrastructure, semiconductor breadth, revisions momentum, capex guidance, and growth-risk appetite.",
    stakeUsdc: 1,
    delegationCapUsdc: 250,
    riskLimits: {
      maxDailyLossUsdc: 30,
      maxOpenPositions: 5,
      maxSlippageBps: 80,
      maxLeverage: 1,
    },
  },
];

const liveAgentRegistryVersion = process.env.SENTRA_LIVE_AGENT_REGISTRY_VERSION ?? "https-v1";

function loadLocalEnv() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // Runtime deployments can inject environment variables without a local .env.
  }
}

function stripDatasetSuffix(value: string) {
  const trimmed = value.replace(/\/+$/, "");
  if (trimmed.endsWith("/dataset")) return trimmed.replace(/\/dataset$/, "");
  if (trimmed.endsWith("/api/runtime")) return trimmed;
  return trimmed;
}

function runtimeWriteBaseUrl() {
  return stripDatasetSuffix(
    process.env.SENTRA_AGENT_RUNTIME_WRITE_URL ??
      process.env.SENTRA_AGENT_RUNTIME_LOCAL_URL ??
      "http://127.0.0.1:19080",
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizePrivateKey(value: string) {
  const key = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error("Owner private key is invalid");
  return key as `0x${string}`;
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

function extractErc8004TokenId(receipt: TransactionReceipt, ownerAddress: Address) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ARC_ERC8004_IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: erc8004IdentityRegistryAbi,
        data: log.data,
        topics: log.topics,
        eventName: "Transfer",
      });
      const args = decoded.args as { from?: string; to?: string; tokenId?: bigint };
      if (
        args.from?.toLowerCase() === zeroAddress &&
        args.to?.toLowerCase() === ownerAddress.toLowerCase() &&
        args.tokenId !== undefined
      ) {
        return args.tokenId;
      }
    } catch {
      // Ignore unrelated logs.
    }
  }
  throw new Error("ERC-8004 token id was not found in the register receipt");
}

function metadataFor(spec: LiveAgentSpec) {
  return {
    schema: "https://sentra.protocol/metadata/agent/v1",
    name: spec.name,
    description: spec.description,
    agent_type: "sentra_prediction_agent",
    strategy: spec.strategy,
    version: "1.0.0",
    riskLimits: spec.riskLimits,
  };
}

async function postRuntime<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${runtimeWriteBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentra-runtime-secret": requiredEnv("SENTRA_AGENT_WORKER_SECRET"),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Runtime ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

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

async function main() {
  loadLocalEnv();

  const ownerKey = normalizePrivateKey(
    process.env.SENTRA_PROTOCOL_OWNER_PRIVATE_KEY ??
      process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY ??
      "",
  );
  const account = privateKeyToAccount(ownerKey);
  const publicClient = createPublicClient({
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL ?? ARC_RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL ?? ARC_RPC_URL),
  });

  const nativeBalance = await publicClient.getBalance({ address: account.address });
  const erc20Balance = await publicClient.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log(
    `Registering live agents from ${account.address} (native ${formatUnits(
      nativeBalance,
      18,
    )} USDC, ERC-20 ${formatUnits(erc20Balance, 6)} USDC)`,
  );

  let remainingStakeBalance = erc20Balance;
  const results = [];

  for (const spec of liveAgents) {
    const metadata = metadataFor(spec);
    const registryAgentId = hashText(`sentra:live-agent:${spec.slug}:${liveAgentRegistryVersion}`);
    const metadataHash = hashJson(metadata);
    const strategyHash = hashText(spec.strategy);
    const riskHash = hashJson(spec.riskLimits);
    const predictionKeyHash = hashText(
      `sentra:live-agent:prediction-key:${spec.slug}:${liveAgentRegistryVersion}`,
    );
    const capUnits = parseUnits(spec.delegationCapUsdc.toFixed(6), 6);
    const stakeUnits = parseUnits(spec.stakeUsdc.toFixed(6), 6);

    const runtimeAgent = await postRuntime<RuntimeAgentResponse>("/agents", {
      ownerId: `wallet:${account.address.toLowerCase()}`,
      ownerAddress: account.address,
      slug: spec.slug,
      name: spec.name,
      strategy: spec.strategy,
      description: spec.description,
      registryAgentId,
      metadataHash,
      strategyHash,
      riskHash,
      predictionKeyHash,
      stakeUsdc: 0,
      delegationCapUsdc: spec.delegationCapUsdc,
      riskLimits: spec.riskLimits,
      autoCalls: true,
    });

    if (!isAddress(runtimeAgent.treasuryAddress)) {
      throw new Error(`${spec.slug} returned an invalid runtime treasury address`);
    }

    let arcErc8004Id: bigint;
    let erc8004TxHash = zeroHash;
    let registryTxHash = zeroHash;
    let stakeTxHash: `0x${string}` | undefined;

    const alreadyRegistered = await publicClient.readContract({
      address: sentraProtocolContracts.agentRegistry as Address,
      abi: sentraAgentRegistryAbi,
      functionName: "isRegistered",
      args: [registryAgentId],
    });

    if (alreadyRegistered) {
      arcErc8004Id = await publicClient.readContract({
        address: sentraProtocolContracts.agentRegistry as Address,
        abi: sentraAgentRegistryAbi,
        functionName: "erc8004Id",
        args: [registryAgentId],
      });
      console.log(`${spec.name}: already registered as ERC-8004 #${arcErc8004Id}`);
    } else {
      erc8004TxHash = await walletClient.writeContract({
        address: ARC_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityRegistryAbi,
        functionName: "register",
        args: [runtimeAgent.metadataUri],
      });
      const erc8004Receipt = await publicClient.waitForTransactionReceipt({
        hash: erc8004TxHash,
      });
      if (erc8004Receipt.status !== "success") {
        throw new Error(`${spec.name}: ERC-8004 register failed`);
      }
      arcErc8004Id = extractErc8004TokenId(erc8004Receipt, account.address);

      registryTxHash = await walletClient.writeContract({
        address: sentraProtocolContracts.agentRegistry as Address,
        abi: sentraAgentRegistryAbi,
        functionName: "registerAgent",
        args: [
          {
            agentId: registryAgentId,
            wallet: runtimeAgent.treasuryAddress,
            arcErc8004Id,
            metadataHash,
            strategyHash,
            riskHash,
            predictionKeyHash,
            stakeRequirement: 0n,
            delegationCap: capUnits,
          },
        ],
      });
      const registryReceipt = await publicClient.waitForTransactionReceipt({
        hash: registryTxHash,
      });
      if (registryReceipt.status !== "success") {
        throw new Error(`${spec.name}: SENTRA registry transaction failed`);
      }
      console.log(`${spec.name}: registered as ERC-8004 #${arcErc8004Id}`);
    }

    let confirmedStakeUsdc = 0;
    const currentStake = await publicClient.readContract({
      address: sentraProtocolContracts.stakeVault as Address,
      abi: sentraStakeVaultAbi,
      functionName: "stakeOf",
      args: [registryAgentId],
    });
    if (currentStake >= stakeUnits) {
      confirmedStakeUsdc = Number(formatUnits(currentStake, 6));
    } else if (remainingStakeBalance >= stakeUnits) {
      const approveTxHash = await walletClient.writeContract({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [sentraProtocolContracts.stakeVault as Address, stakeUnits],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

      stakeTxHash = await walletClient.writeContract({
        address: sentraProtocolContracts.stakeVault as Address,
        abi: sentraStakeVaultAbi,
        functionName: "depositStake",
        args: [registryAgentId, stakeUnits],
      });
      const stakeReceipt = await publicClient.waitForTransactionReceipt({ hash: stakeTxHash });
      if (stakeReceipt.status === "success") {
        remainingStakeBalance -= stakeUnits;
        confirmedStakeUsdc = spec.stakeUsdc;
      }
    } else {
      console.warn(`${spec.name}: skipped stake; owner wallet has insufficient ERC-20 USDC`);
    }

    await postRuntime(`/agents/${encodeURIComponent(spec.slug)}/deployment`, {
      agentId: spec.slug,
      ownerAddress: account.address,
      agentWalletAddress: runtimeAgent.treasuryAddress,
      registryAgentId,
      arcErc8004Id: arcErc8004Id.toString(),
      erc8004TxHash,
      registryTxHash,
      stakeTxHash,
      stakeUsdc: confirmedStakeUsdc,
    });

    results.push({
      slug: spec.slug,
      name: spec.name,
      strategy: spec.strategy,
      registryAgentId,
      arcErc8004Id: arcErc8004Id.toString(),
      treasuryAddress: runtimeAgent.treasuryAddress,
      circleWalletId: runtimeAgent.circleWalletId || null,
      erc8004TxHash,
      registryTxHash,
      stakeTxHash: stakeTxHash ?? null,
      stakeUsdc: confirmedStakeUsdc,
      metadataUri: runtimeAgent.metadataUri,
    });
  }

  console.log(
    JSON.stringify(
      { ownerAddress: account.address, runtime: runtimeWriteBaseUrl(), agents: results },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
