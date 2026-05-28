import { createFileRoute } from "@tanstack/react-router";
import { loadMarkets } from "@/lib/marketData";

export const Route = createFileRoute("/api/markets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 24)));
        const markets = await loadMarkets(limit);
        return Response.json(
          {
            source: "sentra-market-aggregator",
            generatedAt: new Date().toISOString(),
            markets,
          },
          {
            headers: {
              "cache-control": "public, max-age=30, stale-while-revalidate=90",
            },
          },
        );
      },
    },
  },
});
