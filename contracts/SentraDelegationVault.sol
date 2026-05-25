// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraDelegationVault is Pausable, ReentrancyGuard {
    uint256 public constant WITHDRAWAL_DELAY = 24 hours;

    IERC20Minimal public immutable usdc;
    ISentraAgentRegistry public immutable registry;

    mapping(bytes32 => uint256) public totalDelegated;
    mapping(bytes32 => uint256) public totalShares;
    mapping(bytes32 => mapping(address => uint256)) public delegatedBy;
    mapping(bytes32 => mapping(address => uint256)) public shareBalanceOf;
    mapping(bytes32 => mapping(address => uint256)) public lastDelegatedAt;

    event Delegated(bytes32 indexed agentId, address indexed delegator, uint256 amount, uint256 shares);
    event Withdrawn(bytes32 indexed agentId, address indexed delegator, uint256 amount, uint256 shares);

    constructor(address usdcAddress, address registryAddress) {
        require(usdcAddress != address(0), "usdc required");
        require(registryAddress != address(0), "registry required");
        usdc = IERC20Minimal(usdcAddress);
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

    function delegate(bytes32 agentId, uint256 amount) external nonReentrant whenNotPaused {
        require(registry.isRegistered(agentId), "agent missing");
        require(amount > 0, "amount required");

        uint256 cap = registry.delegationCapOf(agentId);
        require(cap > 0, "delegation closed");
        require(totalDelegated[agentId] + amount <= cap, "delegation cap exceeded");

        uint256 shares = amount;
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");
        totalDelegated[agentId] += amount;
        delegatedBy[agentId][msg.sender] += amount;
        totalShares[agentId] += shares;
        shareBalanceOf[agentId][msg.sender] += shares;
        lastDelegatedAt[agentId][msg.sender] = block.timestamp;

        emit Delegated(agentId, msg.sender, amount, shares);
    }

    function withdraw(bytes32 agentId, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount required");
        require(delegatedBy[agentId][msg.sender] >= amount, "insufficient delegation");
        require(block.timestamp >= lastDelegatedAt[agentId][msg.sender] + WITHDRAWAL_DELAY, "withdrawal locked");

        uint256 shares = amount;
        require(shareBalanceOf[agentId][msg.sender] >= shares, "insufficient shares");

        delegatedBy[agentId][msg.sender] -= amount;
        shareBalanceOf[agentId][msg.sender] -= shares;
        totalDelegated[agentId] -= amount;
        totalShares[agentId] -= shares;
        require(usdc.transfer(msg.sender, amount), "transfer failed");

        emit Withdrawn(agentId, msg.sender, amount, shares);
    }

    function availableToWithdrawAt(bytes32 agentId, address delegator) external view returns (uint256) {
        return lastDelegatedAt[agentId][delegator] + WITHDRAWAL_DELAY;
    }
}
