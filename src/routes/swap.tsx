import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useBalance, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { ArrowDownUp, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { circleSwapAdapterAbi, erc20ApprovalAbi } from "@/contracts/sentraProtocol";
import {
  ARC_CHAIN_ID,
  ARC_EURC_ADDRESS,
  ARC_EXPLORER,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
} from "@/lib/arcTestnet";
import { useToast } from "@/lib/toast";
import { truncate, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/swap")({
  head: () => ({
    meta: [
      { title: "Arc Swap — SENTRA" },
      {
        name: "description",
        content: "Swap supported Arc Testnet stablecoins through SENTRA and Circle App Kit.",
      },
    ],
  }),
  component: SwapPage,
});

const tokens = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: ARC_USDC_ADDRESS,
    color: "#2775CA",
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: ARC_EURC_ADDRESS,
    color: "#10B981",
  },
} as const;

type TokenSymbol = keyof typeof tokens;

const erc20ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type SwapQuote = {
  amountIn: string;
  amountInUnits: string;
  estimatedOutput: { amount: string; token: string };
  estimatedOutputUnits: string;
  stopLimit: { amount: string; token: string };
  stopLimitUnits: string;
  fees: Array<{ type: string; token: string; amount: string }>;
  slippageBps: number;
  quotedAt: string;
  execution: {
    adapterAddress: Address;
    tokenInAddress: Address;
    inputAmount: string;
    gasLimit: string;
    executeParams: {
      instructions: Array<{
        target: Address;
        data: `0x${string}`;
        value: string;
        tokenIn: Address;
        amountToApprove: string;
        tokenOut: Address;
        minTokenOut: string;
      }>;
      tokens: Array<{
        token: Address;
        beneficiary: Address;
      }>;
      execId: string;
      deadline: string;
      metadata: `0x${string}`;
    };
    tokenInputs: Array<{
      permitType: number;
      token: Address;
      amount: string;
      permitCalldata: `0x${string}`;
    }>;
    signature: `0x${string}`;
  };
};

type BusyStage = "quote" | "approve" | "swap" | null;

