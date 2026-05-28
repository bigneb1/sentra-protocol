import { createFileRoute } from "@tanstack/react-router";
import { formatUnits, isAddress, parseUnits } from "viem";
import { z } from "zod";
import {
  ARC_CIRCLE_SWAP_ADAPTER_ADDRESS,
  ARC_EURC_ADDRESS,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
} from "@/lib/arcTestnet";

const supportedTokens = ["USDC", "EURC"] as const;

const tokenMeta = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: ARC_USDC_ADDRESS,
    decimals: ARC_USDC_DECIMALS,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: ARC_EURC_ADDRESS,
    decimals: ARC_USDC_DECIMALS,
  },
} as const;

const swapRequestSchema = z.object({
  tokenIn: z.enum(supportedTokens),
  tokenOut: z.enum(supportedTokens),
  amount: z.string().trim().min(1).max(32),
  slippageBps: z.number().int().min(10).max(1000).default(300),
  walletAddress: z
    .string()
    .refine((value) => isAddress(value), "walletAddress must be an EVM address"),
});

type SwapFee = {
  type: string;
  token: string;
  amount: string;
};

type CircleSwapResponse = {
  tokenInAddress: `0x${string}`;
  tokenInChain: "Arc_Testnet";
  tokenOutAddress: `0x${string}`;
  tokenOutChain: "Arc_Testnet";
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  amount: string;
  stopLimit: string;
  estimatedAmount: string;
  fees?: {
    provider?: Array<{ token: string; amount: string }>;
    swap?: Array<{ token: string; amount: string }>;
    developer?: Array<{ token: string; amount: string; basis?: string }>;
  };
  transaction: {
    signature: `0x${string}`;
    executionParams: {
      instructions: Array<{
        target: `0x${string}`;
        data: `0x${string}`;
        value: string;
        tokenIn: `0x${string}`;
        amountToApprove: string;
        tokenOut: `0x${string}`;
        minTokenOut: string;
      }>;
      tokens: Array<{
        token: `0x${string}`;
        beneficiary: `0x${string}`;
      }>;
      execId: string;
      deadline: string;
      metadata: `0x${string}`;
    };
    gasLimit: string;
  };
};

function kitKey() {
  return process.env.CIRCLE_KIT_KEY ?? process.env.KIT_KEY ?? null;
}

function normalizeAmount(input: string) {
  const value = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Amount must be a positive number with up to 6 decimals");
  }
  if (parseUnits(value, ARC_USDC_DECIMALS) <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  return value;
}

function amountFromUnits(value: string) {
  return formatUnits(BigInt(value), ARC_USDC_DECIMALS);
}

function feesFromCircle(fees: CircleSwapResponse["fees"]): SwapFee[] {
  return [
    ...(fees?.provider ?? []).map((fee) => ({
      type: "provider",
      token: fee.token,
      amount: amountFromUnits(fee.amount),
    })),
    ...(fees?.swap ?? []).map((fee) => ({
      type: "swap",
      token: fee.token,
      amount: amountFromUnits(fee.amount),
    })),
    ...(fees?.developer ?? []).map((fee) => ({
      type: "developer",
      token: fee.token,
      amount: amountFromUnits(fee.amount),
    })),
  ];
}

function normalizeGasLimit(value: string) {
  return bigintString(value);
}

function bigintString(value: string) {
  return (value === "0x" ? 0n : BigInt(value)).toString();
}

async function createCircleSwap(params: z.infer<typeof swapRequestSchema>, key: string) {
  const tokenInAddress = tokenMeta[params.tokenIn].address;
  const tokenOutAddress = tokenMeta[params.tokenOut].address;
  const amount = parseUnits(normalizeAmount(params.amount), ARC_USDC_DECIMALS).toString();
  const response = await fetch("https://api.circle.com/v1/stablecoinKits/swap", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      tokenInAddress,
      tokenInChain: "Arc_Testnet",
      tokenOutAddress,
      tokenOutChain: "Arc_Testnet",
      fromAddress: params.walletAddress,
      toAddress: params.walletAddress,
      amount,
      slippageBps: params.slippageBps,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as CircleSwapResponse & {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.message ?? body.error ?? `Circle swap preparation failed (${response.status})`,
    );
  }
  return body;
}

function executionParamsFromCircle(transaction: CircleSwapResponse["transaction"]) {
  return {
    instructions: transaction.executionParams.instructions.map((instruction) => ({
      target: instruction.target,
      data: instruction.data,
      value: bigintString(instruction.value),
      tokenIn: instruction.tokenIn,
      amountToApprove: bigintString(instruction.amountToApprove),
      tokenOut: instruction.tokenOut,
      minTokenOut: bigintString(instruction.minTokenOut),
    })),
    tokens: transaction.executionParams.tokens.map((token) => ({
      token: token.token,
      beneficiary: token.beneficiary,
    })),
    execId: bigintString(transaction.executionParams.execId),
    deadline: bigintString(transaction.executionParams.deadline),
    metadata: transaction.executionParams.metadata,
  };
}

export const Route = createFileRoute("/api/swap-quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = swapRequestSchema.parse(await request.json());
          if (parsed.tokenIn === parsed.tokenOut) {
            return Response.json({ error: "Choose different tokens" }, { status: 400 });
          }

          const key = kitKey();
          if (!key) {
            return Response.json(
              {
                error: "Circle swap is not configured",
                missing: ["CIRCLE_KIT_KEY or KIT_KEY"],
              },
              { status: 503 },
            );
          }

          const swap = await createCircleSwap(parsed, key);
          const executionParams = executionParamsFromCircle(swap.transaction);

          return Response.json(
            {
              chain: "Arc_Testnet",
              tokenIn: tokenMeta[parsed.tokenIn],
              tokenOut: tokenMeta[parsed.tokenOut],
              amountIn: amountFromUnits(swap.amount),
              amountInUnits: swap.amount,
              estimatedOutput: {
                token: parsed.tokenOut,
                amount: amountFromUnits(swap.estimatedAmount),
              },
              estimatedOutputUnits: swap.estimatedAmount,
              stopLimit: {
                token: parsed.tokenOut,
                amount: amountFromUnits(swap.stopLimit),
              },
              stopLimitUnits: swap.stopLimit,
              fees: feesFromCircle(swap.fees),
              slippageBps: parsed.slippageBps,
              quotedAt: new Date().toISOString(),
              execution: {
                adapterAddress: ARC_CIRCLE_SWAP_ADAPTER_ADDRESS,
                tokenInAddress: swap.tokenInAddress,
                inputAmount: swap.amount,
                gasLimit: normalizeGasLimit(swap.transaction.gasLimit),
                executeParams: executionParams,
                tokenInputs: [
                  {
                    permitType: 0,
                    token: swap.tokenInAddress,
                    amount: swap.amount,
                    permitCalldata: "0x",
                  },
                ],
                signature: swap.transaction.signature,
              },
            },
            {
              headers: {
                "cache-control": "no-store",
              },
            },
          );
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Swap quote failed" },
            { status: 400 },
          );
        }
      },
    },
  },
});
