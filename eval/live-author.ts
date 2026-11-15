/**
 * The live-eval provider adapters: one Anthropic Messages / OpenAI chat-completions call per
 * {@link LiveAuthor} invocation, with the raw reply, the stop reason, the per-call token split
 * and every retry returned beside the text. Moved verbatim out of `eval/l2-run.ts` so that more
 * than one live harness (`eval/l2-run.ts`, `eval/fidelity-live.ts`) drives the same adapters
 * without importing the T3 harness; `eval/l2-run.ts` re-exports every name, unchanged.
 *
 * Neither adapter sends a `temperature`: the 5.5 models reject one, and a pinned temperature
 * would make repeated samples near-copies (`eval/l2-run.ts`'s header has the full reasoning). The
 * Anthropic API has no `seed`, so a seed is a record label there.
 *
 * `writeJsonAtomic` (the crash-safe record write) moved with them. Its only runtime import is
 * `node:fs`: `ChatMsg`/`Usage` (`eval/l2.ts`) and `LiveLedger` (`eval/run.ts`) are type-only, so
 * loading this module loads neither.
 */

import { renameSync, writeFileSync } from "node:fs";
import type { ChatMsg, Usage } from "./l2.js";
import type { LiveLedger } from "./run.js";

/** The output-token cap every live call is sent with (Anthropic `max_tokens`, OpenAI
 *  `max_completion_tokens`). Reasoning models spend thinking tokens from it, so a smaller cap
 *  measures the budget, not the model (the standing harness lesson); run.ts's L0 path uses the
 *  same number. */
export const MAX_OUTPUT_TOKENS = 16384;

// ── Retries ──────────────────────────────────────────────────────────────────────────

/** One retry of one call, as it goes into the record. */
export interface RetryEvent {
  /** The attempt that failed (1 = the first request). */
  attempt: number;
  /** Its HTTP status, or `null` for a network error. */
  status: number | null;
  /** The network error's message, or `null` for an HTTP status. */
  error: string | null;
  /** How long the harness waited before the next attempt. */
  waitMs: number;
  /** What the `retry-after` header asked for, or `null` when there was none. */
  retryAfterMs: number | null;
}

/** How a call retries: waits of `baseMs · 2^(n−1)` (or longer when `retry-after` asks),
 *  until the next wait would take the call's total waiting past `maxTotalWaitMs`. */
export interface RetryPolicy {
  baseMs: number;
  maxTotalWaitMs: number;
  sleep: (ms: number) => Promise<void>;
}

/** 2 s, 4 s, … 128 s: seven retries and 254 s of waiting at most, under the 5-minute cap. */
export const DEFAULT_RETRY: RetryPolicy = {
  baseMs: 2000,
  maxTotalWaitMs: 300_000,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** A call that failed for good: a non-retryable status, or retries exhausted. Carries the
 *  retries it made, so the record keeps them. */
export class CallFailed extends Error {
  constructor(
    message: string,
    readonly retries: RetryEvent[],
  ) {
    super(message);
    this.name = "CallFailed";
  }
}

/** A `retry-after` header in milliseconds: delta-seconds or an HTTP date (RFC 9110 § 10.2.3);
 *  `null` when absent or unreadable. */
export function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const t = header.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const at = Date.parse(t);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

const retryableStatus = (status: number): boolean => status === 429 || status >= 500;

/**
 * POST with retries. A network error, a 429 or a 5xx (Anthropic's 529 included) waits and
 * retries: the wait is the exponential step or the `retry-after` the server asked for,
 * whichever is longer. It gives up with {@link CallFailed} once the next wait would take the
 * call past `policy.maxTotalWaitMs` of waiting in total. Any other response (success or a
 * non-retryable error) is returned with the retries made, for the caller to judge.
 */
export async function postWithRetry(
  label: string,
  url: string,
  init: RequestInit,
  policy: RetryPolicy = DEFAULT_RETRY,
): Promise<{ res: Response; retries: RetryEvent[] }> {
  const retries: RetryEvent[] = [];
  let waited = 0;
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    let error: string | null = null;
    try {
      res = await fetch(url, init);
    } catch (err) {
      error = (err as Error).message;
    }
    if (res !== null && !retryableStatus(res.status)) return { res, retries };
    const body = res !== null ? await res.text().catch(() => "") : "";
    const ra = res !== null ? retryAfterMs(res.headers.get("retry-after"), Date.now()) : null;
    const wait = Math.max(policy.baseMs * 2 ** (attempt - 1), ra ?? 0);
    if (waited + wait > policy.maxTotalWaitMs) {
      const what = res !== null ? `${res.status}: ${body}` : `network error: ${error}`;
      throw new CallFailed(
        `${label} API ${what} (gave up after ${retries.length} retries, ${waited} ms waited)`,
        retries,
      );
    }
    retries.push({ attempt, status: res?.status ?? null, error, waitMs: wait, retryAfterMs: ra });
    await policy.sleep(wait);
    waited += wait;
  }
}

// ── Provider adapters ────────────────────────────────────────────────────────────────

/** What one live call adds to the record beyond the protocol's text + usage. */
export interface CallMeta {
  /** The raw reply text, before `extractArch`. */
  text: string;
  /** The provider's stop/finish reason (`null` when it sent none). */
  stop: string | null;
  /** Prompt tokens neither written to nor read from the cache. */
  fresh: number;
  /** Prompt tokens written to the cache. */
  cacheWrite: number;
  /** Prompt tokens read from the cache. */
  cacheRead: number;
  /** Completion tokens. */
  output: number;
  /** Every retry this call needed. */
  retries: RetryEvent[];
}

