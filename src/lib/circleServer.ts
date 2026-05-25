import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { ARC_CIRCLE_BLOCKCHAIN } from "./arcTestnet";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.ENTITY_SECRET ?? process.env.CIRCLE_ENTITY_SECRET;
const kitKey = process.env.CIRCLE_KIT_KEY ?? process.env.KIT_KEY;
const baseUrl = process.env.CIRCLE_BASE_URL;

export const CIRCLE_AGENT_BLOCKCHAIN = ARC_CIRCLE_BLOCKCHAIN;

export function assertCircleServerEnv() {
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and ENTITY_SECRET must be configured server-side");
  }
  return { apiKey, entitySecret };
}

export function getCircleDeveloperWalletsClient() {
  const env = assertCircleServerEnv();
  return initiateDeveloperControlledWalletsClient({ ...env, baseUrl });
}

export function getCircleSmartContractPlatformClient() {
  const env = assertCircleServerEnv();
  return initiateSmartContractPlatformClient({ ...env, baseUrl });
}

export function getCircleWalletsAdapter() {
  const env = assertCircleServerEnv();
  return createCircleWalletsAdapter({ ...env, baseUrl });
}

export function getCircleAppKit() {
  return new AppKit();
}

export function getCircleKitKey() {
  if (!kitKey) {
    throw new Error("CIRCLE_KIT_KEY or KIT_KEY must be configured server-side");
  }
  return kitKey;
}
