// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraReputationOracle is Pausable {
    ISentraAgentRegistry public immutable registry;

    struct ReputationSnapshot {
        uint64 updatedAt;
        uint32 reputation;
        uint32 brierScore;
        uint32 validationCount;
    }

    mapping(bytes32 => ReputationSnapshot) public latest;
    mapping(bytes32 => ReputationSnapshot[]) private history;

    event ReputationUpdated(bytes32 indexed agentId, uint32 reputation, uint32 brierScore, uint32 validationCount);

    constructor(address registryAddress) {
        require(registryAddress != address(0), "registry required");
        registry = ISentraAgentRegistry(registryAddress);
    }

    modifier onlyProtocolOwner() {
        require(msg.sender == registry.owner(), "only protocol owner");
        _;
    }

    function pause() external onlyProtocolOwner {
        _pause();
    }

    function unpause() external onlyProtocolOwner {
        _unpause();
    }

    function recordOutcome(
        bytes32 agentId,
        uint32 reputation,
        uint32 brierScore,
        uint32 validationCount
    ) external onlyProtocolOwner whenNotPaused {
        require(registry.isRegistered(agentId), "agent missing");
        require(reputation <= 10_000, "reputation too high");
        require(brierScore <= 10_000, "brier too high");
        ReputationSnapshot memory snapshot = ReputationSnapshot({
            updatedAt: uint64(block.timestamp),
            reputation: reputation,
            brierScore: brierScore,
            validationCount: validationCount
        });
        latest[agentId] = snapshot;
        history[agentId].push(snapshot);
        registry.setReputationSnapshot(agentId, reputation, brierScore);
        emit ReputationUpdated(agentId, reputation, brierScore, validationCount);
    }

    function historyLength(bytes32 agentId) external view returns (uint256) {
        return history[agentId].length;
    }

    function historyAt(bytes32 agentId, uint256 index) external view returns (ReputationSnapshot memory) {
        return history[agentId][index];
    }
}
