import { createFileRoute } from "@tanstack/react-router";
import { proxyRuntimeJson } from "@/lib/runtimeProxy";

export const Route = createFileRoute("/api/runtime/dataset")({
  server: {
    handlers: {
      GET: async () => {
        return proxyRuntimeJson("/dataset", {
          cacheControl: "public, max-age=15, stale-while-revalidate=45",
        });
      },
    },
  },
});
