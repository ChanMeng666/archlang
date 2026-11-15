/**
 * L2 harness runner — the decisive loop-vs-equal-budget-resampling experiment
 * (roadmap Tranche 3, T3). This is the ONE file that talks to the network: it wraps a
 * provider endpoint (the Anthropic Messages API; an OpenAI chat-completions adapter is kept
 * as reference) as an {@link L2Author} and drives the pure protocol in `l2.ts` across the
 * corpus for `--trials` repetitions, producing `eval/results.l2.<model>.{json,md}` (one pair
 * per model, so a second model never overwrites the first).
 *
 * T3 status: ONE owner-ratified live run (ratified 2026-11-15, not yet run), within the
 * bounds in `docs/agents/iron-laws.md`: provider anthropic; claude-sonnet-5-5 and
 * claude-haiku-5-5; analysis and decision rule pre-registered before the run in
 * `eval/live-runs/2026-11-t3-preregistration.md`; the record published in `eval/live-runs/`
 * whatever it shows. No loop-gain claim and no claim of its absence: the published record
 * is the only statement of the result, and any other claim, either way, needs an owner
 * decision. Never re-propose another run.
 *
 * {@link preflight} checks four things before anything else, and each refusal exits `3`
 * before any call: (1) `ARCHLANG_EVAL_PROVIDER` is `anthropic`, set explicitly; (2)
 * `ARCHLANG_EVAL_MODEL` is one of {@link T3_MODELS}; (3) the pre-registration file
 * {@link PREREGISTRATION} exists; (4) neither results file for that model exists yet, so a
 * result is never overwritten. It does not check the pre-registration's content, the
 * `--max`/`--trials`/`--budget` values, or that the run has not happened under another name:
 * those bounds rest on the operator and the pre-registration.
 *
 * Like `eval:live`, it is **guarded**: without `--yes` (or `ARCHLANG_EVAL_CONFIRM=1`) it
 * prints the plan (provider, model, briefs, trials, the loop's call cap, budget, output
 * paths) and exits `3` WITHOUT calling any API. `--budget <n>tok|<n>usd` is a cumulative
 * circuit breaker (reusing run.ts's `LiveLedger`), checked once at the start of each brief;
 * `--max <n>` caps briefs; `--trials <n>` (default 3) sets repetitions; `--concurrency <n>`
 * (default 4) runs briefs in parallel — each brief's loop→control arms stay serial because
 * the control's budget is the loop's *measured* token spend (Olausson equal budget).
 *
 * The record is crash-safe: the JSON is written (atomically, via a temporary file) before
 * the first call and again after every brief, with `meta.status` `running` until the end;
 * the Markdown scorecard is written last. Every call keeps its raw reply, stop reason, token
 * split and retries. A call that still fails after {@link postWithRetry}'s retries ends its
 * brief as `partial`: the trials already completed are kept, and the failed trial's calls are
 * kept beside them. Partial and budget-skipped briefs are excluded from the rates.
 *
 * Reproducibility: OpenAI reasoning endpoints reject a non-default temperature, so the
 * only lever there is `seed`; `max_completion_tokens` is 16384 (reasoning models spend
 * thinking tokens from the completion cap — a smaller cap measures the budget, not the
 * model). The Anthropic API has no `seed`, so the seeds are record labels only, and NO
 * `temperature` is sent: the 5.5 models reject it (PR #295), and a pinned temperature would
 * make the control arm's "i.i.d." resamples near-copies of one another. This is deliberately
 * not run.ts's retry-with-temperature-0 path.
 *
 * Run: see eval/README.md, "The one T3 run".
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JUDGE_VERSION } from "./assertions.js";
import {
  type CorpusEntry,
  LiveLedger,
  VERSION_TAG,
  isTruncationStop,
  loadCorpus,
  parseBudget,
  systemPrompt,
} from "./run.js";
import {
  type ArmScore,
  type ChatMsg,
  type ControlArmResult,
  type L2Author,
  type LoopArmResult,
  type TrialCell,
  type Usage,
  passAtN,
  passHatN,
  runControlArm,
  runLoopArm,
  scoreArm,
  summarizeTrials,
} from "./l2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// ── Seed scheme (fully derived so every run is reproducible-by-record) ───────────────
/** Anchor seed — trial 1's loop arm shares it with the calibrated L0 baseline. */
const SEED_BASE = 20260711;
/** Per-trial stride; trial t (1-based) loop seed = SEED_BASE + (t-1)·STRIDE. */
const TRIAL_STRIDE = 1000;
/** Offset from a trial's loop seed to its control arm's seed base (control sample i uses
 *  seedBase + i), so loop and control never collide on a seed within a trial. */
