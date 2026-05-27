import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const imageRequestSchema = z.object({
  name: z.string().min(2).max(32),
  description: z.string().max(400).optional(),
  strategy: z.string().max(32).optional(),
});

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function imageFromModel(input: z.infer<typeof imageRequestSchema>) {
  const apiKey = env("SENTRA_IMAGE_API_KEY") ?? env("FREEMODEL_API_KEY") ?? env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("SENTRA_IMAGE_API_KEY or FREEMODEL_API_KEY is not configured");

  const baseUrl =
    env("SENTRA_IMAGE_API_BASE_URL") ??
    env("FREEMODEL_BASE_URL") ??
    env("OPENAI_BASE_URL") ??
    "https://api.openai.com/v1";
  const model = env("SENTRA_IMAGE_MODEL") ?? env("FREEMODEL_IMAGE_MODEL") ?? "gpt-5.5";
  const prompt = [
    "Create a professional square avatar for a financial autonomous research agent.",
    "Return strict JSON with a single field named imageUrl.",
    "The imageUrl must be a data:image/svg+xml;base64 URL.",
    "No logos, no copyrighted brands, no text inside the image.",
    `Agent name: ${input.name}`,
    `Strategy: ${input.strategy ?? "Custom"}`,
    `Description: ${input.description || "No description supplied."}`,
  ].join("\n");

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You produce safe, original avatar assets for product UI. Return only strict JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent image API failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Agent image API returned no content");

  const parsed = JSON.parse(stripJsonFence(content)) as { imageUrl?: unknown };
  if (typeof parsed.imageUrl !== "string" || !parsed.imageUrl.startsWith("data:image/")) {
    throw new Error("Agent image API did not return a usable imageUrl");
  }
  return parsed.imageUrl;
}

function localAvatar(input: z.infer<typeof imageRequestSchema>) {
  const seed = [...`${input.name}:${input.strategy ?? ""}:${input.description ?? ""}`].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const colors = ["#7C3AED", "#0D9488", "#D97706", "#3B82F6", "#10B981"];
  const a = colors[seed % colors.length];
  const b = colors[(seed + 2) % colors.length];
  const initial = input.name.trim().charAt(0).toUpperCase() || "S";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="512" height="512" rx="128" fill="url(#g)"/><circle cx="356" cy="156" r="70" fill="rgba(255,255,255,0.18)"/><circle cx="164" cy="344" r="110" fill="rgba(10,6,24,0.22)"/><path d="M143 310c34-88 86-132 156-132 38 0 72 11 102 32-32-6-61-4-87 7-50 20-86 66-108 139-25-3-46-18-63-46Z" fill="rgba(255,255,255,0.7)"/><text x="256" y="300" text-anchor="middle" font-family="monospace" font-size="136" font-weight="800" fill="white">${initial}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const Route = createFileRoute("/api/generate-agent-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = imageRequestSchema.parse(await request.json());
          try {
            const imageUrl = await imageFromModel(input);
            return Response.json({ imageUrl, source: "model" });
          } catch (error) {
            return Response.json({
              imageUrl: localAvatar(input),
              source: "local",
              warning: error instanceof Error ? error.message : "Image API failed",
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid image request";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
