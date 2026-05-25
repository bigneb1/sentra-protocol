// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SentraTypes.sol";

contract SentraAgentRegistry is Pausable {
    address public immutable usdc;
    address public owner;
    address public stakeVault;
    address public reputationOracle;

    mapping(bytes32 => AgentProfile) private agentProfiles;
    mapping(bytes32 => address) public agentOwner;
    mapping(bytes32 => address) public agentWallet;
    mapping(bytes32 => uint256) public erc8004Id;
    mapping(uint256 => bytes32) public appAgentByErc8004Id;
    mapping(bytes32 => bool) public registered;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, address wallet, uint256 erc8004Id);
    event AgentUpdated(
        bytes32 indexed agentId,
        bytes32 metadataHash,
        bytes32 strategyHash,
        bytes32 riskHash,
        bytes32 predictionKeyHash
    );
    event AgentRiskUpdated(bytes32 indexed agentId, uint256 delegationCap);
    event GatewayBalanceUpdated(bytes32 indexed agentId, uint256 balance);
    event ModuleUpdated(bytes32 indexed module, address indexed moduleAddress);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyAgentOwner(bytes32 agentId) {
        require(agentOwner[agentId] == msg.sender, "not agent owner");
        _;
    }

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "usdc required");
        owner = msg.sender;
        usdc = usdcAddress;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner required");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setStakeVault(address vault) external onlyOwner {
        require(vault != address(0), "vault required");
        stakeVault = vault;
        emit ModuleUpdated("STAKE_VAULT", vault);
    }

    function setReputationOracle(address oracle) external onlyOwner {
        require(oracle != address(0), "oracle required");
        reputationOracle = oracle;
        emit ModuleUpdated("REPUTATION_ORACLE", oracle);
    }

    function registerAgent(AgentRegistration calldata input) external whenNotPaused {
        require(!registered[input.agentId], "already registered");
        require(input.agentId != bytes32(0), "agent id required");
        require(input.wallet != address(0), "wallet required");
        require(input.arcErc8004Id != 0, "erc8004 id required");
        require(appAgentByErc8004Id[input.arcErc8004Id] == bytes32(0), "erc8004 id used");
        require(input.metadataHash != bytes32(0), "metadata hash required");
        require(input.strategyHash != bytes32(0), "strategy hash required");
        require(input.riskHash != bytes32(0), "risk hash required");
        require(input.predictionKeyHash != bytes32(0), "prediction key required");

        registered[input.agentId] = true;
        agentOwner[input.agentId] = msg.sender;
        agentWallet[input.agentId] = input.wallet;
        erc8004Id[input.agentId] = input.arcErc8004Id;
        appAgentByErc8004Id[input.arcErc8004Id] = input.agentId;

        AgentProfile storage agent = agentProfiles[input.agentId];
        agent.agentId = input.agentId;
        agent.metadataHash = input.metadataHash;
        agent.strategyHash = input.strategyHash;
        agent.riskHash = input.riskHash;
        agent.predictionKeyHash = input.predictionKeyHash;
        agent.wallet = input.wallet;
        agent.usdcStakeToken = usdc;
        agent.usdcStake = input.stakeRequirement;
        agent.delegationCap = input.delegationCap;

        emit AgentRegistered(input.agentId, msg.sender, input.wallet, input.arcErc8004Id);
    }

    function updateAgentHashes(
        bytes32 agentId,
        bytes32 metadataHash,
        bytes32 strategyHash,
        bytes32 riskHash,
        bytes32 predictionKeyHash
    ) external onlyAgentOwner(agentId) whenNotPaused {
        require(registered[agentId], "agent missing");
        AgentProfile storage agent = agentProfiles[agentId];
        agent.metadataHash = metadataHash;
        agent.strategyHash = strategyHash;
        agent.riskHash = riskHash;
        agent.predictionKeyHash = predictionKeyHash;
        emit AgentUpdated(agentId, metadataHash, strategyHash, riskHash, predictionKeyHash);
    }

    function updateDelegationCap(bytes32 agentId, uint256 delegationCap) external onlyAgentOwner(agentId) whenNotPaused {
        require(registered[agentId], "agent missing");
        agentProfiles[agentId].delegationCap = delegationCap;
        emit AgentRiskUpdated(agentId, delegationCap);
    }

    function setGatewayBalance(bytes32 agentId, uint256 balance) external whenNotPaused {
        require(msg.sender == owner || agentOwner[agentId] == msg.sender, "not authorized");
        require(registered[agentId], "agent missing");
        agentProfiles[agentId].gatewayBalance = balance;
        emit GatewayBalanceUpdated(agentId, balance);
    }

    function setStakeBalance(bytes32 agentId, uint256 amount) external whenNotPaused {
        require(msg.sender == stakeVault, "only stake vault");
        require(registered[agentId], "agent missing");
        agentProfiles[agentId].usdcStake = amount;
    }

    function setAgentSlashed(bytes32 agentId, bool slashed) external whenNotPaused {
        require(msg.sender == stakeVault || msg.sender == owner, "not authorized");
        require(registered[agentId], "agent missing");
        agentProfiles[agentId].slashed = slashed;
    }

    function setReputationSnapshot(bytes32 agentId, uint32 reputation, uint32 brierScore) external whenNotPaused {
        require(msg.sender == reputationOracle || msg.sender == owner, "not authorized");
        require(registered[agentId], "agent missing");
        agentProfiles[agentId].reputation = reputation;
        agentProfiles[agentId].brierScore = brierScore;
    }

    function isRegistered(bytes32 agentId) external view returns (bool) {
        return registered[agentId];
    }

    function delegationCapOf(bytes32 agentId) external view returns (uint256) {
        return agentProfiles[agentId].delegationCap;
    }

    function agentHashes(bytes32 agentId) external view returns (
        bytes32 metadataHash,
        bytes32 strategyHash,
        bytes32 riskHash,
        bytes32 predictionKeyHash
    ) {
        AgentProfile storage agent = agentProfiles[agentId];
        return (agent.metadataHash, agent.strategyHash, agent.riskHash, agent.predictionKeyHash);
    }

    function agentAccounting(bytes32 agentId) external view returns (
        address usdcStakeToken,
        uint256 usdcStake,
        uint256 delegationCap,
        uint256 gatewayBalance,
        uint256 reputation,
        uint256 brierScore,
        bool slashed,
        bool callAccessEnabled
    ) {
        AgentProfile storage agent = agentProfiles[agentId];
        return (
            agent.usdcStakeToken,
            agent.usdcStake,
            agent.delegationCap,
            agent.gatewayBalance,
            agent.reputation,
            agent.brierScore,
            agent.slashed,
            agent.callAccessEnabled
        );
    }
}
