import { createFileRoute } from "@tanstack/react-router";
import { loadRuntimeDataset } from "@/lib/runtimeDataset";

export const Route = createFileRoute("/api/runtime-dataset")({
  server: {
    handlers: {
      GET: async () => {
        const dataset = await loadRuntimeDataset();
        if (!dataset) {
          return Response.json({ error: "SENTRA agent runtime is not reachable" }, { status: 503 });
        }

        return Response.json(dataset, {
          headers: {
            "cache-control": "public, max-age=15, stale-while-revalidate=45",
          },
        });
      },
    },
  },
});