function SwapPage() {
  const wallet = useWallet();
  const toast = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("EURC");
  const [amount, setAmount] = useState("10");
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyStage>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const balances = useTokenBalances(wallet.address as Address | null);
  const parsedAmount = Number(amount);
  const balanceIn = balances[tokenIn] ?? 0;
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const exceedsBalance = wallet.connected && hasAmount && parsedAmount > balanceIn;
  const rate = useMemo(() => {
    if (!quote || Number(quote.amountIn) <= 0) return null;
    return Number(quote.estimatedOutput.amount) / Number(quote.amountIn);
  }, [quote]);

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setQuote(null);
    setQuoteError(null);
  };

  const setHalf = () => setAmount((balanceIn / 2).toFixed(6).replace(/\.?0+$/, ""));
  const setMax = () => setAmount(balanceIn.toFixed(6).replace(/\.?0+$/, ""));

  const fetchQuote = async () => {
    if (!hasAmount) {
      toast.push("Enter an amount greater than zero");
      return;
    }
    if (tokenIn === tokenOut) {
      toast.push("Choose different tokens");
      return;
    }
    if (!wallet.connected || !wallet.address) {
      wallet.connect();
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then quote the swap");
      return;
    }
    setBusy("quote");
    setQuoteError(null);
    try {
      const response = await fetch("/api/swap-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          amount,
          slippageBps,
          walletAddress: wallet.address,
        }),
      });
      const body = (await response.json()) as SwapQuote & {
        error?: string;
        missing?: string[];
      };
      if (!response.ok) {
        const missing = body.missing?.length ? ` Missing: ${body.missing.join(", ")}.` : "";
        throw new Error(`${body.error ?? "Quote failed"}.${missing}`);
      }
      setQuote(body);
      toast.push("Arc swap route prepared");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swap quote failed";
      setQuoteError(message);
      toast.push(message);
    } finally {
      setBusy(null);
    }
  };

  const executeSwap = async () => {
    if (!quote) {
      await fetchQuote();
      return;
    }
    if (!wallet.connected || !wallet.address) {
      wallet.connect();
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then swap");
      return;
    }
    if (exceedsBalance) {
      toast.push(`Insufficient ${tokenIn}`);
      return;
    }
    try {
      setBusy("approve");
      const approvalHash = await writeContractAsync({
        address: quote.execution.tokenInAddress,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [quote.execution.adapterAddress, BigInt(quote.execution.inputAmount)],
      });
      toast.push(`${tokenIn} approval submitted`);
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });

      setBusy("swap");
      const executeParams = swapExecuteParams(quote);
      const tokenInputs = quote.execution.tokenInputs.map((input) => ({
        permitType: input.permitType,
        token: input.token,
        amount: BigInt(input.amount),
        permitCalldata: input.permitCalldata,
      }));
      const swapHash = await writeContractAsync({
        address: quote.execution.adapterAddress,
        abi: circleSwapAdapterAbi,
        functionName: "execute",
        args: [executeParams, tokenInputs, quote.execution.signature],
        gas: bufferedGasLimit(quote.execution.gasLimit),
      });
      toast.push("Arc swap submitted");
      await publicClient?.waitForTransactionReceipt({ hash: swapHash });
      setLastTxHash(swapHash);
      toast.push(
        `Swapped ${quote.amountIn} ${tokenIn} for ${quote.estimatedOutput.amount} ${tokenOut}`,
      );
      setQuote(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swap failed";
      setQuoteError(message);
      toast.push(message);
    } finally {
      setBusy(null);
    }
  };

  const cta = !wallet.connected
    ? "Connect Wallet"
    : !wallet.chainOk
      ? "Switch to Arc"
      : exceedsBalance
        ? `Insufficient ${tokenIn}`
        : busy === "quote"
          ? "Preparing route..."
          : busy === "approve"
            ? "Approving..."
            : busy === "swap"
              ? "Swapping..."
              : quote
                ? "Swap"
                : "Get Quote";

  const refreshLabel = busy === "quote" ? "Refreshing..." : "Refresh quote";
  const showRefresh = wallet.connected && wallet.chainOk && quote;
  const isBusy = busy !== null;

  const ctaAction = () => {
    if (!wallet.connected) {
      wallet.connect();
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      return;
    }
    if (quote) {
      void executeSwap();
      return;
    }
    void fetchQuote();
  };

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 md:px-10 py-8">
      <div className="mx-auto max-w-[480px]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest text-primary-light mb-2">ARC SWAP</div>
            <h1 className="font-mono text-2xl">Swap</h1>
          </div>
          <a
            href={ARC_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated"
          >
            Arcscan <ExternalLink size={13} />
          </a>
        </div>

        <div className="sentra-card p-3 space-y-2">
          <TokenPanel
            label="You're paying"
            token={tokenIn}
            otherToken={tokenOut}
            amount={amount}
            balance={balanceIn}
            onAmountChange={(value) => {
              setAmount(value);
              setQuote(null);
              setQuoteError(null);
            }}
            onTokenChange={(value) => {
              setTokenIn(value);
              if (value === tokenOut) setTokenOut(tokenIn);
              setQuote(null);
              setQuoteError(null);
            }}
            onHalf={setHalf}
            onMax={setMax}
          />

          <div className="relative h-2">
            <button
              type="button"
              onClick={flip}
              className="absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-card bg-elevated text-primary-light hover:bg-primary hover:text-primary-foreground"
              aria-label="Flip swap direction"
            >
              <ArrowDownUp size={17} />
            </button>
          </div>

          <TokenPanel
            label="To receive"
            token={tokenOut}
            otherToken={tokenIn}
            amount={quote?.estimatedOutput.amount ?? ""}
            balance={balances[tokenOut] ?? 0}
            readOnly
            onAmountChange={() => undefined}
            onTokenChange={(value) => {
              setTokenOut(value);
              if (value === tokenIn) setTokenIn(tokenOut);
              setQuote(null);
              setQuoteError(null);
            }}
          />

          <div className="rounded-md bg-elevated p-3 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Slippage</span>
              <div className="flex rounded-md border border-border p-1">
                {[50, 100, 300].map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSlippageBps(value);
                      setQuote(null);
                    }}
                    className={`rounded px-2 py-1 font-mono ${slippageBps === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {(value / 100).toFixed(value === 50 ? 1 : 0)}%
                  </button>
                ))}
              </div>
            </div>

            <QuoteRows quote={quote} rate={rate} tokenIn={tokenIn} tokenOut={tokenOut} />

            {quoteError && (
              <div className="rounded bg-[#EF4444]/10 px-3 py-2 text-xs leading-5 text-[#FCA5A5]">
                {quoteError}
              </div>
            )}

            <button
              type="button"
              onClick={ctaAction}
              disabled={exceedsBalance || isBusy}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cta}
            </button>
            {showRefresh && (
              <button
                type="button"
                onClick={fetchQuote}
                disabled={isBusy}
                className="w-full rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-50"
              >
                {refreshLabel}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
          <div className="sentra-card p-4">
            <div className="mb-2 flex items-center gap-2 font-mono text-foreground">
              <Wallet size={14} className="text-primary-light" /> Wallet execution
            </div>
            The connected wallet approves the Circle adapter, then signs the Arc swap transaction.
          </div>
        </div>

        {lastTxHash && (
          <a
            href={`${ARC_EXPLORER}/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-center gap-2 text-xs text-primary-light hover:text-primary"
          >
            View last swap on Arcscan <ExternalLink size={13} />
          </a>
        )}

        {wallet.connected && wallet.address && (
          <div className="mt-4 text-center text-[11px] text-muted-foreground">
            Connected {truncate(wallet.address)} · Chain ID {ARC_CHAIN_ID}
          </div>
        )}
      </div>
    </div>
  );
}

