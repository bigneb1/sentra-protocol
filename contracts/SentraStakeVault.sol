// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraStakeVault {
    IERC20Minimal public immutable usdc;
    ISentraAgentRegistry public immutable registry;
    address public slashingModule;

    mapping(bytes32 => uint256) public stakeOf;
    mapping(bytes32 => uint256) public slashedStakeOf;

    event StakeDeposited(bytes32 indexed agentId, address indexed funder, uint256 amount);
    event StakeReleased(bytes32 indexed agentId, address indexed recipient, uint256 amount);
    event StakeSlashed(bytes32 indexed agentId, address indexed recipient, uint256 amount, bytes32 reasonHash);
    event SlashingModuleUpdated(address indexed module);

    constructor(address usdcAddress, address registryAddress) {
        usdc = IERC20Minimal(usdcAddress);
        registry = ISentraAgentRegistry(registryAddress);
    }

    modifier onlyProtocolOwner() {
        require(msg.sender == registry.owner(), "only protocol owner");
        _;
    }

    function setSlashingModule(address module) external onlyProtocolOwner {
        require(module != address(0), "module required");
        slashingModule = module;
        emit SlashingModuleUpdated(module);
    }

    function depositStake(bytes32 agentId, uint256 amount) external {
        require(registry.isRegistered(agentId), "agent missing");
        require(registry.agentOwner(agentId) == msg.sender, "not agent owner");
        require(amount > 0, "amount required");

        stakeOf[agentId] += amount;
        registry.setStakeBalance(agentId, stakeOf[agentId]);
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");

        emit StakeDeposited(agentId, msg.sender, amount);
    }

    function releaseStake(bytes32 agentId, address recipient, uint256 amount) external onlyProtocolOwner {
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(stakeOf[agentId] >= amount, "insufficient stake");

        stakeOf[agentId] -= amount;
        registry.setStakeBalance(agentId, stakeOf[agentId]);
        require(usdc.transfer(recipient, amount), "transfer failed");

        emit StakeReleased(agentId, recipient, amount);
    }

    function slash(bytes32 agentId, address recipient, uint256 amount, bytes32 reasonHash) external {
        require(msg.sender == registry.owner() || msg.sender == slashingModule, "not authorized");
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(stakeOf[agentId] >= amount, "insufficient stake");

        stakeOf[agentId] -= amount;
        slashedStakeOf[agentId] += amount;
        registry.setStakeBalance(agentId, stakeOf[agentId]);
        registry.setAgentSlashed(agentId, true);
        require(usdc.transfer(recipient, amount), "transfer failed");

        emit StakeSlashed(agentId, recipient, amount, reasonHash);
    }
}
