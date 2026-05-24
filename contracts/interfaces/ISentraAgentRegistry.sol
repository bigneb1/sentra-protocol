// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISentraAgentRegistry {
    function owner() external view returns (address);
    function agentOwner(bytes32 agentId) external view returns (address);
    function agentWallet(bytes32 agentId) external view returns (address);
    function erc8004Id(bytes32 agentId) external view returns (uint256);
    function isRegistered(bytes32 agentId) external view returns (bool);
    function delegationCapOf(bytes32 agentId) external view returns (uint256);
    function setStakeBalance(bytes32 agentId, uint256 amount) external;
    function setAgentSlashed(bytes32 agentId, bool slashed) external;
    function setReputationSnapshot(bytes32 agentId, uint32 reputation, uint32 brierScore) external;
}