function useTokenBalances(address: Address | null) {
  const { data: nativeUsdc } = useBalance({
    address: address ?? undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const { data } = useReadContracts({
    contracts: address
      ? ([
          {
            address: ARC_USDC_ADDRESS,
            abi: erc20ReadAbi,
            functionName: "balanceOf",
            args: [address],
            chainId: ARC_CHAIN_ID,
          },
          {
            address: ARC_EURC_ADDRESS,
            abi: erc20ReadAbi,
            functionName: "balanceOf",
            args: [address],
            chainId: ARC_CHAIN_ID,
          },
        ] as const)
      : [],
    query: { enabled: Boolean(address) },
  });

  const erc20Usdc =
    data?.[0]?.status === "success" ? Number(formatUnits(data[0].result, ARC_USDC_DECIMALS)) : null;
  const eurc =
    data?.[1]?.status === "success" ? Number(formatUnits(data[1].result, ARC_USDC_DECIMALS)) : 0;

  return {
    USDC: erc20Usdc ?? (nativeUsdc ? Number(nativeUsdc.formatted) : 0),
    EURC: eurc,
  };
}

function swapExecuteParams(quote: SwapQuote) {
  return {
    instructions: quote.execution.executeParams.instructions.map((instruction) => ({
      target: instruction.target,
      data: instruction.data,
      value: BigInt(instruction.value),
      tokenIn: instruction.tokenIn,
      amountToApprove: BigInt(instruction.amountToApprove),
      tokenOut: instruction.tokenOut,
      minTokenOut: BigInt(instruction.minTokenOut),
    })),
    tokens: quote.execution.executeParams.tokens.map((token) => ({
      token: token.token,
      beneficiary: token.beneficiary,
    })),
    execId: BigInt(quote.execution.executeParams.execId),
    deadline: BigInt(quote.execution.executeParams.deadline),
    metadata: quote.execution.executeParams.metadata,
  };
}

function bufferedGasLimit(value: string) {
  try {
    const gas = BigInt(value);
    return gas > 0n ? (gas * 13n) / 10n : undefined;
  } catch {
    return undefined;
  }
}

function TokenPanel({
  label,
  token,
  otherToken,
  amount,
  balance,
  readOnly = false,
  onAmountChange,
  onTokenChange,
  onHalf,
  onMax,
}: {
  label: string;
  token: TokenSymbol;
  otherToken: TokenSymbol;
  amount: string;
  balance: number;
  readOnly?: boolean;
  onAmountChange: (value: string) => void;
  onTokenChange: (value: TokenSymbol) => void;
  onHalf?: () => void;
  onMax?: () => void;
}) {
  return (
    <div className="rounded-md bg-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Bal {formatBalance(balance)}</span>
          {!readOnly && (
            <>
              <button onClick={onHalf} className="font-mono text-primary-light hover:text-primary">
                Half
              </button>
              <button onClick={onMax} className="font-mono text-primary-light hover:text-primary">
                Max
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="0"
          readOnly={readOnly}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent font-mono text-3xl outline-none placeholder:text-muted-foreground/40"
        />
        <TokenSelect token={token} otherToken={otherToken} onChange={onTokenChange} />
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        {tokens[token].name} · {tokens[token].address.slice(0, 10)}...
      </div>
    </div>
  );
}

function TokenSelect({
  token,
  otherToken,
  onChange,
}: {
  token: TokenSymbol;
  otherToken: TokenSymbol;
  onChange: (value: TokenSymbol) => void;
}) {
  return (
    <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
      <span
        className="h-6 w-6 rounded-full"
        style={{ background: tokens[token].color }}
        aria-hidden="true"
      />
      <select
        value={token}
        onChange={(event) => onChange(event.target.value as TokenSymbol)}
        className="bg-transparent font-mono text-sm outline-none"
      >
        {Object.keys(tokens).map((symbol) => (
          <option key={symbol} value={symbol} disabled={symbol === otherToken}>
            {symbol}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuoteRows({
  quote,
  rate,
  tokenIn,
  tokenOut,
}: {
  quote: SwapQuote | null;
  rate: number | null;
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3 text-xs">
      <QuoteRow
        k="Rate"
        v={rate ? `1 ${tokenIn} = ${rate.toFixed(6)} ${tokenOut}` : "Quote required"}
      />
      <QuoteRow
        k="Minimum received"
        v={quote ? `${quote.stopLimit.amount} ${quote.stopLimit.token}` : "-"}
      />
      <QuoteRow
        k="Network"
        v={quote?.fees?.find((fee) => fee.type === "gas")?.amount ?? "Arc USDC gas"}
      />
      <QuoteRow
        k="Provider fee"
        v={
          quote?.fees
            ?.filter((fee) => fee.type !== "gas")
            .map((fee) => `${fee.amount} ${fee.token}`)
            .join(", ") || "-"
        }
      />
      <QuoteRow
        k="Last quote"
        v={quote ? new Date(quote.quotedAt).toLocaleTimeString() : <RefreshCw size={13} />}
      />
    </div>
  );
}

function QuoteRow({ k, v }: { k: string; v: string | React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-mono text-foreground">{v}</span>
    </div>
  );
}

function formatBalance(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(4).replace(/\.?0+$/, "");
}