const CONTROL_OFFSET = 100;
/** L2 loop round cap (arXiv:2607.05197, 2604.10508): ≤ 2 revision rounds after the first. */
const MAX_ROUNDS = 2;

/** The only models the one ratified T3 run may use (`docs/agents/iron-laws.md`). */
export const T3_MODELS: readonly string[] = ["claude-sonnet-5-5", "claude-haiku-5-5"];

/** The full record and scorecard paths for one model (repo-relative, git-ignored). The
 *  model id is part of the name, so the two models of one run write two pairs and the
 *  second never overwrites the first. Any character outside `[A-Za-z0-9._-]` becomes `_`. */
export function resultsPaths(model: string): { md: string; json: string } {
  const slug = model.replace(/[^A-Za-z0-9._-]/g, "_");
  return { md: `eval/results.l2.${slug}.md`, json: `eval/results.l2.${slug}.json` };
}

/** What {@link preflight} decides: run (with the resolved provider, model and paths) or refuse. */
export type Preflight =
  | { ok: true; provider: "anthropic"; model: string; out: { md: string; json: string } }
  | { ok: false; message: string };

/** The pre-registration of the one T3 run's analysis and decision rule (repo-relative). The
 *  harness refuses to run until it exists. */
export const PREREGISTRATION = "eval/live-runs/2026-11-t3-preregistration.md";

/**
 * The bounds of the one ratified T3 run, checked before anything else (the caller exits `3`
 * on a refusal, before any call), in this order: `ARCHLANG_EVAL_PROVIDER` must be
 * `anthropic`, explicitly; `ARCHLANG_EVAL_MODEL` must be one of {@link T3_MODELS};
 * {@link PREREGISTRATION} must exist; and neither results file for that model may exist yet,
 * because a result is never overwritten. `exists` takes a repo-relative path, so the rule is
 * testable without touching the disk.
 */
export function preflight(env: Record<string, string | undefined>, exists: (rel: string) => boolean): Preflight {
  const bounds = "eval:l2 runs only within the one ratified T3 run's bounds (docs/agents/iron-laws.md)";
  const provider = env.ARCHLANG_EVAL_PROVIDER?.trim().toLowerCase() || undefined;
  if (provider !== "anthropic") {
    return {
      ok: false,
      message: `✗ ${bounds}: set ARCHLANG_EVAL_PROVIDER=anthropic explicitly (got ${provider ? `"${provider}"` : "nothing"}).`,
    };
  }
  const model = env.ARCHLANG_EVAL_MODEL?.trim() || "";
  if (!T3_MODELS.includes(model)) {
    return {
      ok: false,
      message: `✗ ${bounds}: ARCHLANG_EVAL_MODEL must be one of ${T3_MODELS.join(", ")} (got ${model ? `"${model}"` : "nothing"}).`,
    };
  }
  if (!exists(PREREGISTRATION)) {
    return {
      ok: false,
      message: `✗ ${bounds}: the analysis and decision rule must be pre-registered first — ${PREREGISTRATION} does not exist. Nothing was sent.`,
    };
  }
  const out = resultsPaths(model);
  const existing = [out.json, out.md].filter(exists);
  if (existing.length > 0) {
    return {
      ok: false,
      message: `✗ ${existing.join(" and ")} already exist${existing.length === 1 ? "s" : ""}: a T3 result is never overwritten. Nothing was sent.`,
    };
  }
  return { ok: true, provider: "anthropic", model, out };
}