/** An {@link L2Author} that also returns the call's {@link CallMeta}. */
export type LiveAuthor = (messages: ChatMsg[], seed: number) => Promise<{ text: string; usage: Usage; call: CallMeta }>;

/** Build the OpenAI author (reference only: the one T3 run is Anthropic, and
 *  {@link preflight} refuses OpenAI). A multi-turn chat call recording usage, the stop reason
 *  and the first `system_fingerprint` into `ledger`. */
export function makeOpenAIAuthor(model: string, ledger: LiveLedger, policy: RetryPolicy = DEFAULT_RETRY): LiveAuthor {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set (required for a live eval with the openai provider)");
  return async (messages, seed) => {
    const { res, retries } = await postWithRetry(
      "OpenAI",
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          // Reasoning models spend thinking tokens from this cap — a small cap starves the
          // model into truncated (invalid) plans (the standing harness lesson). 16384 both
          // sizes truncation out and mirrors the L0 path.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          // NO temperature: gpt-5.x reasoning endpoints reject a non-default value, so
          // `seed` is the only reproducibility lever.
          seed,
          messages,
        }),
      },
      policy,
    );
    if (!res.ok) throw new CallFailed(`OpenAI API ${res.status}: ${await res.text()}`, retries);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string | null }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
      system_fingerprint?: string | null;
    };
    const input = json.usage?.prompt_tokens ?? 0;
    const cached = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const output = json.usage?.completion_tokens ?? 0;
    const stop = json.choices?.[0]?.finish_reason ?? null;
    ledger.record({ input, output, stop });
    ledger.noteFingerprint(json.system_fingerprint);
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text,
      usage: { input, output },
      call: { text, stop, fresh: input - cached, cacheWrite: 0, cacheRead: cached, output, retries },
    };
  };
}

/** What the loop arm replays for an empty (or whitespace-only) model reply. The Anthropic
 *  Messages API rejects an empty non-final message with a 400, where OpenAI accepts one; the
 *  loop arm sends the prior raw reply back as an assistant turn, so without this an empty
 *  reply would end the brief. */
export const EMPTY_REPLY_PLACEHOLDER = "(empty reply)";

/** The Anthropic Messages request body for one L2 call. The `system` turns become the
 *  top-level `system` block, marked cacheable (it is the ~30 KB spec, byte-identical on
 *  every call, as in run.ts); with no system turn there is no `system` block at all (an empty
 *  text block is a 400). The rest pass through in order. No `temperature` and no `seed` (see
 *  the module header). `max_tokens` is {@link MAX_OUTPUT_TOKENS}, as on the OpenAI path. */
export function anthropicRequest(model: string, messages: ChatMsg[]): Record<string, unknown> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" && m.content.trim() === "" ? EMPTY_REPLY_PLACEHOLDER : m.content,
    }));
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    ...(system.trim() !== "" ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
    messages: turns,
  };
}

/** Build the Anthropic author: a multi-turn Messages call recording usage and the stop
 *  reason into `ledger`. The returned `usage.input` is the whole prompt (`input_tokens` +
 *  cache writes + cache reads), the same quantity as OpenAI's `prompt_tokens`, so the control
 *  arm's equal budget does not depend on what was cached; the ledger and the record get the
 *  three counts apart, so the ledger's total counts each token once. */
export function makeAnthropicAuthor(
  model: string,
  ledger: LiveLedger,
  policy: RetryPolicy = DEFAULT_RETRY,
): LiveAuthor {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for a live eval with the anthropic provider)");
  return async (messages) => {
    const { res, retries } = await postWithRetry(
      "Anthropic",
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(anthropicRequest(model, messages)),
      },
      policy,
    );
    if (!res.ok) throw new CallFailed(`Anthropic API ${res.status}: ${await res.text()}`, retries);
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const fresh = json.usage?.input_tokens ?? 0;
    const cacheWrite = json.usage?.cache_creation_input_tokens ?? 0;
    const cacheRead = json.usage?.cache_read_input_tokens ?? 0;
    const output = json.usage?.output_tokens ?? 0;
    const stop = json.stop_reason ?? null;
    ledger.record({ input: fresh, output, cacheCreation: cacheWrite, cacheRead, stop });
    const text = (json.content ?? []).map((b) => b.text ?? "").join("");
    return {
      text,
      usage: { input: fresh + cacheWrite + cacheRead, output },
      call: { text, stop, fresh, cacheWrite, cacheRead, output, retries },
    };
  };
}

/** The provider's {@link LiveAuthor}. */
export function makeL2Author(
  provider: "anthropic" | "openai",
  model: string,
  ledger: LiveLedger,
  policy: RetryPolicy = DEFAULT_RETRY,
): LiveAuthor {
  return provider === "anthropic"
    ? makeAnthropicAuthor(model, ledger, policy)
    : makeOpenAIAuthor(model, ledger, policy);
}

/** Write a JSON file through a temporary sibling, so a crash mid-write never leaves a
 *  truncated record. Throws on any failure: the first and the final write of a run call it
 *  directly, so they fail loudly. */
export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}
