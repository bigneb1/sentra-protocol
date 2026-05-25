import { createFileRoute } from "@tanstack/react-router";
import { generateDailyCalls } from "@/lib/agentWorker.server";

export const Route = createFileRoute("/api/agent-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const workerSecret = process.env.SENTRA_AGENT_WORKER_SECRET;
        if (!workerSecret) {
          return Response.json(
            { error: "SENTRA_AGENT_WORKER_SECRET is not configured" },
            { status: 503 },
          );
        }
        if (request.headers.get("x-sentra-worker-secret") !== workerSecret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = (await request.json().catch(() => ({}))) as {
          callDate?: string;
          force?: boolean;
        };
        const result = await generateDailyCalls({
          callDate: payload.callDate,
          force: Boolean(payload.force),
        });

        return Response.json({ ok: true, ...result });
      },
    },
  },
});
