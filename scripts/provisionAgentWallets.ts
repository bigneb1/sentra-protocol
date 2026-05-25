import { createClient } from "@supabase/supabase-js";
import {
  AccountType,
  Blockchain,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import type { Database } from "../src/integrations/supabase/types";
import { ARC_CIRCLE_BLOCKCHAIN } from "../src/lib/arcTestnet";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabase = createClient<Database>(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: requiredEnv("CIRCLE_API_KEY"),
  entitySecret: process.env.ENTITY_SECRET ?? requiredEnv("CIRCLE_ENTITY_SECRET"),
  baseUrl: process.env.CIRCLE_BASE_URL,
});

async function getWalletSetId() {
  if (process.env.CIRCLE_AGENT_WALLET_SET_ID) return process.env.CIRCLE_AGENT_WALLET_SET_ID;

  const response = await circle.createWalletSet({
    name: "SENTRA Agent Wallets",
    idempotencyKey: "sentra-agent-wallet-set",
  });
  const walletSetId = response.data?.walletSet?.id;
  if (!walletSetId) throw new Error("Circle did not return a wallet set id");
  return walletSetId;
}

async function main() {
  const walletSetId = await getWalletSetId();
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id,name,slug")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const created: { agent: string; walletId: string; address: string }[] = [];
  const skipped: { agent: string; address: string }[] = [];

  for (const agent of agents ?? []) {
    const { data: existing, error: existingError } = await supabase
      .from("agent_wallets")
      .select("circle_wallet_id,wallet_address")
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.wallet_address) {
      skipped.push({
        agent: agent.slug,
        address: existing.wallet_address,
      });
      continue;
    }

    const response = await circle.createWallets({
      blockchains: [Blockchain.ArcTestnet],
      count: 1,
      walletSetId,
      accountType: AccountType.Sca,
      metadata: [{ name: `${agent.name} treasury`, refId: `sentra-agent:${agent.id}` }],
      idempotencyKey: `sentra-agent-wallet:${agent.id}`,
    });
    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) {
      throw new Error(`Circle did not return a wallet for ${agent.slug}`);
    }

    const { error: insertError } = await supabase.from("agent_wallets").insert({
      agent_id: agent.id,
      circle_wallet_id: wallet.id,
      wallet_address: wallet.address,
      blockchain: ARC_CIRCLE_BLOCKCHAIN,
    });
    if (insertError) throw insertError;

    created.push({ agent: agent.slug, walletId: wallet.id, address: wallet.address });
  }

  console.log(
    JSON.stringify(
      {
        walletSetId,
        created,
        skipped,
        note: "Circle developer-controlled wallets expose wallet IDs and addresses, not private keys.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
