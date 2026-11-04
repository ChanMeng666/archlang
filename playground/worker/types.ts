/**
 * The Cloudflare runtime surfaces the playground Worker uses, declared here as plain types so the
 * Worker needs no `@cloudflare/workers-types` dependency (the hosted MCP Worker does the same,
 * `packages/mcp-worker/src/env.d.ts`). Exported, not ambient, so nothing in the playground app
 * itself sees them.
 */

/** The subset of Workers KV used here (`kv_namespaces` in `playground/wrangler.jsonc`). */
export interface KVNamespace {
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>;
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>;
}

/** A Workers rate-limiting binding (`ratelimits`). */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Workers Analytics Engine (`analytics_engine_datasets`). */
export interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

/** The static-asset binding (`assets.binding`): the asset layer, as if no script ran. */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** The subset of the Workers `ExecutionContext` used here. */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The Worker's bindings. `ASSETS` is always bound by the platform; the rest are optional so a test
 * or a bare local run works without them (a missing limiter lets every request through).
 */
export interface Env {
  ASSETS: Fetcher;
  /** Shared plans: `s:<id>` → the `#z=` payload, with {@link ShareMeta} as metadata. */
  SHARE?: KVNamespace;
  /** Per-address limit on `POST /api/share`. */
  RATE_SHARE?: RateLimit;
  /** Per-address limit on `/s/<id>.png` cache misses (a hit renders nothing). */
  RATE_PREVIEW?: RateLimit;
  /** One data point per create and per resolve: event, id, day. */
  SHARE_ANALYTICS?: AnalyticsEngineDataset;
}

/** What a stored share carries beside its payload (KV metadata, at most 1024 bytes). */
export interface ShareMeta {
  /** Format version of this record. */
  v: 1;
  /** The full base62 SHA-256 of the plan source; the id is a prefix of it. */
  h: string;
  /** The plan's title, already trimmed and capped ({@link import("./share-core.js").planTitle}). */
  t: string;
}
