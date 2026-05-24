// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct AgentProfile {
    bytes32 agentId;
    bytes32 metadataHash;
    bytes32 strategyHash;
    bytes32 riskHash;
    bytes32 predictionKeyHash;
    address wallet;
    address usdcStakeToken;
    uint256 usdcStake;
    uint256 delegationCap;
    uint256 gatewayBalance;
    uint256 reputation;
    uint256 brierScore;
    bool slashed;
    bool callAccessEnabled;
}

struct AgentRegistration {
    bytes32 agentId;
    address wallet;
    uint256 arcErc8004Id;
    bytes32 metadataHash;
    bytes32 strategyHash;
    bytes32 riskHash;
    bytes32 predictionKeyHash;
    uint256 stakeRequirement;
    uint256 delegationCap;
}

struct PredictionCommitment {
    bytes32 agentId;
    bytes32 marketId;
    bytes32 predictionHash;
    bytes32 signatureHash;
    uint64 createdAt;
    uint64 resolvesAt;
    uint16 confidenceBps;
    bool resolved;
    bool outcome;
}
