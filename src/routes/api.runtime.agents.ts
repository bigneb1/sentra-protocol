import { createFileRoute } from "@tanstack/react-router";
import { proxyRuntimeJson } from "@/lib/runtimeProxy";

export const Route = createFileRoute("/api/runtime/agents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return proxyRuntimeJson("/agents", {
          method: "POST",
          request,
          requireSecret: true,
          body: await request.text(),
        });
      },
    },
  },
});
