import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, parseUnits, toHex } from "viem";

const usdc = (value: string) => parseUnits(value, 6);
const hash = (value: string) => keccak256(toHex(value));

async function deployProtocol() {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const [, agentOwner, delegator, treasury] = await viem.getWalletClients();
  const token = await viem.deployContract("MockUSDC");
  const registry = await viem.deployContract("SentraAgentRegistry", [token.address]);
  const stakeVault = await viem.deployContract("SentraStakeVault", [
    token.address,
    registry.address,
  ]);
  const delegationVault = await viem.deployContract("SentraDelegationVault", [
    token.address,
    registry.address,
  ]);
  const predictionRegistry = await viem.deployContract("SentraPredictionRegistry", [
    registry.address,
  ]);
  const reputationOracle = await viem.deployContract("SentraReputationOracle", [registry.address]);
  const slashingModule = await viem.deployContract("SentraSlashingModule", [
    registry.address,
    stakeVault.address,
  ]);
  const callAccess = await viem.deployContract("SentraCallAccess", [
    token.address,
    registry.address,
  ]);

  await registry.write.setStakeVault([stakeVault.address]);
  await registry.write.setReputationOracle([reputationOracle.address]);
  await stakeVault.write.setSlashingModule([slashingModule.address]);

  const registryAsAgent = await viem.getContractAt("SentraAgentRegistry", registry.address, {
    client: { public: publicClient, wallet: agentOwner },
  });
  const agentId = hash(`agent-${crypto.randomUUID()}`);
  await registryAsAgent.write.registerAgent([
    {
      agentId,
      wallet: agentOwner.account.address,
      arcErc8004Id: 1n,
      metadataHash: hash("metadata"),
      strategyHash: hash("strategy"),
      riskHash: hash("risk"),
      predictionKeyHash: hash("prediction-key"),
      stakeRequirement: usdc("100"),
      delegationCap: usdc("100"),
    },
  ]);

  return {
    token,
    registry,
    stakeVault,
    delegationVault,
    predictionRegistry,
    reputationOracle,
    slashingModule,
    callAccess,
    agentId,
    viem,
    publicClient,
    testClient,
    agentOwner,
    delegator,
    treasury,
  };
}

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await run("accepts delegation up to cap and rejects excess capital", async () => {
  const { token, delegationVault, agentId, viem, publicClient, delegator } = await deployProtocol();
  const tokenAsDelegator = await viem.getContractAt("MockUSDC", token.address, {
    client: { public: publicClient, wallet: delegator },
  });
  const vaultAsDelegator = await viem.getContractAt(
    "SentraDelegationVault",
    delegationVault.address,
    {
      client: { public: publicClient, wallet: delegator },
    },
  );

  await token.write.mint([delegator.account.address, usdc("200")]);
  await tokenAsDelegator.write.approve([delegationVault.address, usdc("200")]);
  await vaultAsDelegator.write.delegate([agentId, usdc("50")]);

  assert.equal(await delegationVault.read.totalDelegated([agentId]), usdc("50"));
  await assert.rejects(
    vaultAsDelegator.write.delegate([agentId, usdc("60")]),
    /delegation cap exceeded/,
  );
});

await run("locks delegation withdrawals for the withdrawal delay", async () => {
  const { token, delegationVault, agentId, viem, publicClient, testClient, delegator } =
    await deployProtocol();
  const tokenAsDelegator = await viem.getContractAt("MockUSDC", token.address, {
    client: { public: publicClient, wallet: delegator },
  });
  const vaultAsDelegator = await viem.getContractAt(
    "SentraDelegationVault",
    delegationVault.address,
    {
      client: { public: publicClient, wallet: delegator },
    },
  );

  await token.write.mint([delegator.account.address, usdc("25")]);
  await tokenAsDelegator.write.approve([delegationVault.address, usdc("25")]);
  await vaultAsDelegator.write.delegate([agentId, usdc("25")]);

  await assert.rejects(vaultAsDelegator.write.withdraw([agentId, usdc("25")]), /withdrawal locked/);
  await testClient.increaseTime({ seconds: 24 * 60 * 60 + 1 });
  await testClient.mine({ blocks: 1 });
  await vaultAsDelegator.write.withdraw([agentId, usdc("25")]);

  assert.equal(await delegationVault.read.totalDelegated([agentId]), 0n);
});

await run("caps slashing and enforces the slash execution timelock", async () => {
  const {
    token,
    stakeVault,
    slashingModule,
    agentId,
    viem,
    publicClient,
    testClient,
    agentOwner,
    treasury,
  } = await deployProtocol();
  const tokenAsAgent = await viem.getContractAt("MockUSDC", token.address, {
    client: { public: publicClient, wallet: agentOwner },
  });
  const stakeAsAgent = await viem.getContractAt("SentraStakeVault", stakeVault.address, {
    client: { public: publicClient, wallet: agentOwner },
  });

  await token.write.mint([agentOwner.account.address, usdc("100")]);
  await tokenAsAgent.write.approve([stakeVault.address, usdc("100")]);
  await stakeAsAgent.write.depositStake([agentId, usdc("100")]);

  await assert.rejects(
    slashingModule.write.proposeSlash([agentId, usdc("60"), hash("bad-resolution")]),
    /slash too high/,
  );
  await slashingModule.write.proposeSlash([agentId, usdc("25"), hash("bad-resolution")]);
  await assert.rejects(
    slashingModule.write.executeSlash([agentId, 0n, treasury.account.address]),
    /slash timelocked/,
  );

  await testClient.increaseTime({ seconds: 60 * 60 + 1 });
  await testClient.mine({ blocks: 1 });
  await slashingModule.write.executeSlash([agentId, 0n, treasury.account.address]);

  assert.equal(await stakeVault.read.stakeOf([agentId]), usdc("75"));
});

await run("unlocks paid calls once and records access", async () => {
  const { token, callAccess, viem, publicClient, delegator } = await deployProtocol();
  const callId = hash("call-1");
  const tokenAsDelegator = await viem.getContractAt("MockUSDC", token.address, {
    client: { public: publicClient, wallet: delegator },
  });
  const callsAsDelegator = await viem.getContractAt("SentraCallAccess", callAccess.address, {
    client: { public: publicClient, wallet: delegator },
  });

  await callAccess.write.setCallPrice([callId, usdc("2")]);
  await token.write.mint([delegator.account.address, usdc("2")]);
  await tokenAsDelegator.write.approve([callAccess.address, usdc("2")]);
  await callsAsDelegator.write.unlock([callId]);

  assert.equal(await callAccess.read.hasAccess([callId, delegator.account.address]), true);
  await assert.rejects(callsAsDelegator.write.unlock([callId]), /already unlocked/);
});
