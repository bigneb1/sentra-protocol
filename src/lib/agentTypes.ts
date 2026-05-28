import {
  ARC_CIRCLE_BLOCKCHAIN,
  ARC_ERC8004_REGISTRIES,
  ARC_GATEWAY,
  ARC_USDC_ADDRESS,
} from "./arcTestnet";

export type AgentStrategy = "Macro" | "Sports" | "Contrarian" | "Yield" | "Tech" | "Custom";

export type AgentRiskLimits = {
  maxDailyLossUsdc: number;
  maxOpenPositions: number;
  maxSlippageBps: number;
  maxLeverage: number;
};

export type AgentValidationState = {
  reputationScore: number;
  validationCount: number;
  lastValidationAt: string | null;
  slashed: boolean;
  slashReason: string | null;
};

export type AgentTreasuryState = {
  circleDeveloperWalletId: string | null;
  circleWalletAddress: string | null;
  gatewayBalanceUsdc: number;
  gatewayDomain: typeof ARC_GATEWAY.domain;
};

export type AgentContractPointers = {
  arcBlockchain: typeof ARC_CIRCLE_BLOCKCHAIN;
  usdcAddress: typeof ARC_USDC_ADDRESS;
  erc8004: typeof ARC_ERC8004_REGISTRIES;
  gateway: typeof ARC_GATEWAY;
};

export type AgentProfile = {
  id: string;
  name: string;
  strategy: AgentStrategy;
  metadataUri: string;
  metadataJson: Record<string, unknown>;
  circleWalletId: string | null;
  predictionSigningKeyId: string | null;
  treasury: AgentTreasuryState;
  usdcStake: number;
  delegationCap: number;
  gatewayBalance: number;
  riskLimits: AgentRiskLimits;
  validation: AgentValidationState;
  reputationHistory: { at: string; score: number }[];
  validationHistory: { at: string; status: string; note: string }[];
  earningsCallSubscriptions: {
    enabled: boolean;
    tier: "free" | "paid";
    monthlyUsd: number;
  };
  contractPointers: AgentContractPointers;
};

export type SentraRegistryConfig = {
  agentRegistry: string;
  stakeVault: string;
  delegationVault: string;
  predictionRegistry: string;
  reputationOracle: string;
  slashingModule: string;
  callAccess: string;
  marketFactory: string;
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const SENTRA_ARC_TESTNET_DEPLOYMENT: SentraRegistryConfig = {
  agentRegistry: "0x8fd4253571148268295044fbb4596145bec27d13",
  stakeVault: "0xf4e7b457d4b6810c65e5d606f952a6766ff0fceb",
  delegationVault: "0x060764b8c367ba5d4b42b27396f3f816f943982f",
  predictionRegistry: "0x25f801c280c8503cd0522ec80ba227ebbdab39bb",
  reputationOracle: "0x6c395664a45c2ac8ad58562595a97b753444fae8",
  slashingModule: "0xd0e7ed978c3f14224dc9aa42ea7ceddae4b44dd3",
  callAccess: "0x7a4350c31d417cc7fb6c3613a8990f847c8dc06a",
  marketFactory: "0x88c7922bf41246a2481e132dbbf6ae224861c2e3",
};

const envAddress = (key: string, fallback: string) =>
  viteEnv?.[key] ?? process.env[key] ?? fallback;

export const SENTRA_PROTOCOL_CONTRACTS: SentraRegistryConfig = {
  agentRegistry: envAddress(
    "VITE_SENTRA_AGENT_REGISTRY_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.agentRegistry,
  ),
  stakeVault: envAddress(
    "VITE_SENTRA_STAKE_VAULT_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.stakeVault,
  ),
  delegationVault: envAddress(
    "VITE_SENTRA_DELEGATION_VAULT_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.delegationVault,
  ),
  predictionRegistry: envAddress(
    "VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.predictionRegistry,
  ),
  reputationOracle: envAddress(
    "VITE_SENTRA_REPUTATION_ORACLE_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.reputationOracle,
  ),
  slashingModule: envAddress(
    "VITE_SENTRA_SLASHING_MODULE_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.slashingModule,
  ),
  callAccess: envAddress(
    "VITE_SENTRA_CALL_ACCESS_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.callAccess,
  ),
  marketFactory: envAddress(
    "VITE_SENTRA_MARKET_FACTORY_ADDRESS",
    SENTRA_ARC_TESTNET_DEPLOYMENT.marketFactory,
  ),
};

export const REQUIRED_AGENT_SETUP = [
  "ERC-8004 identity on Arc",
  "Circle developer-controlled wallet",
  "Agent metadata JSON / URI",
  "Strategy config",
  "Risk limits",
  "USDC stake",
  "Delegation cap",
  "Prediction signing key",
  "Reputation history",
  "Validation history",
  "Slashing state",
  "Earnings-call subscription config",
  "Gateway balance for nanopayments",
] as const;
