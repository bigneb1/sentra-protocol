// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/ISentraAgentRegistry.sol";
import "./interfaces/ISentraStakeVault.sol";

contract SentraSlashingModule {
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
        registry = ISentraAgentRegistry(registryAddress);
        stakeVault = ISentraStakeVault(stakeVaultAddress);
    }

    function proposeSlash(bytes32 agentId, uint256 amount, bytes32 reasonHash) external {
        require(msg.sender == registry.owner(), "only protocol owner");
        require(registry.isRegistered(agentId), "agent missing");
        require(amount > 0, "amount required");

        slashes[agentId].push(SlashRecord({
            createdAt: uint64(block.timestamp),
            amount: amount,
            reasonHash: reasonHash,
            executed: false
        }));
        emit SlashProposed(agentId, amount, reasonHash);
    }

    function executeSlash(bytes32 agentId, uint256 index, address recipient) external {
        require(msg.sender == registry.owner(), "only protocol owner");
        require(recipient != address(0), "recipient required");

        SlashRecord storage record = slashes[agentId][index];
        require(!record.executed, "already executed");

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
