import { generateDailyCalls } from "../src/lib/agentWorker.server";

function intervalMs() {
  return Number(process.env.SENTRA_AGENT_WORKER_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
}

async function runOnce() {
  const result = await generateDailyCalls({ force: process.argv.includes("--force") });
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2));
}

async function main() {
  const once = process.argv.includes("--once");
  await runOnce();
  if (once) return;

  const interval = intervalMs();
  console.log(`SENTRA agent worker running every ${Math.round(interval / 1000)}s`);
  setInterval(() => {
    runOnce().catch((error) => {
      console.error(error);
    });
  }, interval);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