/** Banner marking the L2 result as ephemeral, mirroring the live scorecard's header. */
const l2Header = (jsonPath: string): string =>
  [
    "<!-- L2 loop-vs-resampling results — generated by `npm run eval:l2`. EPHEMERAL and",
    "     git-ignored: these numbers depend on the model and the day. The full per-call",
    `     record (raw replies, usage, seeds, retries, scores) is the sibling ${jsonPath}. -->`,
    "",
    "",
  ].join("\n");

/** A positive-integer flag parser mirroring run.ts's `--max` contract (exit 3 on a bad
 *  value). Returns `def` when the flag is absent. */
function intFlag(argv: string[], name: string, def: number): number {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const raw = argv[i + 1];
  const v = Number(raw);
  if (raw === undefined || !Number.isInteger(v) || v <= 0) {
    process.stderr.write(`✗ ${name} needs a positive integer (got ${raw ?? "nothing"})\n`);
    process.exit(3);
  }
  return v;
}

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
  if (!key) throw new Error("OPENAI_API_KEY is not set (required for eval:l2)");
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
          max_completion_tokens: 16384,
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
 *  the module header). `max_tokens` 16384 mirrors run.ts and the OpenAI path. */
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
    max_tokens: 16384,
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
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for eval:l2 with the anthropic provider)");
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

// ── Running a brief ──────────────────────────────────────────────────────────────────

/** One call as the record keeps it: which arm, its index within that arm, its seed (a label
 *  only on Anthropic), and its {@link CallMeta}. */
export interface CallRecord extends CallMeta {
  arm: "loop" | "control";
  index: number;
  seed: number;
}

/** One trial's record for a brief: both arms' traces, scores, seeds and every call. */
export interface TrialRecord {
  trial: number;
  loopSeed: number;
  controlSeedBase: number;
  loopTokens: number;
  loop: LoopArmResult;
  control: ControlArmResult;
  loopScore: ArmScore;
  controlScore: ArmScore;
  calls: CallRecord[];
}

/**
 * A brief's record. `complete`: every trial ran. `skipped`: the budget breaker had tripped
 * before it started. `partial`: a call failed for good; `trials` keeps every trial completed
 * before it, and `failure` names the trial, the error, the failed call's retries and the
 * calls that trial made before failing. Only `complete` briefs enter the rates.
 */
export interface BriefRecord {
  id: string;
  status: "complete" | "partial" | "skipped";
  trials: TrialRecord[];
  failure?: { trial: number; message: string; retries: RetryEvent[]; calls: CallRecord[] };
}

/** Run every trial for one brief: loop arm, then an equal-budget control arm sized to the
 *  loop's *measured* token spend. Skipped (no trials) when the global budget breaker has
 *  already tripped — checked once at brief start, mirroring run.ts's per-brief semantics. */
export async function runBrief(
  entry: CorpusEntry,
  author: LiveAuthor,
  ledger: LiveLedger,
  opts: { system: string; trials: number; log?: (line: string) => void },
): Promise<BriefRecord> {
  if (ledger.over()) return { id: entry.id, status: "skipped", trials: [] };
  const trials: TrialRecord[] = [];
  let calls: CallRecord[] = [];
  let arm: "loop" | "control" = "loop";
  const traced: L2Author = async (messages, seed) => {
    const r = await author(messages, seed);
    calls.push({ arm, index: calls.filter((c) => c.arm === arm).length, seed, ...r.call });
    return { text: r.text, usage: r.usage };
  };
  let t = 1;
  try {
    for (; t <= opts.trials; t++) {
      calls = [];
      const loopSeed = SEED_BASE + (t - 1) * TRIAL_STRIDE;
      const controlSeedBase = loopSeed + CONTROL_OFFSET;

      arm = "loop";
      const loop = await runLoopArm(entry, traced, { system: opts.system, seed: loopSeed, maxRounds: MAX_ROUNDS });
      const loopTokens = loop.rounds.reduce((n, r) => n + r.usage.input + r.usage.output, 0);
      arm = "control";
      const control = await runControlArm(entry, traced, {
        system: opts.system,
        seedBase: controlSeedBase,
        budgetTokens: loopTokens,
      });

      trials.push({
        trial: t,
        loopSeed,
        controlSeedBase,
        loopTokens,
        loop,
        control,
        loopScore: scoreArm(
          entry,
          loop.rounds.map((r) => r.source),
        ),
        controlScore: scoreArm(
          entry,
          control.samples.map((s) => s.source),
        ),
        calls,
      });
    }
  } catch (err) {
    // Keep everything already paid for: the completed trials and the failed trial's calls.
    const message = (err as Error).message;
    const retries = err instanceof CallFailed ? err.retries : [];
    (opts.log ?? ((l: string) => process.stderr.write(l)))(
      `  ✗ ${entry.id}: partial (trial ${t} failed; ${trials.length} kept) — ${message}\n`,
    );
    return { id: entry.id, status: "partial", trials, failure: { trial: t, message, retries, calls } };
  }
  return { id: entry.id, status: "complete", trials };
}

