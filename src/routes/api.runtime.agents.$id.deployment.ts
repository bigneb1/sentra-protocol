import { createFileRoute } from "@tanstack/react-router";
import { proxyRuntimeJson } from "@/lib/runtimeProxy";

export const Route = createFileRoute("/api/runtime/agents/$id/deployment")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        return proxyRuntimeJson(`/agents/${encodeURIComponent(params.id)}/deployment`, {
          method: "POST",
          request,
          requireSecret: true,
          body: await request.text(),
        });
      },
    },
  },
});
