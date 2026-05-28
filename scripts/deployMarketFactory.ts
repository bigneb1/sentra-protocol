import { network } from "hardhat";
import { ARC_USDC_ADDRESS } from "../src/lib/arcTestnet";

async function main() {
  if (
    !process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY &&
    !process.env.SENTRA_PROTOCOL_OWNER_PRIVATE_KEY
  ) {
    throw new Error(
      "ARC_TESTNET_DEPLOYER_PRIVATE_KEY or SENTRA_PROTOCOL_OWNER_PRIVATE_KEY is required to deploy the market factory",
    );
  }

  const { viem } = await network.create();
  const [deployer] = await viem.getWalletClients();
  const oracle = process.env.SENTRA_MARKET_ORACLE_ADDRESS ?? deployer.account.address;
  const marketFactory = await viem.deployContract("SentraPredictionMarketFactory", [
    ARC_USDC_ADDRESS,
    oracle,
  ]);

  const deployment = {
    marketFactory: marketFactory.address,
    usdc: ARC_USDC_ADDRESS,
    oracle,
  };

  console.log(JSON.stringify(deployment, null, 2));
  console.log("\nAdd this to Vercel/Lovable env:");
  console.log(`VITE_SENTRA_MARKET_FACTORY_ADDRESS=${deployment.marketFactory}`);
  console.log("\nOptional server-only override:");
  console.log(`SENTRA_MARKET_ORACLE_ADDRESS=${deployment.oracle}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
