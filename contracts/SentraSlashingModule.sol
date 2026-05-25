// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/ISentraAgentRegistry.sol";
import "./interfaces/ISentraStakeVault.sol";

contract SentraSlashingModule is Pausable {
    uint256 public constant MAX_SLASH_BPS = 5_000;
    uint256 public constant EXECUTION_DELAY = 1 hours;

    ISentraAgentRegistry public immutable registry;
    ISentraStakeVault public immutable stakeVault;

    struct SlashRecord {
        uint64 createdAt;
        uint256 amount;
        bytes32 reasonHash;
        bool executed;
    }

    mapping(bytes32 => SlashRecord[]) private slashes;

    event SlashProposed(bytes32 indexed agentId, uint256 amount, bytes32 reasonHash);
    event SlashExecuted(bytes32 indexed agentId, uint256 indexed index, address indexed recipient);

    constructor(address registryAddress, address stakeVaultAddress) {
        require(registryAddress != address(0), "registry required");
        require(stakeVaultAddress != address(0), "stake vault required");
        registry = ISentraAgentRegistry(registryAddress);
        stakeVault = ISentraStakeVault(stakeVaultAddress);
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

    function proposeSlash(bytes32 agentId, uint256 amount, bytes32 reasonHash) external onlyProtocolOwner whenNotPaused {
        require(registry.isRegistered(agentId), "agent missing");
        require(amount > 0, "amount required");
        uint256 currentStake = stakeVault.stakeOf(agentId);
        require(currentStake > 0, "no stake");
        require(amount <= (currentStake * MAX_SLASH_BPS) / 10_000, "slash too high");

        slashes[agentId].push(SlashRecord({
            createdAt: uint64(block.timestamp),
            amount: amount,
            reasonHash: reasonHash,
            executed: false
        }));
        emit SlashProposed(agentId, amount, reasonHash);
    }

    function executeSlash(bytes32 agentId, uint256 index, address recipient) external onlyProtocolOwner whenNotPaused {
        require(recipient != address(0), "recipient required");

        SlashRecord storage record = slashes[agentId][index];
        require(!record.executed, "already executed");
        require(block.timestamp >= record.createdAt + EXECUTION_DELAY, "slash timelocked");

        record.executed = true;
        stakeVault.slash(agentId, recipient, record.amount, record.reasonHash);
        emit SlashExecuted(agentId, index, recipient);
    }

    function slashCount(bytes32 agentId) external view returns (uint256) {
        return slashes[agentId].length;
    }

    function slashAt(bytes32 agentId, uint256 index) external view returns (SlashRecord memory) {
        return slashes[agentId][index];
    }
}
