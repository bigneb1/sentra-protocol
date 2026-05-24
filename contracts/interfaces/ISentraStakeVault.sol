// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISentraStakeVault {
    function slash(bytes32 agentId, address recipient, uint256 amount, bytes32 reasonHash) external;
}