/** A bounded-concurrency worker pool over an ordered item list (results keep input order). */
async function pool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, run));
  return results;
}

/** Flatten scored briefs into the per-(brief, trial) cells the aggregator consumes. Only
 *  `complete` briefs contribute: partial and skipped ones are excluded from every denominator. */
export function toCells(briefs: BriefRecord[]): TrialCell[] {
  const cells: TrialCell[] = [];
  for (const b of briefs) {
    if (b.status !== "complete") continue;
    for (const tr of b.trials) {
      cells.push({
        id: b.id,
        trial: tr.trial,
        loop: { valid: tr.loopScore.valid, intent: tr.loopScore.intent, sound: tr.loopScore.sound },
        control: { valid: tr.controlScore.valid, intent: tr.controlScore.intent, sound: tr.controlScore.sound },
      });
    }
  }
  return cells;
}

// ── The record and the scorecard ─────────────────────────────────────────────────────

/** The run's provenance, as it goes into the record's `meta`. */
export interface RunMeta {
  provider: "anthropic" | "openai";
  model: string;
  trials: number;
  /** How many briefs the run was asked for. */
  briefs: number;
  budget: string | null;
  concurrency: number;
  argv: string[];
  /** ISO 8601, taken before the first call. */
  startedAt: string;
  /** ISO 8601, taken after the last brief; `null` while running. */
  endedAt: string | null;
  git: { head: string | null; dirty: boolean | null };
  sha256: { spec: string; systemPrompt: string };
}

/** The JSON record: `meta` (provenance, status, counts), `summary` (over complete briefs
 *  only), every brief done so far, and the ledger. */
