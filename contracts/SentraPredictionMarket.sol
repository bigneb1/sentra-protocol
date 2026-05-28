// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20Minimal.sol";

contract SentraPredictionMarket is Pausable, ReentrancyGuard {
    enum Outcome {
        Unresolved,
        Yes,
        No,
        Invalid
    }

    IERC20Minimal public immutable usdc;
    address public immutable factory;
    address public oracle;
    bytes32 public marketId;
    string public question;
    string public metadataUri;
    uint64 public closesAt;
    Outcome public resolvedOutcome;
    uint256 public totalYesShares;
    uint256 public totalNoShares;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;
    mapping(address => bool) public claimed;

    event PositionBought(address indexed trader, bool indexed isYes, uint256 amount);
    event PositionSold(address indexed trader, bool indexed isYes, uint256 amount);
    event OracleUpdated(address indexed oracle);
    event MarketResolved(Outcome outcome);
    event PayoutClaimed(address indexed trader, uint256 amount);

    constructor(
        address usdcAddress,
        address oracleAddress,
        bytes32 marketId_,
        string memory question_,
        string memory metadataUri_,
        uint64 closesAt_
    ) {
        require(usdcAddress != address(0), "usdc required");
        require(oracleAddress != address(0), "oracle required");
        require(closesAt_ > block.timestamp, "close time required");
        require(bytes(question_).length > 0, "question required");
        usdc = IERC20Minimal(usdcAddress);
        factory = msg.sender;
        oracle = oracleAddress;
        marketId = marketId_;
        question = question_;
        metadataUri = metadataUri_;
        closesAt = closesAt_;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "only oracle");
        _;
    }

    modifier unresolved() {
        require(resolvedOutcome == Outcome.Unresolved, "market resolved");
        _;
    }

    function pause() external onlyFactory {
        _pause();
    }

    function unpause() external onlyFactory {
        _unpause();
    }

    function setOracle(address nextOracle) external onlyFactory {
        require(nextOracle != address(0), "oracle required");
        oracle = nextOracle;
        emit OracleUpdated(nextOracle);
    }

    function buy(bool isYes, uint256 amount) external nonReentrant whenNotPaused unresolved {
        require(block.timestamp < closesAt, "market closed");
        require(amount > 0, "amount required");
        require(usdc.transferFrom(msg.sender, address(this), amount), "payment failed");
        if (isYes) {
            yesShares[msg.sender] += amount;
            totalYesShares += amount;
        } else {
            noShares[msg.sender] += amount;
            totalNoShares += amount;
        }
        emit PositionBought(msg.sender, isYes, amount);
    }

    function sell(bool isYes, uint256 amount) external nonReentrant whenNotPaused unresolved {
        require(block.timestamp < closesAt, "market closed");
        require(amount > 0, "amount required");
        if (isYes) {
            require(yesShares[msg.sender] >= amount, "insufficient yes");
            yesShares[msg.sender] -= amount;
            totalYesShares -= amount;
        } else {
            require(noShares[msg.sender] >= amount, "insufficient no");
            noShares[msg.sender] -= amount;
            totalNoShares -= amount;
        }
        require(usdc.transfer(msg.sender, amount), "transfer failed");
        emit PositionSold(msg.sender, isYes, amount);
    }

    function resolve(Outcome outcome) external onlyOracle whenNotPaused unresolved {
        require(block.timestamp >= closesAt, "market open");
        require(outcome != Outcome.Unresolved, "bad outcome");
        resolvedOutcome = outcome;
        emit MarketResolved(outcome);
    }

    function claim() external nonReentrant whenNotPaused {
        require(resolvedOutcome != Outcome.Unresolved, "not resolved");
        require(!claimed[msg.sender], "already claimed");
        claimed[msg.sender] = true;

        uint256 payout;
        uint256 pool = totalYesShares + totalNoShares;
        if (resolvedOutcome == Outcome.Yes) {
            require(totalYesShares > 0, "no winning pool");
            payout = (yesShares[msg.sender] * pool) / totalYesShares;
        } else if (resolvedOutcome == Outcome.No) {
            require(totalNoShares > 0, "no winning pool");
            payout = (noShares[msg.sender] * pool) / totalNoShares;
        } else {
            payout = yesShares[msg.sender] + noShares[msg.sender];
        }

        require(payout > 0, "nothing to claim");
        yesShares[msg.sender] = 0;
        noShares[msg.sender] = 0;
        require(usdc.transfer(msg.sender, payout), "transfer failed");
        emit PayoutClaimed(msg.sender, payout);
    }
}
