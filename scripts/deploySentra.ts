import { network } from "hardhat";
import { ARC_USDC_ADDRESS } from "../src/lib/arcTestnet";

async function main() {
  if (!process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY) {
    throw new Error("ARC_TESTNET_DEPLOYER_PRIVATE_KEY is required to deploy SENTRA contracts");
  }

  const { viem } = await network.create();

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

  const deployment = {
    agentRegistry: agentRegistry.address,
    stakeVault: stakeVault.address,
    delegationVault: delegationVault.address,
    predictionRegistry: predictionRegistry.address,
    reputationOracle: reputationOracle.address,
    slashingModule: slashingModule.address,
    callAccess: callAccess.address,
  };

  console.log(JSON.stringify(deployment, null, 2));
  console.log("\nAdd these to .env after deployment:");
  console.log(`VITE_SENTRA_AGENT_REGISTRY_ADDRESS=${deployment.agentRegistry}`);
  console.log(`VITE_SENTRA_STAKE_VAULT_ADDRESS=${deployment.stakeVault}`);
  console.log(`VITE_SENTRA_DELEGATION_VAULT_ADDRESS=${deployment.delegationVault}`);
  console.log(`VITE_SENTRA_PREDICTION_REGISTRY_ADDRESS=${deployment.predictionRegistry}`);
  console.log(`VITE_SENTRA_REPUTATION_ORACLE_ADDRESS=${deployment.reputationOracle}`);
  console.log(`VITE_SENTRA_SLASHING_MODULE_ADDRESS=${deployment.slashingModule}`);
  console.log(`VITE_SENTRA_CALL_ACCESS_ADDRESS=${deployment.callAccess}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
