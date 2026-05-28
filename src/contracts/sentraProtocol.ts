import { SENTRA_PROTOCOL_CONTRACTS } from "@/lib/agentTypes";
import { ARC_USDC_ADDRESS } from "@/lib/arcTestnet";

export const sentraProtocolContracts = {
  ...SENTRA_PROTOCOL_CONTRACTS,
  usdc: ARC_USDC_ADDRESS,
} as const;

export const erc20ApprovalAbi = [
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

export const circleSwapAdapterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "instructions",
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
              { name: "tokenIn", type: "address" },
              { name: "amountToApprove", type: "uint256" },
              { name: "tokenOut", type: "address" },
              { name: "minTokenOut", type: "uint256" },
            ],
          },
          {
            name: "tokens",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "beneficiary", type: "address" },
            ],
          },
          { name: "execId", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "metadata", type: "bytes" },
        ],
      },
      {
        name: "tokenInputs",
        type: "tuple[]",
        components: [
          { name: "permitType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "permitCalldata", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const erc20TransferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sentraAgentRegistryAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "agentId", type: "bytes32" },
          { name: "wallet", type: "address" },
          { name: "arcErc8004Id", type: "uint256" },
          { name: "metadataHash", type: "bytes32" },
          { name: "strategyHash", type: "bytes32" },
          { name: "riskHash", type: "bytes32" },
          { name: "predictionKeyHash", type: "bytes32" },
          { name: "stakeRequirement", type: "uint256" },
          { name: "delegationCap", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "delegationCapOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "cap", type: "uint256" }],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "erc8004Id",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "agentOwner",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "agentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "wallet", type: "address", indexed: false },
      { name: "erc8004Id", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sentraStakeVaultAbi = [
  {
    type: "function",
    name: "depositStake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "event",
    name: "StakeDeposited",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sentraDelegationVaultAbi = [
  {
    type: "function",
    name: "totalDelegated",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "delegate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "delegatedBy",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function",
    name: "shareBalanceOf",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Delegated",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "delegator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "delegator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sentraCallAccessAbi = [
  {
    type: "function",
    name: "priceByCall",
    stateMutability: "view",
    inputs: [{ name: "callId", type: "bytes32" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasAccess",
    stateMutability: "view",
    inputs: [
      { name: "callId", type: "bytes32" },
      { name: "subscriber", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setCallPrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "callId", type: "bytes32" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unlock",
    stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "event",
    name: "CallUnlocked",
    inputs: [
      { name: "callId", type: "bytes32", indexed: true },
      { name: "subscriber", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sentraPredictionRegistryAbi = [
  {
    type: "function",
    name: "submitPrediction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "predictionId", type: "bytes32" },
      { name: "agentId", type: "bytes32" },
      { name: "marketId", type: "bytes32" },
      { name: "predictionHash", type: "bytes32" },
      { name: "signatureHash", type: "bytes32" },
      { name: "confidenceBps", type: "uint16" },
      { name: "resolvesAt", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "PredictionSubmitted",
    inputs: [
      { name: "predictionId", type: "bytes32", indexed: true },
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "predictionHash", type: "bytes32", indexed: false },
      { name: "signatureHash", type: "bytes32", indexed: false },
      { name: "confidenceBps", type: "uint16", indexed: false },
      { name: "resolvesAt", type: "uint64", indexed: false },
    ],
  },
] as const;

export const sentraPredictionMarketFactoryAbi = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "question", type: "string" },
      { name: "metadataUri", type: "string" },
      { name: "closesAt", type: "uint64" },
    ],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "function",
    name: "allMarkets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "markets", type: "address[]" }],
  },
  {
    type: "function",
    name: "setMarketOracle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "address" },
      { name: "nextOracle", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "marketById",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "market", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "metadataUri", type: "string", indexed: false },
      { name: "closesAt", type: "uint64", indexed: false },
    ],
  },
] as const;

export const sentraPredictionMarketAbi = [
  {
    type: "function",
    name: "marketId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "question",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "metadataUri",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "closesAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "resolvedOutcome",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [{ name: "outcome", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "yesShares",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "noShares",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalYesShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalNoShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "event",
    name: "PositionBought",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isYes", type: "bool", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionSold",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isYes", type: "bool", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
