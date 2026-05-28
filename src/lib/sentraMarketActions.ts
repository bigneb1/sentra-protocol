import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createPublicClient, decodeEventLog, http, isAddressEqual, keccak256, toHex } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { z } from "zod";
import {
  sentraPredictionMarketFactoryAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";
import { ARC_CHAIN_ID, ARC_RPC_URL } from "@/lib/arcTestnet";
import { arcTestnet as arcChain } from "@/lib/wagmi";

const arcPublicClient = createPublicClient({
  chain: arcChain,
  transport: http(ARC_RPC_URL),
});

const WALLET_AUTH_USER_PREFIX = "wallet:";
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]+$/);

function walletUserId(addressValue: string) {
  return `${WALLET_AUTH_USER_PREFIX}${addressValue.toLowerCase()}`;
}

function normalizeHeader(value: string | null) {
  return value && value.trim() ? value.trim() : null;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getWalletHeaders() {
  const request = getRequest();
  const walletAddress = normalizeHeader(request?.headers.get("x-sentra-wallet-address") ?? null);
  const rawMessage = normalizeHeader(request?.headers.get("x-sentra-wallet-message") ?? null);
  const encoding = normalizeHeader(
    request?.headers.get("x-sentra-wallet-message-encoding") ?? null,
  );
  const signature = normalizeHeader(request?.headers.get("x-sentra-wallet-signature") ?? null);
  if (!walletAddress || !rawMessage || !signature) return null;
  const message = encoding === "base64url" ? decodeBase64Url(rawMessage) : rawMessage;
  return { walletAddress, message, signature };
}

function sameAddress(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    return isAddressEqual(a as `0x${string}`, b as `0x${string}`);
  } catch {
    return false;
  }
}

function publicAppUrl() {
  const configured =
    process.env.SENTRA_PUBLIC_APP_URL ??
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return (configured ?? "https://sentraprotocol.vercel.app").replace(/\/+$/, "");
}

function appDomain() {
  try {
    return new URL(publicAppUrl()).host;
  } catch {
    return "sentraprotocol.vercel.app";
  }
}

function requestHost() {
  const request = getRequest();
  const forwardedHost = request?.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request?.headers.get("host") ?? appDomain();
  return host.toLowerCase();
}

async function requireWalletAuth() {
  const wallet = getWalletHeaders();
  if (!wallet) throw new Error("Wallet sign-in required");
  if (!address.safeParse(wallet.walletAddress).success) {
    throw new Error("Wallet sign-in address is invalid");
  }
  if (!signatureSchema.safeParse(wallet.signature).success) {
    throw new Error("Wallet sign-in signature is invalid");
  }
  const parsed = parseSiweMessage(wallet.message);
  if (!parsed.address) throw new Error("SIWE message is missing an address");
  if (!sameAddress(parsed.address, wallet.walletAddress)) {
    throw new Error("SIWE address does not match connected wallet");
  }
  if (parsed.chainId !== ARC_CHAIN_ID) throw new Error("Sign in with an Arc Testnet wallet");

  const expectedHost = requestHost();
  const allowedDomains = new Set([expectedHost, appDomain().toLowerCase()]);
  if (!parsed.domain || !allowedDomains.has(parsed.domain.toLowerCase())) {
    throw new Error("SIWE domain does not match this SENTRA deployment");
  }
  if (parsed.uri) {
    const uriHost = new URL(parsed.uri).host.toLowerCase();
    if (!allowedDomains.has(uriHost)) throw new Error("SIWE URI does not match this deployment");
  }

  const verified = await verifySiweMessage(arcPublicClient, {
    message: wallet.message,
    signature: wallet.signature as `0x${string}`,
    domain: parsed.domain,
    address: parsed.address,
    nonce: parsed.nonce,
    time: new Date(),
  });
  if (!verified) throw new Error("Wallet signature could not be verified");

  return { userId: walletUserId(parsed.address), walletAddress: parsed.address as `0x${string}` };
}

const walletAuthMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = await requireWalletAuth();
  return next({ context: auth });
});

function hashId(value: string) {
  return keccak256(toHex(value));
}

function findMarketCreated(
  receipt: Awaited<ReturnType<typeof arcPublicClient.getTransactionReceipt>>,
) {
  const factory = sentraProtocolContracts.marketFactory;
  if (!factory) return null;
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, factory)) continue;
    try {
      return decodeEventLog({
        abi: sentraPredictionMarketFactoryAbi,
        data: log.data,
        topics: log.topics,
        eventName: "MarketCreated",
      }).args as {
        marketId?: `0x${string}`;
        market?: `0x${string}`;
        question?: string;
        metadataUri?: string;
        closesAt?: bigint;
      };
    } catch {
      // Ignore non-MarketCreated logs from the factory.
    }
  }
  return null;
}

export const prepareMarketCreateAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      question: z.string().min(8).max(240),
      category: z.string().min(2).max(64).default("General"),
      closesAt: z.string().datetime(),
      description: z.string().max(1200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!sentraProtocolContracts.marketFactory) {
      throw new Error("SENTRA market factory is not deployed/configured");
    }
    const closeDate = new Date(data.closesAt);
    if (Number.isNaN(closeDate.getTime()) || closeDate.getTime() <= Date.now()) {
      throw new Error("Market close time must be in the future");
    }
    const marketId = hashId(
      `sentra-market:${data.question}:${data.closesAt}:${crypto.randomUUID()}`,
    );
    const metadata = {
      schema: "https://sentra.protocol/metadata/market/v1",
      question: data.question,
      category: data.category,
      description: data.description ?? "",
      closesAt: closeDate.toISOString(),
      createdAt: new Date().toISOString(),
    };
    return {
      status: "ready" as const,
      marketFactory: sentraProtocolContracts.marketFactory,
      marketId,
      metadataUri: `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`,
      closesAtSeconds: Math.floor(closeDate.getTime() / 1000).toString(),
    };
  });

export const recordMarketCreateAction = createServerFn({ method: "POST" })
  .middleware([walletAuthMiddleware])
  .inputValidator(
    z.object({
      marketId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    }),
  )
  .handler(async ({ data }) => {
    if (!sentraProtocolContracts.marketFactory) {
      throw new Error("SENTRA market factory is not deployed/configured");
    }
    const receipt = await arcPublicClient.getTransactionReceipt({
      hash: data.txHash as `0x${string}`,
    });
    if (receipt.status !== "success") throw new Error("Market creation transaction failed");
    if (!sameAddress(receipt.to, sentraProtocolContracts.marketFactory)) {
      throw new Error("Market creation transaction targeted a different contract");
    }
    const event = findMarketCreated(receipt);
    if (!event) throw new Error("MarketCreated event not found");
    if (event.marketId?.toLowerCase() !== data.marketId.toLowerCase()) {
      throw new Error("Created market id does not match prepared market");
    }
    return {
      status: "created" as const,
      marketId: data.marketId,
      marketAddress: event.market ?? null,
    };
  });