export function buildRecord(
  meta: RunMeta,
  status: "running" | "complete",
  briefs: BriefRecord[],
  ledger: LiveLedger,
): Record<string, unknown> {
  const cells = toCells(briefs);
  const count = (s: BriefRecord["status"]): number => briefs.filter((b) => b.status === s).length;
  return {
    meta: {
      mode: "live-l2",
      status,
      ...meta,
      maxRounds: MAX_ROUNDS,
      seeds: { base: SEED_BASE, stride: TRIAL_STRIDE, controlOffset: CONTROL_OFFSET },
      versions: VERSION_TAG,
      judge: JUDGE_VERSION,
      fingerprint: ledger.systemFingerprint ?? null,
      retry: { baseMs: DEFAULT_RETRY.baseMs, maxTotalWaitMs: DEFAULT_RETRY.maxTotalWaitMs },
      done: briefs.length,
      complete: count("complete"),
      partial: count("partial"),
      skipped: count("skipped"),
    },
    summary: {
      ...summarizeTrials(cells),
      passAtN: { loop: passAtN(cells, "loop"), control: passAtN(cells, "control") },
      passHatN: { loop: passHatN(cells, "loop"), control: passHatN(cells, "control") },
    },
    briefs,
    ledger: {
      calls: ledger.calls,
      inputTokens: ledger.inputTokens,
      outputTokens: ledger.outputTokens,
      cacheCreationTokens: ledger.cacheCreation,
      cacheReadTokens: ledger.cacheRead,
      totalTokens: ledger.totalTokens(),
      usd: ledger.usd(),
      stops: Object.fromEntries(ledger.stops),
    },
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const signed = (x: number): string => (x > 0 ? `+${x.toFixed(3)}` : x.toFixed(3));
/** Table-cell escapes, character by character (no regex replace, so no character is left
 *  half-escaped), as `scripts/gen-module-map.ts` does. */
const CELL_ESC: Record<string, string> = { "|": "\\|", "\\": "\\\\", "\r": " ", "\n": " " };
/** A free-text value made safe for one Markdown table cell. */
const cell = (s: string): string => Array.from(s, (c) => CELL_ESC[c] ?? c).join("");

/** Render the L2 scorecard Markdown. */
export function renderMd(
  briefs: BriefRecord[],
  cells: TrialCell[],
  meta: {
    provider: "anthropic" | "openai";
    model: string;
    trials: number;
    fingerprint?: string;
    total: number;
    /** Calls per provider stop/finish reason, over the whole run (`LiveLedger.stops`). */
    stops: ReadonlyMap<string, number>;
  },
): string {
  const s = summarizeTrials(cells);
  const skipped = briefs.filter((b) => b.status === "skipped").length;
  const partial = briefs.filter((b) => b.status === "partial").length;
  const stopCalls = [...meta.stops.values()].reduce((a, b) => a + b, 0);
  const truncated = [...meta.stops].reduce((n, [k, v]) => n + (isTruncationStop(k) ? v : 0), 0);
  const stopList = [...meta.stops].map(([k, v]) => `${k} ${v}`).join(" · ");
  const armRow = (name: "loop" | "control"): string => {
    const a = s[name];
    const ms = (m: { mean: number; sigma: number }): string => `${pct(m.mean)} ±${pct(m.sigma)}`;
    return `| ${name} | ${ms(a.valid)} | ${ms(a.intent)} | ${ms(a.sound)} |`;
  };
  const netLine = (metric: "valid" | "intent" | "sound"): string =>
    `- **${metric}:** loop − control = ${signed(s.net[metric])}`;

  // Roadmap T3: if the loop's net intent delta is ≤ 0, say so verbatim. This line is the
  // harness's raw arithmetic, not the pre-registered decision rule. With no complete brief
  // the deltas are 0 − 0 over nothing, so no sentence about the loop is printed at all.
  const verdict =
    s.briefs === 0
      ? "no complete briefs — no verdict"
      : s.net.intent > 0
        ? `The loop beats equal-budget resampling on intent by ${signed(s.net.intent)} (net).`
        : "The loop does not beat equal-budget resampling.";

  const trialRow = (id: string, tr: TrialRecord, note: string): string => {
    const arm = (a: ArmScore): string => `v${a.valid ? "1" : "0"} i${a.intent ? "1" : "0"} s${a.sound ? "1" : "0"}`;
    const loopTok = tr.loop.rounds.reduce((n, r) => n + r.usage.input + r.usage.output, 0);
    const ctlTok = tr.control.samples.reduce((n, x) => n + x.usage.input + x.usage.output, 0);
    const loopCell = `loop ${tr.loop.rounds.length}rd/${loopTok}tok · ${arm(tr.loopScore)}${note}`;
    const ctlCell = `ctl ${tr.control.samples.length}smp/${ctlTok}tok · ${arm(tr.controlScore)}`;
    return `| \`${id}\` | ${tr.trial} | ${loopCell} | ${ctlCell} |`;
  };
  const detail = briefs.flatMap((b) => {
    if (b.status === "skipped") return [`| \`${b.id}\` | — | ⏭️ skipped (budget) | — |`];
    if (b.status === "partial") {
      const f = b.failure;
      return [
        ...b.trials.map((tr) => trialRow(b.id, tr, " (partial brief: excluded)")),
        `| \`${b.id}\` | ${f?.trial ?? "—"} | ✗ partial — ${cell(f?.message ?? "error")} (excluded from the rates) | — |`,
      ];
    }
    return b.trials.map((tr) => trialRow(b.id, tr, ""));
  });

  const seedNote =
    `base ${SEED_BASE}, +${TRIAL_STRIDE}/trial, control +${CONTROL_OFFSET}` +
    (meta.provider === "anthropic" ? " (labels only: the Anthropic API takes no seed; default sampling)" : "");
  const fp = meta.fingerprint ? ` · fp ${meta.fingerprint}` : "";
  const excluded = [
    ...(skipped ? [`${skipped} skipped by the \`--budget\` breaker`] : []),
    ...(partial ? [`${partial} partial after a failed call`] : []),
  ];

  return [
    "# ArchLang L2 authorability scorecard — diagnostic loop vs. equal-budget resampling",
    "",
    `Mode: **live L2** · ${meta.provider} · model ${meta.model} · ${meta.trials} trial(s) · ${s.briefs} brief(s) · ${VERSION_TAG}${fp}.`,
    `Seeds: ${seedNote}. Loop ≤ ${1 + MAX_ROUNDS} calls/trial; control i.i.d. at the loop's measured token budget.`,
    `Stop reasons: ${stopList || "none reported"}. Truncated replies (\`max_tokens\`/\`length\`): ${truncated}/${stopCalls}.`,
    "",
    ...(excluded.length
      ? [`> ${excluded.join("; ")} of ${meta.total} brief(s) (excluded from the rates below).`, ""]
      : []),
    `**Verdict (harness arithmetic, not the pre-registered rule):** ${verdict}`,
    "",
    "## Per-arm rates (mean ± σ across trials)",
    "",
    "| Arm | Valid | Intent | Sound |",
    "| --- | --- | --- | --- |",
    armRow("loop"),
    armRow("control"),
    "",
    "Best-of-n per arm, independent per metric. σ is the trial-to-trial (population) variance of the rate.",
    "",
    "### Net delta (loop − control, of the mean rates)",
    "",
    netLine("valid"),
    netLine("intent"),
    netLine("sound"),
    "",
    "### pass@n / pass^n (intent)",
    "",
    `- **loop:** pass@${meta.trials} ${pct(passAtN(cells, "loop"))} · pass^${meta.trials} ${pct(passHatN(cells, "loop"))}`,
    `- **control:** pass@${meta.trials} ${pct(passAtN(cells, "control"))} · pass^${meta.trials} ${pct(passHatN(cells, "control"))}`,
    "",
    "## Per-brief, per-trial detail",
    "",
    "Cells: `v`alid `i`ntent `s`ound (1 = a best-of output passed). `rd` = loop rounds, `smp` = control samples.",
    "",
    "| Prompt | Trial | Loop arm | Control arm |",
    "| --- | --- | --- | --- |",
    ...detail,
    "",
  ].join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────────────

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** `git rev-parse HEAD` and whether the tree is dirty, or nulls when git is unavailable. */
function gitInfo(): { head: string | null; dirty: boolean | null } {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim() !== "";
    return { head, dirty };
  } catch {
    return { head: null, dirty: null };
  }
}

/** Write a JSON file through a temporary sibling, so a crash mid-write never leaves a
 *  truncated record. Throws on any failure: the first and the final write of a run call it
 *  directly, so they fail loudly. */
export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

/** An incremental (per-brief) write: a failure is logged and swallowed, because the next
 *  brief's write supersedes it and the run's paid calls must not be lost to it. On Windows a
 *  reader holding the file open (an editor, an indexer, antivirus) makes `renameSync` throw
 *  `EPERM`. Returns whether the write succeeded. */
export function writeProgress(
  write: () => void,
  log: (line: string) => void = (l) => process.stderr.write(l),
): boolean {
  try {
    write();
    return true;
  } catch (err) {
    log(`⚠ eval:l2: progress write failed (${(err as Error).message}); the next brief's write supersedes it\n`);
    return false;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pre = preflight(process.env, (rel) => existsSync(resolve(ROOT, rel)));
  if (!pre.ok) {
    process.stderr.write(`${pre.message}\n`);
    process.exit(3);
  }
  const { provider, model, out } = pre;
  const all = loadCorpus();
  const max = intFlag(argv, "--max", all.length);
  const trials = intFlag(argv, "--trials", 3);
  const concurrency = intFlag(argv, "--concurrency", 4);
  const budget = parseBudget(argv);
  const entries = all.slice(0, max);
  const confirmed = argv.includes("--yes") || process.env.ARCHLANG_EVAL_CONFIRM === "1";

  if (!confirmed) {
    // The loop arm is capped at (1 + MAX_ROUNDS) calls/trial. The control arm has no call
    // cap: it draws one-shots until it has spent the loop's measured tokens, and a loop
    // round's prompt grows with every turn, so the control usually needs MORE calls than
    // the loop. Only --budget bounds the spend.
    const loopMax = entries.length * trials * (1 + MAX_ROUNDS);
    const usdVoid = budget?.kind === "usd" && !new LiveLedger(model).priceKnown;
    process.stderr.write(
      [
        "The L2 eval calls a paid API many times per brief (loop + equal-budget control). Nothing was sent.",
        "",
        `  provider    : ${provider}`,
        `  model       : ${model}`,
        `  briefs      : ${entries.length}${max < all.length ? ` (capped by --max ${max})` : " (all)"}`,
        `  trials      : ${trials}`,
        `  loop calls  : ≤ ${loopMax} (≤ ${1 + MAX_ROUNDS}/trial)`,
        `  control     : one-shots until the loop's measured tokens are matched (no call cap; usually more calls than the loop)`,
        `  budget      : ${budget ? `${budget.amount}${budget.kind}` : "none"}${usdVoid ? ` — NOT enforceable: no dated price for "${model}"; use <n>tok` : ""}`,
        `  concurrency : ${concurrency} (the budget is checked at each brief's start; in-flight briefs finish)`,
        `  retries     : 429/5xx/network, exponential from ${DEFAULT_RETRY.baseMs} ms or retry-after, ≤ ${DEFAULT_RETRY.maxTotalWaitMs / 1000} s waiting per call`,
        `  writes      : ${out.json} (after every brief), then ${out.md}`,
        "",
        "Re-run with --yes (or set ARCHLANG_EVAL_CONFIRM=1) to authorise the calls.",
        "",
      ].join("\n"),
    );
    process.exit(3);
  }

  const ledger = new LiveLedger(model, budget);
  if (budget?.kind === "usd" && !ledger.priceKnown) {
    process.stderr.write(
      `⚠ --budget usd: no dated price for "${model}" — cost can't be enforced; tracking tokens only.\n`,
    );
  }
  const system = systemPrompt();
  const author = makeL2Author(provider, model, ledger);
  const meta: RunMeta = {
    provider,
    model,
    trials,
    briefs: entries.length,
    budget: budget ? `${budget.amount}${budget.kind}` : null,
    concurrency,
    argv,
    startedAt: new Date().toISOString(),
    endedAt: null,
    git: gitInfo(),
    sha256: { spec: sha256(readFileSync(resolve(ROOT, "spec.llm.md"))), systemPrompt: sha256(system) },
  };

  // Briefs keep their corpus order in the record whatever order they finish in.
  const slots: (BriefRecord | undefined)[] = new Array(entries.length);
  const done = (): BriefRecord[] => slots.filter((b): b is BriefRecord => b !== undefined);
  const jsonPath = resolve(ROOT, out.json);
  // Before the first call: a failure here costs nothing, so it fails loudly.
  writeJsonAtomic(jsonPath, buildRecord(meta, "running", done(), ledger));
  await pool(
    entries.map((_, i) => i),
    concurrency,
    async (i) => {
      slots[i] = await runBrief(entries[i] as CorpusEntry, author, ledger, { system, trials });
      writeProgress(() => writeJsonAtomic(jsonPath, buildRecord(meta, "running", done(), ledger)));
    },
  );
  meta.endedAt = new Date().toISOString();
  const briefs = done();
  // The final write is not swallowed: if it fails, the run fails loudly (exit 1).
  writeJsonAtomic(jsonPath, buildRecord(meta, "complete", briefs, ledger));

  const md =
    l2Header(out.json) +
    renderMd(briefs, toCells(briefs), {
      provider,
      model,
      trials,
      fingerprint: ledger.systemFingerprint,
      total: entries.length,
      stops: ledger.stops,
    });
  writeFileSync(resolve(ROOT, out.md), md);

  process.stdout.write(md + "\n");
  process.stdout.write(`✓ wrote ${out.json} + ${out.md} (git-ignored)\n`);
  process.stderr.write(`ledger: ${ledger.spentLabel()}${budget ? ` (limit ${budget.amount}${budget.kind})` : ""}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`✗ eval:l2 aborted: ${(err as Error)?.stack ?? String(err)}\n`);
    process.exit(1);
  });
}
