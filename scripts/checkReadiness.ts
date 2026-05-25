import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, http, isAddress } from "viem";

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

const { arcTestnet } = await import("../src/lib/wagmi");
const { SENTRA_PROTOCOL_CONTRACTS } = await import("../src/lib/agentTypes");
const { ARC_ERC8004_REGISTRIES, ARC_RPC_URL, ARC_USDC_ADDRESS } =
  await import("../src/lib/arcTestnet");

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CIRCLE_API_KEY",
] as const;
const deployOnlyEnv = ["ARC_TESTNET_DEPLOYER_PRIVATE_KEY"] as const;

const requiredContracts = {
  VITE_SENTRA_AGENT_REGISTRY_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.agentRegistry,
  VITE_SENTRA_STAKE_VAULT_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.stakeVault,
  VITE_SENTRA_DELEGATION_VAULT_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.delegationVault,
  VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.predictionRegistry,
  VITE_SENTRA_REPUTATION_ORACLE_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.reputationOracle,
  VITE_SENTRA_SLASHING_MODULE_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.slashingModule,
  VITE_SENTRA_CALL_ACCESS_ADDRESS: SENTRA_PROTOCOL_CONTRACTS.callAccess,
} as const;

const missingEnv = [
  ...requiredEnv.filter((key) => !process.env[key]),
  !(process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET) &&
    "ENTITY_SECRET or CIRCLE_ENTITY_SECRET",
].filter(Boolean) as string[];
const missingDeployOnlyEnv = deployOnlyEnv.filter((key) => !process.env[key]);
const missingContracts = Object.entries(requiredContracts).filter(
  ([, value]) => !value || !isAddress(value),
);

console.log("SENTRA readiness check");
console.log(`Arc RPC: ${ARC_RPC_URL}`);
console.log(`Arc USDC: ${ARC_USDC_ADDRESS}`);
console.log(`ERC-8004 IdentityRegistry: ${ARC_ERC8004_REGISTRIES.identity}`);
console.log(`ERC-8004 ReputationRegistry: ${ARC_ERC8004_REGISTRIES.reputation}`);
console.log(`ERC-8004 ValidationRegistry: ${ARC_ERC8004_REGISTRIES.validation}`);

if (missingEnv.length > 0) {
  console.log(`Missing env: ${missingEnv.join(", ")}`);
}

if (missingDeployOnlyEnv.length > 0) {
  console.log(`Deploy-only env not set: ${missingDeployOnlyEnv.join(", ")}`);
}

if (missingContracts.length > 0) {
  console.log(`Missing contract addresses: ${missingContracts.map(([key]) => key).join(", ")}`);
}

try {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });
  const block = await client.getBlockNumber();
  console.log(`Arc RPC reachable at block ${block}`);
} catch (error) {
  console.log(`Arc RPC check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (missingEnv.length > 0 || missingContracts.length > 0) {
  process.exitCode = 1;
} else {
  console.log("Ready for product runtime flows.");
}
