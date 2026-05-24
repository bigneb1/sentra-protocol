import { network } from "hardhat";
import { ARC_USDC_ADDRESS } from "../src/lib/arcTestnet";

async function main() {
  const { viem } = await network.connect();

  const agentRegistry = await viem.deployContract("SentraAgentRegistry", [ARC_USDC_ADDRESS]);
  const stakeVault = await viem.deployContract("SentraStakeVault", [
    ARC_USDC_ADDRESS,
    agentRegistry.address,
  ]);
  const delegationVault = await viem.deployContract("SentraDelegationVault", [
    ARC_USDC_ADDRESS,
    agentRegistry.address,
  ]);
  const predictionRegistry = await viem.deployContract("SentraPredictionRegistry", [
    agentRegistry.address,
  ]);
  const reputationOracle = await viem.deployContract("SentraReputationOracle", [
    agentRegistry.address,
  ]);
  const slashingModule = await viem.deployContract("SentraSlashingModule", [
    agentRegistry.address,
    stakeVault.address,
  ]);
  const callAccess = await viem.deployContract("SentraCallAccess", [
    ARC_USDC_ADDRESS,
    agentRegistry.address,
  ]);

  await agentRegistry.write.setStakeVault([stakeVault.address]);
  await agentRegistry.write.setReputationOracle([reputationOracle.address]);
  await stakeVault.write.setSlashingModule([slashingModule.address]);

  console.log(
    JSON.stringify(
      {
        agentRegistry: agentRegistry.address,
        stakeVault: stakeVault.address,
        delegationVault: delegationVault.address,
        predictionRegistry: predictionRegistry.address,
        reputationOracle: reputationOracle.address,
        slashingModule: slashingModule.address,
        callAccess: callAccess.address,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
