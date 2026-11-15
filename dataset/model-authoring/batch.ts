/**
 * A small, self-contained client for the Anthropic Message Batches API, on `fetch`.
 *
 * `dataset/` imports nothing from `eval/` and adds no runtime dependency, so this module is the
 * whole client: create a batch, retrieve its status, download its results. The `fetch` and the
 * API key are passed in, so tests drive it with a mocked `fetch` and no network.
 *
 * The API key is only ever placed in the `x-api-key` header; it is never logged, written or
 * echoed in an error.
 */

export const API_BASE = "https://api.anthropic.com";
export const ANTHROPIC_VERSION = "2023-06-01";

/** The `fetch` shape this client needs (the global one satisfies it). */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** One request of a batch: a one-shot Messages call. */
export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    system: { type: "text"; text: string; cache_control: { type: "ephemeral"; ttl?: "1h" } }[];
    messages: { role: "user"; content: string }[];
  };
}

/** The batch object the API returns (the fields this client reads; the rest is kept raw). */
export interface BatchInfo {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  request_counts?: Record<string, number>;
  results_url?: string | null;
  [k: string]: unknown;
}

/** Build one batch request. The system block is identical across a batch and carries
 *  `cache_control`, so the first request writes the prompt cache and later ones can read it. */
export function batchRequest(
  customId: string,
  model: string,
  system: string,
  brief: string,
  maxTokens: number,
  ttl: "5m" | "1h",
): BatchRequest {
  return {
    custom_id: customId,
    params: {
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: system,
          cache_control: ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: brief }],
    },
  };
}

const headers = (apiKey: string, json: boolean): Record<string, string> => ({
  "x-api-key": apiKey,
  "anthropic-version": ANTHROPIC_VERSION,
  ...(json ? { "content-type": "application/json" } : {}),
});

/** Throw on a non-2xx response, quoting the status and body (never the key). */
async function bodyOrThrow(res: Awaited<ReturnType<FetchLike>>, what: string): Promise<string> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}: ${text.slice(0, 2000)}`);
  return text;
}

/** `POST /v1/messages/batches`. */
export async function createBatch(fetchImpl: FetchLike, apiKey: string, requests: BatchRequest[]): Promise<BatchInfo> {
  const res = await fetchImpl(`${API_BASE}/v1/messages/batches`, {
    method: "POST",
    headers: headers(apiKey, true),
    body: JSON.stringify({ requests }),
  });
  return JSON.parse(await bodyOrThrow(res, "create batch")) as BatchInfo;
}

/** `GET /v1/messages/batches/{id}`. */
export async function retrieveBatch(fetchImpl: FetchLike, apiKey: string, id: string): Promise<BatchInfo> {
  const res = await fetchImpl(`${API_BASE}/v1/messages/batches/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: headers(apiKey, false),
  });
  return JSON.parse(await bodyOrThrow(res, `retrieve batch ${id}`)) as BatchInfo;
}

/** Download an ended batch's results (JSONL, one result per line, in no guaranteed order).
 *  Returned verbatim: the raw bytes are the provenance `build` reads. */
export async function downloadResults(fetchImpl: FetchLike, apiKey: string, info: BatchInfo): Promise<string> {
  if (info.processing_status !== "ended") throw new Error(`batch ${info.id} has not ended`);
  const url = info.results_url ?? `${API_BASE}/v1/messages/batches/${encodeURIComponent(info.id)}/results`;
  // The key travels in the header, so a results URL on any other origin is refused outright.
  if (new URL(url).origin !== new URL(API_BASE).origin)
    throw new Error(`batch ${info.id}: results_url is not on ${API_BASE}; refusing to send the key there`);
  const res = await fetchImpl(url, { method: "GET", headers: headers(apiKey, false) });
  return bodyOrThrow(res, `results of batch ${info.id}`);
}
