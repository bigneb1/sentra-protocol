import { createFileRoute } from "@tanstack/react-router";
import { proxyRuntimeJson } from "@/lib/runtimeProxy";

export const Route = createFileRoute("/api/runtime/calls/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        return proxyRuntimeJson(`/calls/${encodeURIComponent(params.id)}`, {
          request,
          requireSecret: true,
        });
      },
    },
  },
});
