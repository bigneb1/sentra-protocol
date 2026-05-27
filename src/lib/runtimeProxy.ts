const DEFAULT_RUNTIME_UPSTREAM = "http://144.91.76.243:19080";

function stripRuntimeSuffix(value: string) {
  const url = value.replace(/\/+$/, "");
  if (url.includes("/api/runtime")) return null;
  if (url.endsWith("/dataset")) return url.replace(/\/dataset$/, "");
  return url;
}

export function runtimeUpstreamBaseUrl() {
  const configured =
    process.env.SENTRA_AGENT_RUNTIME_UPSTREAM_URL ??
    process.env.SENTRA_RUNTIME_UPSTREAM_URL ??
    process.env.SENTRA_AGENT_RUNTIME_ORIGIN;
  const upstream = configured ? stripRuntimeSuffix(configured) : null;
  if (upstream) return upstream;

  const datasetUrl = process.env.SENTRA_AGENT_RUNTIME_URL;
  const datasetUpstream = datasetUrl ? stripRuntimeSuffix(datasetUrl) : null;
  if (datasetUpstream) return datasetUpstream;

  return DEFAULT_RUNTIME_UPSTREAM;
}

export function runtimeWorkerSecret() {
  return process.env.SENTRA_AGENT_WORKER_SECRET ?? process.env.SENTRA_RUNTIME_SECRET ?? "";
}

function requestSecret(request: Request) {
  return (
    request.headers.get("x-sentra-runtime-secret") ??
    request.headers.get("x-sentra-worker-secret") ??
    ""
  );
}

export function hasRuntimeSecret(request: Request) {
  const secret = runtimeWorkerSecret();
  return Boolean(secret && requestSecret(request) === secret);
}

export async function proxyRuntimeJson(
  path: string,
  init: {
    method?: "GET" | "POST";
    request?: Request;
    body?: string;
    requireSecret?: boolean;
    cacheControl?: string;
  } = {},
) {
  if (init.requireSecret && (!init.request || !hasRuntimeSecret(init.request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = runtimeWorkerSecret();
  const headers = new Headers({
    accept: "application/json",
  });
  if (init.body) headers.set("content-type", "application/json");
  if (secret) headers.set("x-sentra-runtime-secret", secret);

  const response = await fetch(`${runtimeUpstreamBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": init.cacheControl ?? (response.ok ? "no-store" : "no-store"),
    },
  });
}
