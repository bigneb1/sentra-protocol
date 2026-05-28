import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

const arcTestnetRpcUrl = process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const arcTestnetDeployerPrivateKey =
  process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY ?? process.env.SENTRA_PROTOCOL_OWNER_PRIVATE_KEY;

export default defineConfig({
  plugins: [hardhatViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "paris",
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: arcTestnetRpcUrl,
      accounts: arcTestnetDeployerPrivateKey ? [arcTestnetDeployerPrivateKey] : [],
    },
  },
});
