import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { parseUnits, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  ArrowUpRight,
  Bot,
  Check,
  ExternalLink,
  Plus,
  Search,
  Send,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AgentAvatar } from "@/components/sentra/Avatar";
import { StrategyChip } from "@/components/sentra/StrategyChip";
import {
  erc20ApprovalAbi,
  sentraPredictionMarketAbi,
  sentraPredictionMarketFactoryAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";
import { loadMarkets, type ExternalMarket, type MarketSource } from "@/lib/marketData";
import { loadSentraDataset, type SentraDataset } from "@/lib/sentraData";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";
import { walletSessionHeaders } from "@/lib/walletSession";
import { prepareMarketCreateAction, recordMarketCreateAction } from "@/lib/sentraMarketActions";

type MarketsLoaderData = {
  dataset: SentraDataset;
  markets: ExternalMarket[];
};

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Prediction Markets — SENTRA" },
      {
        name: "description",
        content:
          "Create Arc-native YES/NO markets, discover live Polymarket and Opinion markets, and hire SENTRA agents to trade.",
      },
    ],
  }),
  loader: async (): Promise<MarketsLoaderData> => {
    const [dataset, markets] = await Promise.all([loadSentraDataset(), loadMarkets(24)]);
    return { dataset, markets };
  },
  component: MarketsPage,
});

