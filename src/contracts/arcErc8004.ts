import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
} from "@/lib/arcTestnet";

export const arcErc8004Contracts = {
  identityRegistry: ARC_ERC8004_IDENTITY_REGISTRY,
  reputationRegistry: ARC_ERC8004_REPUTATION_REGISTRY,
  validationRegistry: ARC_ERC8004_VALIDATION_REGISTRY,
} as const;

export const erc8004IdentityRegistryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "uri", type: "string" }],
  },
] as const;
