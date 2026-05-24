import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { ARC_CIRCLE_BLOCKCHAIN } from "./arcTestnet";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.ENTITY_SECRET;

export const CIRCLE_AGENT_BLOCKCHAIN = ARC_CIRCLE_BLOCKCHAIN;

export function assertCircleServerEnv() {
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and ENTITY_SECRET must be configured server-side");
  }
  return { apiKey, entitySecret };
}

export function getCircleDeveloperWalletsClient() {
  const env = assertCircleServerEnv();
  return initiateDeveloperControlledWalletsClient(env);
}

export function getCircleSmartContractPlatformClient() {
  const env = assertCircleServerEnv();
  return initiateSmartContractPlatformClient(env);
}
