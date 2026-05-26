import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ARC_CIRCLE_BLOCKCHAIN, ARC_ERC8004_REGISTRIES, ARC_USDC_ADDRESS } from "@/lib/arcTestnet";

export const Route = createFileRoute("/api/agent-metadata/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: agent, error: agentError } = await supabaseAdmin
          .from("agents")
          .select(
            "id, slug, name, strategy, description, metadata_hash, registry_agent_id, arc_erc8004_id, status",
          )
          .eq("id", params.id)
          .maybeSingle();

        if (agentError) {
          return Response.json({ error: agentError.message }, { status: 500 });
        }
        if (!agent) {
          return Response.json({ error: "Agent not found" }, { status: 404 });
        }

        const { data: config } = await supabaseAdmin
          .from("agent_configs")
          .select(
            "delegation_cap_usdc, max_daily_loss_usdc, max_open_positions, max_slippage_bps, max_leverage, earnings_call_enabled, earnings_call_tier",
          )
          .eq("agent_id", agent.id)
          .maybeSingle();

        const { data: wallet } = await supabaseAdmin
          .from("agent_wallets")
          .select("wallet_address, circle_wallet_id, blockchain, usdc_stake, gateway_balance_usdc")
          .eq("agent_id", agent.id)
          .maybeSingle();

        return Response.json(
          {
            schema: "https://sentra.protocol/metadata/agent/v1",
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
            description: agent.description ?? "",
            strategy: agent.strategy,
            status: agent.status,
            registryAgentId: agent.registry_agent_id,
            arcErc8004Id: agent.arc_erc8004_id,
            metadataHash: agent.metadata_hash,
            treasury: {
              blockchain: wallet?.blockchain ?? ARC_CIRCLE_BLOCKCHAIN,
              walletAddress: wallet?.wallet_address ?? null,
              circleWalletId: wallet?.circle_wallet_id ?? null,
              stakedUsdc: Number(wallet?.usdc_stake ?? 0),
              gatewayBalanceUsdc: Number(wallet?.gateway_balance_usdc ?? 0),
            },
            riskLimits: {
              delegationCapUsdc: Number(config?.delegation_cap_usdc ?? 0),
              maxDailyLossUsdc: Number(config?.max_daily_loss_usdc ?? 0),
              maxOpenPositions: Number(config?.max_open_positions ?? 0),
              maxSlippageBps: Number(config?.max_slippage_bps ?? 0),
              maxLeverage: Number(config?.max_leverage ?? 1),
            },
            earningsCalls: {
              enabled: config?.earnings_call_enabled ?? true,
              tier: config?.earnings_call_tier ?? "paid",
              priceUsdc: 0.01,
            },
            chain: {
              blockchain: ARC_CIRCLE_BLOCKCHAIN,
              usdcAddress: ARC_USDC_ADDRESS,
              erc8004: ARC_ERC8004_REGISTRIES,
            },
          },
          {
            headers: {
              "cache-control": "public, max-age=60",
            },
          },
        );
      },
    },
  },
});
