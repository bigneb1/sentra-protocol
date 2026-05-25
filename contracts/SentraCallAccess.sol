// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraCallAccess is Pausable, ReentrancyGuard {
    IERC20Minimal public immutable usdc;
    ISentraAgentRegistry public immutable registry;

    mapping(bytes32 => uint256) public priceByCall;
    mapping(bytes32 => mapping(address => bool)) public hasAccess;

    event CallPriced(bytes32 indexed callId, uint256 price);
    event CallUnlocked(bytes32 indexed callId, address indexed subscriber, uint256 price);
    event FeesWithdrawn(address indexed recipient, uint256 amount);

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

    function setCallPrice(bytes32 callId, uint256 price) external onlyProtocolOwner whenNotPaused {
        priceByCall[callId] = price;
        emit CallPriced(callId, price);
    }

    function unlock(bytes32 callId) external nonReentrant whenNotPaused {
        uint256 price = priceByCall[callId];
        require(price > 0, "call not priced");
        require(!hasAccess[callId][msg.sender], "already unlocked");
        require(usdc.transferFrom(msg.sender, address(this), price), "payment failed");
        hasAccess[callId][msg.sender] = true;
        emit CallUnlocked(callId, msg.sender, price);
    }

    function withdrawFees(address recipient, uint256 amount) external onlyProtocolOwner nonReentrant {
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(usdc.transfer(recipient, amount), "transfer failed");
        emit FeesWithdrawn(recipient, amount);
    }
}
