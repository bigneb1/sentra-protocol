// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SentraTypes.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraPredictionRegistry is Pausable {
    ISentraAgentRegistry public immutable registry;

    mapping(bytes32 => PredictionCommitment) public predictions;
    mapping(bytes32 => bytes32[]) public agentPredictions;

    event PredictionSubmitted(
        bytes32 indexed predictionId,
        bytes32 indexed agentId,
        bytes32 indexed marketId,
        bytes32 predictionHash,
        bytes32 signatureHash,
        uint16 confidenceBps,
        uint64 resolvesAt
    );
    event PredictionResolved(bytes32 indexed predictionId, bool outcome);

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

    function submitPrediction(
        bytes32 predictionId,
        bytes32 agentId,
        bytes32 marketId,
        bytes32 predictionHash,
        bytes32 signatureHash,
        uint16 confidenceBps,
        uint64 resolvesAt
    ) external whenNotPaused {
        require(registry.isRegistered(agentId), "agent missing");
        require(registry.agentWallet(agentId) == msg.sender || registry.agentOwner(agentId) == msg.sender, "not authorized");
        require(predictions[predictionId].createdAt == 0, "prediction exists");
        require(predictionHash != bytes32(0), "prediction hash required");
        require(signatureHash != bytes32(0), "signature hash required");
        require(confidenceBps <= 10_000, "confidence too high");
        require(resolvesAt > block.timestamp, "resolve time required");

        predictions[predictionId] = PredictionCommitment({
            agentId: agentId,
            marketId: marketId,
            predictionHash: predictionHash,
            signatureHash: signatureHash,
            createdAt: uint64(block.timestamp),
            resolvesAt: resolvesAt,
            confidenceBps: confidenceBps,
            resolved: false,
            outcome: false
        });
        agentPredictions[agentId].push(predictionId);

        emit PredictionSubmitted(
            predictionId,
            agentId,
            marketId,
            predictionHash,
            signatureHash,
            confidenceBps,
            resolvesAt
        );
    }

    function resolvePrediction(bytes32 predictionId, bool outcome) external onlyProtocolOwner whenNotPaused {
        PredictionCommitment storage prediction = predictions[predictionId];
        require(prediction.createdAt != 0, "prediction missing");
        require(!prediction.resolved, "already resolved");

        prediction.resolved = true;
        prediction.outcome = outcome;
        emit PredictionResolved(predictionId, outcome);
    }
}
