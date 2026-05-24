// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraDelegationVault {
    IERC20Minimal public immutable usdc;
    ISentraAgentRegistry public immutable registry;

    mapping(bytes32 => uint256) public totalDelegated;
    mapping(bytes32 => uint256) public totalShares;
    mapping(bytes32 => mapping(address => uint256)) public delegatedBy;
    mapping(bytes32 => mapping(address => uint256)) public shareBalanceOf;

    event Delegated(bytes32 indexed agentId, address indexed delegator, uint256 amount, uint256 shares);
    event Withdrawn(bytes32 indexed agentId, address indexed delegator, uint256 amount, uint256 shares);

    constructor(address usdcAddress, address registryAddress) {
        usdc = IERC20Minimal(usdcAddress);
        registry = ISentraAgentRegistry(registryAddress);
    }

    function delegate(bytes32 agentId, uint256 amount) external {
        require(registry.isRegistered(agentId), "agent missing");
        require(amount > 0, "amount required");

        uint256 cap = registry.delegationCapOf(agentId);
        require(cap > 0, "delegation closed");
        require(totalDelegated[agentId] + amount <= cap, "delegation cap exceeded");

        uint256 shares = amount;
        totalDelegated[agentId] += amount;
        delegatedBy[agentId][msg.sender] += amount;
        totalShares[agentId] += shares;
        shareBalanceOf[agentId][msg.sender] += shares;
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");

        emit Delegated(agentId, msg.sender, amount, shares);
    }

    function withdraw(bytes32 agentId, uint256 amount) external {
        require(amount > 0, "amount required");
        require(delegatedBy[agentId][msg.sender] >= amount, "insufficient delegation");

        uint256 shares = amount;
        require(shareBalanceOf[agentId][msg.sender] >= shares, "insufficient shares");

        delegatedBy[agentId][msg.sender] -= amount;
        shareBalanceOf[agentId][msg.sender] -= shares;
        totalDelegated[agentId] -= amount;
        totalShares[agentId] -= shares;
        require(usdc.transfer(msg.sender, amount), "transfer failed");

        emit Withdrawn(agentId, msg.sender, amount, shares);
    }
}
