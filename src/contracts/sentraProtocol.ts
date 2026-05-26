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
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
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
] as const;
