// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISentraAgentRegistry.sol";

contract SentraCallAccess {
    IERC20Minimal public immutable usdc;
    ISentraAgentRegistry public immutable registry;

    mapping(bytes32 => uint256) public priceByCall;
    mapping(bytes32 => mapping(address => bool)) public hasAccess;

    event CallPriced(bytes32 indexed callId, uint256 price);
    event CallUnlocked(bytes32 indexed callId, address indexed subscriber, uint256 price);

    constructor(address usdcAddress, address registryAddress) {
        usdc = IERC20Minimal(usdcAddress);
        registry = ISentraAgentRegistry(registryAddress);
    }

    function setCallPrice(bytes32 callId, uint256 price) external {
        require(msg.sender == registry.owner(), "only protocol owner");
        priceByCall[callId] = price;
        emit CallPriced(callId, price);
    }

    function unlock(bytes32 callId) external {
        uint256 price = priceByCall[callId];
        require(price > 0, "call not priced");
        hasAccess[callId][msg.sender] = true;
        require(usdc.transferFrom(msg.sender, address(this), price), "payment failed");
        emit CallUnlocked(callId, msg.sender, price);
    }
}
