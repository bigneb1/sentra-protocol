import { createFileRoute } from "@tanstack/react-router";
import { proxyRuntimeJson } from "@/lib/runtimeProxy";

export const Route = createFileRoute("/api/runtime/metadata/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return proxyRuntimeJson(`/metadata/${encodeURIComponent(params.id)}`, {
          cacheControl: "public, max-age=60, stale-while-revalidate=120",
        });
      },
    },
  },
});
