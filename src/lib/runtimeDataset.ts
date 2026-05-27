import type { SentraDataset } from "@/lib/sentraData";

export type RuntimeDataset = SentraDataset & {
  source: string;
  generatedAt: string;
  arcBlockNumber: number | null;
};

function defaultRuntimeUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const nodeEnv =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)
      : undefined;
  if (typeof window !== "undefined") {
    return env?.VITE_SENTRA_RUNTIME_DATASET_URL ?? "/api/runtime/dataset";
  }
  return (
    nodeEnv?.SENTRA_AGENT_RUNTIME_URL ??
    env?.VITE_SENTRA_RUNTIME_DATASET_URL ??
    "http://127.0.0.1:19080/dataset"
  );
}

export function runtimeBaseUrl() {
  const datasetUrl = defaultRuntimeUrl();
  try {
    const url = new URL(datasetUrl);
    if (url.pathname.endsWith("/dataset")) {
      url.pathname = url.pathname.replace(/\/dataset$/, "");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function loadRuntimeDataset(): Promise<RuntimeDataset | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(defaultRuntimeUrl(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RuntimeDataset;
    if (!Array.isArray(payload.agents) || !Array.isArray(payload.earningsCalls)) return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
