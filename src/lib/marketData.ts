import { z } from "zod";
import { createPublicClient, formatUnits, http, isAddress, parseAbiItem } from "viem";
import {
  sentraPredictionMarketAbi,
  sentraPredictionMarketFactoryAbi,
  sentraProtocolContracts,
} from "@/contracts/sentraProtocol";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NATIVE_CURRENCY_DECIMALS,
  ARC_NETWORK_NAME,
  ARC_RPC_URL,
  ARC_USDC_DECIMALS,
} from "@/lib/arcTestnet";

export type MarketSource = "sentra" | "polymarket" | "opinion";

export type ExternalMarket = {
  id: string;
  source: MarketSource;
  question: string;
  description: string;
  category: string;
  yesPrice: number | null;
  noPrice: number | null;
  volumeUsdc: number | null;
  liquidityUsdc: number | null;
  closesAt: string | null;
  url: string | null;
  status: "open" | "closed" | "unknown";
  raw?: unknown;
};

const polymarketMarketSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  question: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  endDate: z.string().nullable().optional(),
  end_date_iso: z.string().nullable().optional(),
  volume: z.union([z.string(), z.number()]).nullable().optional(),
  volumeNum: z.union([z.string(), z.number()]).nullable().optional(),
  liquidity: z.union([z.string(), z.number()]).nullable().optional(),
  liquidityNum: z.union([z.string(), z.number()]).nullable().optional(),
  slug: z.string().nullable().optional(),
  outcomePrices: z.union([z.string(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

const opinionMarketSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    marketId: z.union([z.string(), z.number()]).optional(),
    question: z.string().optional(),
    title: z.string().optional(),
    marketTitle: z.string().optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    statusEnum: z.string().nullable().optional(),
    closeTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    yesPrice: z.union([z.string(), z.number()]).nullable().optional(),
    noPrice: z.union([z.string(), z.number()]).nullable().optional(),
    volume: z.union([z.string(), z.number()]).nullable().optional(),
    volume24h: z.union([z.string(), z.number()]).nullable().optional(),
    liquidity: z.union([z.string(), z.number()]).nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough();

const arcChain = {
  id: ARC_CHAIN_ID,
  name: ARC_NETWORK_NAME,
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: ARC_NATIVE_CURRENCY_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: ARC_EXPLORER },
  },
  testnet: true,
} as const;

const arcPublicClient = createPublicClient({
  chain: arcChain,
  transport: http(ARC_RPC_URL),
});

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProbability(value: unknown): number | null {
  const parsed = num(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseOutcomePrices(value: unknown): { yes: number | null; no: number | null } {
  if (Array.isArray(value)) {
    return { yes: normalizeProbability(value[0]), no: normalizeProbability(value[1]) };
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parseOutcomePrices(parsed);
    } catch {
      return { yes: null, no: null };
    }
  }
  return { yes: null, no: null };
}

function polymarketUrl(slug?: string | null) {
  return slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com/markets";
}

function mapPolymarket(value: unknown): ExternalMarket | null {
  const parsed = polymarketMarketSchema.safeParse(value);
  if (!parsed.success) return null;
  const item = parsed.data;
  const id = String(item.id ?? item.slug ?? "");
  const question = item.question ?? item.title ?? "";
  if (!id || !question) return null;
  const prices = parseOutcomePrices(item.outcomePrices);
  const closed = item.closed === true || item.active === false;
  return {
    id: `polymarket:${id}`,
    source: "polymarket",
    question,
    description: item.description ?? "",
    category: item.category ?? "Prediction market",
    yesPrice: prices.yes,
    noPrice: prices.no,
    volumeUsdc: num(item.volumeNum ?? item.volume),
    liquidityUsdc: num(item.liquidityNum ?? item.liquidity),
    closesAt: item.endDate ?? item.end_date_iso ?? null,
    url: polymarketUrl(item.slug),
    status: closed ? "closed" : "open",
    raw: value,
  };
}

function mapOpinion(value: unknown): ExternalMarket | null {
  const parsed = opinionMarketSchema.safeParse(value);
  if (!parsed.success) return null;
  const item = parsed.data;
  const id = String(item.marketId ?? item.id ?? "");
  const question = item.question ?? item.title ?? item.marketTitle ?? "";
  if (!id || !question) return null;
  const status = (item.statusEnum ?? item.status ?? "").toLowerCase();
  return {
    id: `opinion:${id}`,
    source: "opinion",
    question,
    description: item.description ?? "",
    category: item.category ?? "Opinion market",
    yesPrice: normalizeProbability(item.yesPrice),
    noPrice: normalizeProbability(item.noPrice),
    volumeUsdc: num(item.volume24h ?? item.volume),
    liquidityUsdc: num(item.liquidity),
    closesAt: item.closeTime ?? item.endTime ?? null,
    url: item.url ?? `https://opinion.trade/market/${id}`,
    status: status.includes("close") || status.includes("resolved") ? "closed" : "open",
    raw: value,
  };
}

function recordsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "markets", "results", "items"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  if (record.result && typeof record.result === "object") {
    const result = record.result as Record<string, unknown>;
    for (const key of ["list", "data", "markets", "results", "items"]) {
      if (Array.isArray(result[key])) return result[key];
    }
  }
  return [];
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Market API failed (${response.status}): ${body.slice(0, 160)}`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchPolymarketMarkets(limit = 24): Promise<ExternalMarket[]> {
  const base =
    process.env.POLYMARKET_GAMMA_API_URL?.replace(/\/+$/, "") ?? "https://gamma-api.polymarket.com";
  const url = new URL(`${base}/markets`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order", "volume");
  url.searchParams.set("ascending", "false");
  const payload = await fetchJson(url.toString());
  return recordsFromPayload(payload)
    .map(mapPolymarket)
    .filter((item): item is ExternalMarket => !!item);
}

export async function fetchOpinionMarkets(limit = 24): Promise<ExternalMarket[]> {
  const apiKey = process.env.OPINION_API_KEY;
  if (!apiKey) return [];
  const base =
    process.env.OPINION_API_URL?.replace(/\/+$/, "") ?? "https://openapi.opinion.trade/openapi";
  const url = new URL(`${base}/market`);
  url.searchParams.set("limit", String(Math.min(limit, 20)));
  url.searchParams.set("status", process.env.OPINION_MARKET_STATUS ?? "activated");
  url.searchParams.set("marketType", process.env.OPINION_MARKET_TYPE ?? "0");
  url.searchParams.set("sortBy", process.env.OPINION_MARKET_SORT_BY ?? "5");
  const payload = await fetchJson(url.toString(), { headers: { apikey: apiKey } });
  return recordsFromPayload(payload)
    .map(mapOpinion)
    .filter((item): item is ExternalMarket => !!item);
}

function parseDataUriJson(value: string): Record<string, unknown> {
  if (!value.startsWith("data:application/json;base64,")) return {};
  try {
    return JSON.parse(
      Buffer.from(value.split(",", 2)[1] ?? "", "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function marketStatus(closesAtSeconds: bigint, outcome: number): ExternalMarket["status"] {
  if (outcome !== 0) return "closed";
  return Number(closesAtSeconds) * 1000 > Date.now() ? "open" : "unknown";
}

async function mapSentraMarket(marketAddress: `0x${string}`): Promise<ExternalMarket | null> {
  const [marketId, question, metadataUri, closesAt, outcome, totalYes, totalNo] = await Promise.all(
    [
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "marketId",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "question",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "metadataUri",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "closesAt",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "resolvedOutcome",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "totalYesShares",
      }),
      arcPublicClient.readContract({
        address: marketAddress,
        abi: sentraPredictionMarketAbi,
        functionName: "totalNoShares",
      }),
    ],
  );
  const metadata = parseDataUriJson(metadataUri);
  const yes = Number(formatUnits(totalYes, ARC_USDC_DECIMALS));
  const no = Number(formatUnits(totalNo, ARC_USDC_DECIMALS));
  const pool = yes + no;
  return {
    id: `sentra:${marketId}`,
    source: "sentra",
    question,
    description: typeof metadata.description === "string" ? metadata.description : "",
    category: typeof metadata.category === "string" ? metadata.category : "SENTRA",
    yesPrice: pool > 0 ? yes / pool : 0.5,
    noPrice: pool > 0 ? no / pool : 0.5,
    volumeUsdc: pool,
    liquidityUsdc: pool,
    closesAt: new Date(Number(closesAt) * 1000).toISOString(),
    url: null,
    status: marketStatus(closesAt, outcome),
    raw: { marketAddress, marketId, metadataUri, resolvedOutcome: outcome },
  };
}

export async function fetchSentraMarkets(limit = 24): Promise<ExternalMarket[]> {
  const factory = sentraProtocolContracts.marketFactory;
  if (!factory || !isAddress(factory)) return [];
  try {
    const marketAddresses = await arcPublicClient.readContract({
      address: factory,
      abi: sentraPredictionMarketFactoryAbi,
      functionName: "allMarkets",
    });
    const limited = marketAddresses.slice(-limit).reverse();
    const settled = await Promise.allSettled(limited.map((address) => mapSentraMarket(address)));
    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
  } catch {
    const events = await arcPublicClient.getLogs({
      address: factory,
      event: parseAbiItem(
        "event MarketCreated(bytes32 indexed marketId, address indexed market, string question, string metadataUri, uint64 closesAt)",
      ),
      fromBlock: 0n,
      toBlock: "latest",
    });
    const limited = events
      .map((event) => event.args.market)
      .filter((address): address is `0x${string}` => Boolean(address))
      .slice(-limit)
      .reverse();
    const settled = await Promise.allSettled(limited.map((address) => mapSentraMarket(address)));
    return settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
  }
}

export async function loadExternalMarkets(limit = 24): Promise<ExternalMarket[]> {
  const settled = await Promise.allSettled([
    fetchPolymarketMarkets(limit),
    fetchOpinionMarkets(Math.max(6, Math.floor(limit / 2))),
  ]);
  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => (b.volumeUsdc ?? 0) - (a.volumeUsdc ?? 0))
    .slice(0, limit);
}

export async function loadMarkets(limit = 24): Promise<ExternalMarket[]> {
  const [sentraMarkets, externalMarkets] = await Promise.all([
    fetchSentraMarkets(limit),
    loadExternalMarkets(limit),
  ]);
  return [...sentraMarkets, ...externalMarkets].slice(0, limit);
}
