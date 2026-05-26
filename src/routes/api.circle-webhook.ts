import { createFileRoute } from "@tanstack/react-router";
import { reconcileCircleTransaction, recordCircleWebhookEvent } from "@/lib/sentraActions";

function headersToRecord(headers: Headers) {
  return Object.fromEntries([...headers.entries()]);
}

function payloadField(payload: unknown, key: string) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return undefined;
  return (payload as Record<string, unknown>)[key];
}

function nestedPayloadField(payload: unknown, first: string, second: string) {
  const nested = payloadField(payload, first);
  return payloadField(nested, second);
}

export const Route = createFileRoute("/api/circle-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env.CIRCLE_WEBHOOK_SECRET;
        if (!webhookSecret) {
          return Response.json(
            { error: "CIRCLE_WEBHOOK_SECRET is not configured" },
            { status: 503 },
          );
        }
        if (request.headers.get("x-sentra-webhook-secret") !== webhookSecret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const eventId = String(
          payloadField(payload, "id") ??
            payloadField(payload, "notificationId") ??
            crypto.randomUUID(),
        );
        const eventType = String(
          payloadField(payload, "type") ??
            payloadField(payload, "notificationType") ??
            "circle.unknown",
        );

        const event = await recordCircleWebhookEvent({
          eventId,
          eventType,
          payload,
          headers: headersToRecord(request.headers),
          signatureVerified: true,
        });

        const circleId = String(
          nestedPayloadField(payload, "data", "id") ??
            nestedPayloadField(payload, "transaction", "id") ??
            payloadField(payload, "transactionId") ??
            "",
        );
        const status = String(
          nestedPayloadField(payload, "data", "state") ??
            nestedPayloadField(payload, "data", "status") ??
            nestedPayloadField(payload, "transaction", "state") ??
            "",
        );
        const txHash = String(
          nestedPayloadField(payload, "data", "txHash") ??
            nestedPayloadField(payload, "data", "transactionHash") ??
            nestedPayloadField(payload, "transaction", "txHash") ??
            "",
        );

        await reconcileCircleTransaction({
          circleId: circleId || null,
          status: status || null,
          txHash: txHash || null,
          payload,
        });

        return Response.json({
          ok: true,
          eventId: event.external_id ?? event.id,
          verified: true,
        });
      },
    },
  },
});