function MarketsPage() {
  const { dataset, markets } = Route.useLoaderData() as MarketsLoaderData;
  const wallet = useWallet();
  const toast = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<MarketSource | "all">("all");
  const [localMarkets, setLocalMarkets] = useState<ExternalMarket[]>(markets);
  const [activeMarket, setActiveMarket] = useState<ExternalMarket | null>(markets[0] ?? null);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState<"create" | "approve" | "buy" | "sell" | "claim" | null>(null);
  const [createdMarket, setCreatedMarket] = useState<{
    marketId: string;
    marketAddress: string | null;
  } | null>(null);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("Crypto");
  const [description, setDescription] = useState("");
  const [closesAt, setClosesAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return date.toISOString().slice(0, 16);
  });

  const filtered = useMemo(
    () =>
      localMarkets.filter((market) => {
        const matchesQuery =
          !query ||
          market.question.toLowerCase().includes(query.toLowerCase()) ||
          market.category.toLowerCase().includes(query.toLowerCase());
        return matchesQuery && (source === "all" || market.source === source);
      }),
    [localMarkets, query, source],
  );

  const featuredAgents = dataset.agents.slice(0, 4);
  const totalVolume = filtered.reduce((sum, market) => sum + (market.volumeUsdc ?? 0), 0);
  const sentraMarketCount = localMarkets.filter((market) => market.source === "sentra").length;
  const canTradeSentra = Boolean(sentraProtocolContracts.marketFactory);

  const activeSentraMarketAddress =
    activeMarket?.id.startsWith("sentra:") &&
    activeMarket.raw &&
    typeof activeMarket.raw === "object"
      ? (activeMarket.raw as { marketAddress?: string }).marketAddress
      : null;

  const requireSentraTrade = () => {
    if (!activeMarket?.id.startsWith("sentra:")) {
      toast.push("Imported markets are discovery-only. Create or select a SENTRA market to trade.");
      return null;
    }
    if (!activeSentraMarketAddress) {
      toast.push("This SENTRA market is missing its Arc contract address");
      return null;
    }
    if (!wallet.connected || !wallet.address) {
      toast.push("Connect wallet before trading");
      return null;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then trade");
      return null;
    }
    return activeSentraMarketAddress as Address;
  };

  const createMarket = async () => {
    const authHeaders = walletSessionHeaders(wallet.address);
    if (!authHeaders) {
      toast.push("Sign in with your wallet before creating a market");
      return;
    }
    if (!wallet.chainOk) {
      wallet.switchToArc();
      toast.push("Switch to Arc Testnet, then create the market");
      return;
    }
    if (!sentraProtocolContracts.marketFactory) {
      toast.push("Deploy SENTRA market factory and add VITE_SENTRA_MARKET_FACTORY_ADDRESS");
      return;
    }
    try {
      setBusy("create");
      const prepared = await prepareMarketCreateAction({
        data: {
          question,
          category,
          description,
          closesAt: new Date(closesAt).toISOString(),
        },
        headers: authHeaders,
      });
      const txHash = await writeContractAsync({
        address: prepared.marketFactory as Address,
        abi: sentraPredictionMarketFactoryAbi,
        functionName: "createMarket",
        args: [
          prepared.marketId as `0x${string}`,
          question,
          prepared.metadataUri,
          BigInt(prepared.closesAtSeconds),
        ],
      });
      toast.push("Market creation transaction submitted");
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      const recorded = await recordMarketCreateAction({
        data: {
          marketId: prepared.marketId,
          txHash,
        },
        headers: authHeaders,
      });
      const sentraMarket: ExternalMarket = {
        id: `sentra:${recorded.marketId}`,
        source: "sentra",
        question,
        description,
        category,
        yesPrice: 0.5,
        noPrice: 0.5,
        volumeUsdc: 0,
        liquidityUsdc: 0,
        closesAt: new Date(closesAt).toISOString(),
        url: null,
        status: "open",
        raw: { marketAddress: recorded.marketAddress, marketId: recorded.marketId },
      };
      setLocalMarkets((current) => [
        sentraMarket,
        ...current.filter((market) => market.id !== sentraMarket.id),
      ]);
      setActiveMarket(sentraMarket);
      setCreatedMarket(recorded);
      toast.push("SENTRA market created on Arc");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Market creation failed");
    } finally {
      setBusy(null);
    }
  };

  const buyPosition = async () => {
    const marketAddress = requireSentraTrade();
    if (!marketAddress) {
      return;
    }
    try {
      const amountUnits = parseUnits(amount.toFixed(6), 6);
      setBusy("approve");
      const approvalHash = await writeContractAsync({
        address: sentraProtocolContracts.usdc as Address,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [marketAddress, amountUnits],
      });
      await publicClient?.waitForTransactionReceipt({ hash: approvalHash });
      setBusy("buy");
      const buyHash = await writeContractAsync({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "buy",
        args: [side === "yes", amountUnits],
      });
      await publicClient?.waitForTransactionReceipt({ hash: buyHash });
      toast.push(`Bought ${side.toUpperCase()} with ${amount.toFixed(2)} USDC`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Trade failed");
    } finally {
      setBusy(null);
    }
  };

  const sellPosition = async () => {
    const marketAddress = requireSentraTrade();
    if (!marketAddress) {
      return;
    }
    try {
      const amountUnits = parseUnits(amount.toFixed(6), 6);
      setBusy("sell");
      const sellHash = await writeContractAsync({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "sell",
        args: [side === "yes", amountUnits],
      });
      await publicClient?.waitForTransactionReceipt({ hash: sellHash });
      toast.push(`Sold ${side.toUpperCase()} position for ${amount.toFixed(2)} USDC`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Sell failed");
    } finally {
      setBusy(null);
    }
  };

  const claimPayout = async () => {
    const marketAddress = requireSentraTrade();
    if (!marketAddress) {
      return;
    }
    try {
      setBusy("claim");
      const claimHash = await writeContractAsync({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "claim",
        args: [],
      });
      await publicClient?.waitForTransactionReceipt({ hash: claimHash });
      toast.push("Claimed resolved market payout");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1440px] mx-auto">
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="text-xs tracking-widest text-primary-light mb-2">SENTRA MARKETS</div>
          <h1 className="font-mono text-2xl md:text-3xl">Prediction Markets</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-2">
            Discover live Polymarket and Opinion opportunities, create Arc-native YES/NO markets,
            and hire SENTRA agents to trade or publish probability work for you.
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl mt-2 leading-relaxed">
            SENTRA markets are read from the Arc market factory. Polymarket markets are indexed live
            from Gamma. Opinion markets load when an Opinion API key is configured. Imported markets
            are discovery-only; only SENTRA markets trade on Arc.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-[320px]">
          <Kpi label="Live indexed" value={localMarkets.length.toString()} />
          <Kpi label="Volume indexed" value={`$${compactUsd(totalVolume)}`} />
          <Kpi
            label="Arc markets"
            value={canTradeSentra ? sentraMarketCount.toString() : "Needs factory"}
          />
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.45fr_0.85fr] gap-6">
        <div className="space-y-5">
          <div className="sentra-card p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <label className="flex-1 bg-elevated rounded-md px-3 py-2 flex items-center gap-2">
                <Search size={15} className="text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search markets, teams, assets, macro events..."
                  className="w-full bg-transparent outline-none text-sm"
                />
              </label>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as MarketSource | "all")}
                className="bg-elevated rounded-md px-3 py-2 text-sm outline-none"
              >
                <option value="all">All sources</option>
                <option value="polymarket">Polymarket</option>
                <option value="opinion">Opinion</option>
                <option value="sentra">SENTRA</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((market) => (
              <MarketRow
                key={market.id}
                market={market}
                active={activeMarket?.id === market.id}
                onClick={() => setActiveMarket(market)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="sentra-card p-10 text-center text-sm text-muted-foreground">
                No markets matched this filter.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="sentra-card p-5">
            <h2 className="font-mono text-sm tracking-widest text-muted-foreground mb-4">
              CREATE ARC MARKET
            </h2>
            <div className="space-y-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="Will BTC close above $100,000 on June 30?"
                className="w-full bg-elevated rounded-md px-3 py-2 text-sm outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="bg-elevated rounded-md px-3 py-2 text-sm outline-none"
                  placeholder="Category"
                />
                <input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                  className="bg-elevated rounded-md px-3 py-2 text-sm outline-none"
                />
              </div>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Resolution source, rules, and edge cases."
                className="w-full bg-elevated rounded-md px-3 py-2 text-sm outline-none resize-none"
              />
              <button
                onClick={createMarket}
                disabled={busy !== null || question.trim().length < 8}
                className="w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-50 text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                {busy === "create" ? (
                  "Creating..."
                ) : (
                  <>
                    <Plus size={15} /> Create Market
                  </>
                )}
              </button>
              {createdMarket && (
                <div className="rounded-md bg-[#10B981]/10 text-[#10B981] text-xs p-3">
                  <Check size={13} className="inline mr-1" />
                  Market created:{" "}
                  <span className="font-mono">
                    {createdMarket.marketAddress
                      ? `${createdMarket.marketAddress.slice(0, 10)}...`
                      : createdMarket.marketId.slice(0, 10)}
                  </span>
                </div>
              )}
              {!canTradeSentra && (
                <div className="rounded-md bg-[#D97706]/10 text-[#FDBA74] text-xs p-3 leading-5">
                  Deploy `SentraPredictionMarketFactory` and set
                  `VITE_SENTRA_MARKET_FACTORY_ADDRESS` to activate market creation.
                </div>
              )}
            </div>
          </div>

          <div className="sentra-card p-5">
            <h2 className="font-mono text-sm tracking-widest text-muted-foreground mb-4">
              TRADE / HIRE AGENT
            </h2>
            {activeMarket ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-primary-light uppercase">{activeMarket.source}</div>
                  <div className="font-mono text-sm mt-1 leading-6">{activeMarket.question}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide("yes")}
                    className={`rounded-md px-3 py-2 text-sm font-mono ${side === "yes" ? "bg-[#10B981] text-[#06130D]" : "bg-elevated text-muted-foreground"}`}
                  >
                    YES {percent(activeMarket.yesPrice)}
                  </button>
                  <button
                    onClick={() => setSide("no")}
                    className={`rounded-md px-3 py-2 text-sm font-mono ${side === "no" ? "bg-[#EF4444] text-white" : "bg-elevated text-muted-foreground"}`}
                  >
                    NO {percent(activeMarket.noPrice)}
                  </button>
                </div>
                <label>
                  <div className="text-xs text-muted-foreground mb-1">USDC amount</div>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    className="w-full bg-elevated rounded-md px-3 py-2 font-mono outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={buyPosition}
                    disabled={busy !== null}
                    className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-[#6D28D9] disabled:opacity-50 text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    <Wallet size={15} />
                    {busy === "approve"
                      ? "Approving..."
                      : busy === "buy"
                        ? "Buying..."
                        : activeMarket.id.startsWith("sentra:")
                          ? "Buy"
                          : "Imported"}
                  </button>
                  <button
                    onClick={sellPosition}
                    disabled={busy !== null || !activeMarket.id.startsWith("sentra:")}
                    className="px-4 py-2.5 rounded-md border border-border hover:bg-elevated disabled:opacity-50 text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    <Send size={15} />
                    {busy === "sell" ? "Selling..." : "Sell"}
                  </button>
                </div>
                <button
                  onClick={claimPayout}
                  disabled={busy !== null || !activeMarket.id.startsWith("sentra:")}
                  className="w-full px-4 py-2 rounded-md border border-border hover:bg-elevated disabled:opacity-50 text-xs inline-flex items-center justify-center gap-2"
                >
                  {busy === "claim" ? "Claiming..." : "Claim resolved payout"}
                </button>
                {activeMarket.url && (
                  <a
                    href={activeMarket.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full px-4 py-2 rounded-md border border-border hover:bg-elevated text-xs inline-flex items-center justify-center gap-2"
                  >
                    Open source market <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Select a market to trade.</div>
            )}
          </div>

          <div className="sentra-card p-5">
            <h2 className="font-mono text-sm tracking-widest text-muted-foreground mb-4">
              HIRE AN AGENT
            </h2>
            <div className="space-y-3">
              {featuredAgents.map((agent) => (
                <Link
                  key={agent.id}
                  to="/agent/$id"
                  params={{ id: agent.id }}
                  className="flex items-center gap-3 rounded-md bg-elevated px-3 py-2 hover:bg-primary/10 transition"
                >
                  <AgentAvatar
                    name={agent.name}
                    color={agent.color}
                    imageUrl={agent.imageUrl}
                    size={34}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{agent.name}</div>
                    <StrategyChip strategy={agent.strategy} size="xs" />
                  </div>
                  <Bot size={15} className="text-primary-light" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MarketRow({
  market,
  active,
  onClick,
}: {
  market: ExternalMarket;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`sentra-card p-4 w-full text-left hover:border-primary transition ${active ? "border-primary" : ""}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-md bg-primary/15 text-primary-light flex items-center justify-center shrink-0">
          <TrendingUp size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SourcePill source={market.source} />
            <span className="text-[11px] text-muted-foreground">{market.category}</span>
          </div>
          <div className="font-mono text-sm md:text-base leading-6">{market.question}</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Metric label="YES" value={percent(market.yesPrice)} tone="green" />
            <Metric label="NO" value={percent(market.noPrice)} tone="red" />
            <Metric label="Volume" value={`$${compactUsd(market.volumeUsdc)}`} />
            <Metric label="Closes" value={market.closesAt ? market.closesAt.slice(0, 10) : "-"} />
          </div>
        </div>
        {market.url && <ArrowUpRight size={16} className="text-muted-foreground" />}
      </div>
    </button>
  );
}

function SourcePill({ source }: { source: MarketSource }) {
  const label =
    source === "polymarket" ? "Polymarket" : source === "opinion" ? "Opinion" : "SENTRA";
  return (
    <span className="px-2 py-0.5 rounded bg-elevated text-[10px] font-mono text-primary-light uppercase">
      {label}
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div
        className={`font-mono mt-0.5 ${tone === "green" ? "text-[#10B981]" : tone === "red" ? "text-[#EF4444]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="sentra-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm mt-1">{value}</div>
    </div>
  );
}

function percent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function compactUsd(value: number | null) {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}
