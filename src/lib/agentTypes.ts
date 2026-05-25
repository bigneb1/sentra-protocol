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
};

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const envAddress = (key: string) => viteEnv?.[key] ?? process.env[key] ?? "";

export const SENTRA_PROTOCOL_CONTRACTS: SentraRegistryConfig = {
  agentRegistry: envAddress("VITE_SENTRA_AGENT_REGISTRY_ADDRESS"),
  stakeVault: envAddress("VITE_SENTRA_STAKE_VAULT_ADDRESS"),
  delegationVault: envAddress("VITE_SENTRA_DELEGATION_VAULT_ADDRESS"),
  predictionRegistry: envAddress("VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS"),
  reputationOracle: envAddress("VITE_SENTRA_REPUTATION_ORACLE_ADDRESS"),
  slashingModule: envAddress("VITE_SENTRA_SLASHING_MODULE_ADDRESS"),
  callAccess: envAddress("VITE_SENTRA_CALL_ACCESS_ADDRESS"),
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
