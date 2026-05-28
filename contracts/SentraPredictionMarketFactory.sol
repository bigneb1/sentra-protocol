// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SentraPredictionMarket.sol";

contract SentraPredictionMarketFactory is Ownable, Pausable {
    address public immutable usdc;
    address public oracle;
    uint256 public marketCount;

    mapping(bytes32 => address) public marketById;
    address[] public markets;

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed market,
        string question,
        string metadataUri,
        uint64 closesAt
    );
    event OracleUpdated(address indexed oracle);

    constructor(address usdcAddress, address oracleAddress) Ownable(msg.sender) {
        require(usdcAddress != address(0), "usdc required");
        require(oracleAddress != address(0), "oracle required");
        usdc = usdcAddress;
        oracle = oracleAddress;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setOracle(address nextOracle) external onlyOwner {
        require(nextOracle != address(0), "oracle required");
        oracle = nextOracle;
        emit OracleUpdated(nextOracle);
    }

    function setMarketOracle(address market, address nextOracle) external onlyOwner {
        require(market != address(0), "market required");
        require(nextOracle != address(0), "oracle required");
        SentraPredictionMarket(market).setOracle(nextOracle);
    }

    function createMarket(
        bytes32 marketId,
        string calldata question,
        string calldata metadataUri,
        uint64 closesAt
    ) external whenNotPaused returns (address market) {
        require(marketId != bytes32(0), "market id required");
        require(marketById[marketId] == address(0), "market exists");
        market = address(new SentraPredictionMarket(usdc, oracle, marketId, question, metadataUri, closesAt));
        marketById[marketId] = market;
        markets.push(market);
        marketCount += 1;
        emit MarketCreated(marketId, market, question, metadataUri, closesAt);
    }

    function allMarkets() external view returns (address[] memory) {
        return markets;
    }
}
