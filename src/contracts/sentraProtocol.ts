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
