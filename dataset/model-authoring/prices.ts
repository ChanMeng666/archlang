/**
 * Cost estimates for the model-authoring batches, at Message Batches prices (50% of list).
 *
 * `dataset/` may not import `eval/`, so the list prices are COPIED from `eval/run.ts`'s
 * `PRICES_USD_PER_MTOK` table (rows verified there on 2026-11-15 against
 * https://platform.claude.com/docs/en/about-claude/pricing). When that table changes, copy the
 * numbers again; `test/dataset-model-authoring.test.ts` reads `eval/run.ts` as text and fails
 * when a copied row no longer matches it. The cache multipliers come from the same pricing page
 * (checked 2026-11-15): cache writes are 1.25x (5-minute TTL) or 2x (1-hour TTL) the base input
 * price for every model; cache reads are 0.1x for Haiku 5.5, 0.05x for Opus 5.5 and Sonnet 5.5,
 * and 0.025x for Fable 5.2 and 5.1. Batch and caching discounts stack.
 *
 * Every figure is an ESTIMATE: input tokens are not counted but estimated from characters at
 * {@link CHARS_PER_TOKEN} (fewer characters per token than English prose averages, so the count
 * runs high). Three figures per model:
 *   - `cachedEstimate`: the system prompt written to the cache once and read by every other
 *     request (Batch caching is best-effort, so this is the optimistic figure), plus
 *     {@link TYPICAL_OUTPUT_TOKENS} output tokens per reply;
 *   - `estimate`: every request writes the system prompt (no cache hit at all), same output;
 *   - `ceiling`: as `estimate`, but with `max_tokens` output on every request. The output part is
 *     a true upper bound; the input part is the chars/3 estimate. `submit` refuses when the
 *     summed ceiling exceeds `--max-usd`.
 */

/** List prices, USD per 1M tokens — copied from `eval/run.ts` (Anthropic rows only). */
export const LIST_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  // Haiku 5.5 bills $0.10/$0.50 up to 100k prompt tokens, $0.50/$2.50 above; the higher tier is used.
  "claude-haiku-5-5": { input: 0.5, output: 2.5 },
  "claude-fable-5-2": { input: 8, output: 40 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

/** Cache-read price as a fraction of the base input price, per model (pricing page, 2026-11-15). */
export const CACHE_READ_MULTIPLIER: Record<string, number> = {
  "claude-opus-5-5": 0.05,
  "claude-sonnet-5-5": 0.05,
  "claude-haiku-5-5": 0.1,
  "claude-fable-5-2": 0.025,
  "claude-fable-5-1": 0.025,
};

/** Message Batches bill 50% of the list price. */
export const BATCH_DISCOUNT = 0.5;

/** Short names a `--models` list may use for the full model ids. */
export const MODEL_ALIASES: Record<string, string> = {
  "haiku-5-5": "claude-haiku-5-5",
  "sonnet-5-5": "claude-sonnet-5-5",
  "opus-5-5": "claude-opus-5-5",
  "fable-5-2": "claude-fable-5-2",
  "fable-5-1": "claude-fable-5-1",
};

/** Resolve an alias or a full id; null when the model has no copied price (cost unbounded). */
export function resolveModel(name: string): string | null {
  const id = MODEL_ALIASES[name] ?? name;
  return id in LIST_PRICES_USD_PER_MTOK && id in CACHE_READ_MULTIPLIER ? id : null;
}

/** Characters per token used for the input estimate. */
export const CHARS_PER_TOKEN = 3;
/** Output tokens assumed per reply for the two estimates (a one-block plan reply). */
export const TYPICAL_OUTPUT_TOKENS = 3000;

/** Cache-write multipliers on the input rate, by TTL (the same for every listed model). */
export const CACHE_WRITE_MULTIPLIER: Record<CacheTtl, number> = { "5m": 1.25, "1h": 2 };
export type CacheTtl = "5m" | "1h";

export interface ModelCost {
  model: string;
  requests: number;
  /** Estimated input tokens over the whole batch (system prompt on every request + briefs). */
  inputTokens: number;
  /** If the cache hits: the system prompt written once, read by every other request. */
  cachedEstimateUsd: number;
  /** If the cache never hits: every request writes the system prompt. */
  estimateUsd: number;
  /** As `estimateUsd`, but with `max_tokens` output on every request. */
  ceilingUsd: number;
}

/** Estimate one model's batch of `requests` requests sharing one system prompt of
 *  `systemChars` characters; `userChars` is the summed brief characters. */
export function estimateCost(
  model: string,
  requests: number,
  systemChars: number,
  userChars: number,
  maxTokens: number,
  ttl: CacheTtl,
): ModelCost {
  const p = LIST_PRICES_USD_PER_MTOK[model];
  const read = CACHE_READ_MULTIPLIER[model];
  if (!p || read === undefined) throw new Error(`no copied price for ${model}`);
  const sysTok = Math.ceil(systemChars / CHARS_PER_TOKEN);
  const userTok = Math.ceil(userChars / CHARS_PER_TOKEN);
  const rate = (tok: number, perM: number): number => (tok * perM) / 1_000_000;
  const write = CACHE_WRITE_MULTIPLIER[ttl];
  const uncachedIn = rate(requests * sysTok, p.input * write) + rate(userTok, p.input);
  const cachedIn =
    rate(sysTok, p.input * write) + rate(Math.max(0, requests - 1) * sysTok, p.input * read) + rate(userTok, p.input);
  const typicalOut = rate(requests * TYPICAL_OUTPUT_TOKENS, p.output);
  const maxOut = rate(requests * maxTokens, p.output);
  return {
    model,
    requests,
    inputTokens: requests * sysTok + userTok,
    cachedEstimateUsd: (cachedIn + typicalOut) * BATCH_DISCOUNT,
    estimateUsd: (uncachedIn + typicalOut) * BATCH_DISCOUNT,
    ceilingUsd: (uncachedIn + maxOut) * BATCH_DISCOUNT,
  };
}
