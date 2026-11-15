/**
 * The L2 live harness (`eval/l2-run.ts`), offline: the T3 bounds preflight, the provider adapters, retries, partial briefs, the JSON record and the scorecard (fetch mocked, no network, no key).
 *
 * The one ratified T3 run cannot be repeated, so these pin what it depends on: that only
 * `anthropic` with `claude-sonnet-5-5` or `claude-haiku-5-5` may run and an existing result
 * is never overwritten; the request shape (no temperature, no seed, no empty system block);
 * the usage accounting the equal-budget control is sized by; retries that honour
 * `retry-after` and stop at a bounded total; and a record that keeps every paid call.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFeedback, type ChatMsg, runLoopArm, type Usage } from "../eval/l2.js";
import {
  type BriefRecord,
  type CallMeta,
  CallFailed,
  EMPTY_REPLY_PLACEHOLDER,
  type LiveAuthor,
  PREREGISTRATION,
  type RetryPolicy,
  type RunMeta,
  T3_MODELS,
  anthropicRequest,
  buildRecord,
  makeAnthropicAuthor,
  makeL2Author,
  makeOpenAIAuthor,
  postWithRetry,
  preflight,
  renderMd,
  resultsPaths,
  retryAfterMs,
  runBrief,
  toCells,
  writeJsonAtomic,
  writeProgress,
} from "../eval/l2-run.js";
import { type CorpusEntry, LiveLedger, loadCorpus } from "../eval/run.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
/** A lint-clean plan (stops the loop after one call) and one with a lint warning. */
const CLEAN = read("eval/goldens/accessible-bath.arch");
const WARN = read("eval/faults/blocked-doorway.arch");
const fenced = (src: string): string => `\`\`\`arch\n${src}\n\`\`\``;
const entry = (prompt: string): CorpusEntry => ({ id: "t", prompt, golden: "", expect: {} });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type Call = { url: string; init: { headers: Record<string, string>; body: string } };
const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
/** A fetch stub answering from `replies` in order (a reply may throw, like a network error). */
function stubFetch(replies: (() => Response)[]): Call[] {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: Call["init"]) => {
      calls.push({ url, init });
      const r = replies[i++];
      if (!r) throw new Error("fetch stub exhausted");
      return r();
    }),
  );
  return calls;
}
const anthropicReply =
  (text: string, usage: Record<string, number>, stop = "end_turn") =>
  () =>
    ok({ content: [{ type: "text", text }], stop_reason: stop, usage });
/** A retry policy that records its waits instead of sleeping. */
function recordingPolicy(maxTotalWaitMs = 300_000): RetryPolicy & { waits: number[] } {
  const waits: number[] = [];
  return { baseMs: 2000, maxTotalWaitMs, sleep: async (ms) => void waits.push(ms), waits };
}

describe("preflight — the bounds of the one ratified T3 run", () => {
  /** Only the pre-registration exists: the state the run needs. */
  const none = (rel: string): boolean => rel === PREREGISTRATION;
  const env = (provider?: string, model?: string) => ({
    ARCHLANG_EVAL_PROVIDER: provider,
    ARCHLANG_EVAL_MODEL: model,
  });

  it("allows exactly anthropic with claude-sonnet-5-5 or claude-haiku-5-5", () => {
    expect(T3_MODELS).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    for (const model of T3_MODELS) {
      expect(preflight(env("anthropic", model), none)).toEqual({
        ok: true,
        provider: "anthropic",
        model,
        out: resultsPaths(model),
      });
    }
    expect(preflight(env(" Anthropic ", " claude-haiku-5-5 "), none).ok).toBe(true);
  });

  it("refuses an implicit or other provider", () => {
    for (const p of [undefined, "", "openai"]) {
      const r = preflight(env(p, "claude-sonnet-5-5"), none);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/ARCHLANG_EVAL_PROVIDER=anthropic/);
    }
  });

  it("refuses any model outside the allow-list", () => {
    for (const m of [undefined, "", "claude-opus-5-5", "claude-sonnet-5", "gpt-5.5-2026-04-23"]) {
      const r = preflight(env("anthropic", m), none);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/must be one of claude-sonnet-5-5, claude-haiku-5-5/);
    }
  });

  it("refuses to overwrite an existing results file, json or md", () => {
    const { json, md } = resultsPaths("claude-sonnet-5-5");
    for (const present of [[json], [md], [json, md]]) {
      const r = preflight(env("anthropic", "claude-sonnet-5-5"), (rel) => none(rel) || present.includes(rel));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toMatch(/never overwritten/);
        for (const p of present) expect(r.message).toContain(p);
      }
    }
    // The other model's file does not block this one.
    const haiku = resultsPaths("claude-haiku-5-5").json;
    expect(preflight(env("anthropic", "claude-sonnet-5-5"), (rel) => none(rel) || rel === haiku).ok).toBe(true);
  });

  it("refuses until the pre-registration exists (checked against a temp root)", () => {
    expect(PREREGISTRATION).toBe("eval/live-runs/2026-11-t3-preregistration.md");
    const root = mkdtempSync(join(tmpdir(), "l2-preflight-"));
    try {
      const inRoot = (rel: string): boolean => existsSync(join(root, rel));
      const before = preflight(env("anthropic", "claude-sonnet-5-5"), inRoot);
      expect(before.ok).toBe(false);
      if (!before.ok) expect(before.message).toContain(`${PREREGISTRATION} does not exist`);
      mkdirSync(join(root, "eval/live-runs"), { recursive: true });
      writeFileSync(join(root, PREREGISTRATION), "# pre-registration\n");
      expect(preflight(env("anthropic", "claude-sonnet-5-5"), inRoot).ok).toBe(true);
      // The provider and model are checked first: no pre-registration lets openai through.
      const r = preflight(env("openai", "gpt-5.5-2026-04-23"), inRoot);
      expect(r.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes one results pair per model", () => {
    expect(resultsPaths("claude-sonnet-5-5")).toEqual({
      md: "eval/results.l2.claude-sonnet-5-5.md",
      json: "eval/results.l2.claude-sonnet-5-5.json",
    });
    expect(resultsPaths("a/b c").md).toBe("eval/results.l2.a_b_c.md");
  });
});

describe("anthropicRequest — the Messages body", () => {
  it("lifts and caches the system turn, sends no temperature or seed, replaces an empty reply", () => {
    const req = anthropicRequest("claude-haiku-5-5", [
      { role: "system", content: "SPEC" },
      { role: "user", content: "BRIEF" },
      { role: "assistant", content: "  \n" },
      { role: "user", content: "FEEDBACK" },
    ]);
    expect(req).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 16384,
      system: [{ type: "text", text: "SPEC", cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: "BRIEF" },
        { role: "assistant", content: EMPTY_REPLY_PLACEHOLDER },
        { role: "user", content: "FEEDBACK" },
      ],
    });
    expect(req).not.toHaveProperty("temperature");
    expect(req).not.toHaveProperty("seed");
  });

  it("sends no system block when there is no system turn", () => {
    const req = anthropicRequest("claude-haiku-5-5", [{ role: "user", content: "BRIEF" }]);
    expect(req).not.toHaveProperty("system");
    expect(req.messages).toEqual([{ role: "user", content: "BRIEF" }]);
  });
});

describe("the Anthropic adapter", () => {
  it("counts the whole prompt as input, keeps the split, the raw text and the stop reason", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls = stubFetch([
      anthropicReply("```arch\nplan A\n```", {
        input_tokens: 40,
        cache_creation_input_tokens: 7000,
        cache_read_input_tokens: 0,
        output_tokens: 900,
      }),
      anthropicReply(
        "```arch\nplan B\n```",
        { input_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 7000, output_tokens: 800 },
        "max_tokens",
      ),
    ]);
    const ledger = new LiveLedger("claude-sonnet-5-5");
    const author = makeAnthropicAuthor("claude-sonnet-5-5", ledger);
    const msgs: ChatMsg[] = [
      { role: "system", content: "S" },
      { role: "user", content: "B" },
    ];
    const a = await author(msgs, 20260711);
    const b = await author(msgs, 20260712);
    expect(a.text).toBe("```arch\nplan A\n```");
    expect(a.usage).toEqual({ input: 7040, output: 900 });
    expect(a.call).toEqual({
      text: "```arch\nplan A\n```",
      stop: "end_turn",
      fresh: 40,
      cacheWrite: 7000,
      cacheRead: 0,
      output: 900,
      retries: [],
    });
    expect(b.usage).toEqual({ input: 7040, output: 800 });
    expect(b.call.stop).toBe("max_tokens");
    expect(ledger.calls).toBe(2);
    expect(ledger.totalTokens()).toBe(7040 + 900 + 7040 + 800);
    expect([...ledger.stops]).toEqual([
      ["end_turn", 1],
      ["max_tokens", 1],
    ]);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.init.headers["x-api-key"]).toBe("test-key");
    expect(calls[0]?.init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(calls[0]!.init.body)).not.toHaveProperty("seed");
  });

  it("drives a loop arm: the prior raw reply replays as an assistant turn", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const u = { input_tokens: 10, output_tokens: 20 };
    const calls = stubFetch([anthropicReply(fenced(WARN), u), anthropicReply(fenced(CLEAN), u)]);
    const author = makeAnthropicAuthor("claude-haiku-5-5", new LiveLedger("claude-haiku-5-5"));
    const res = await runLoopArm(entry("BRIEF"), author, { system: "SYS", seed: 1 });
    expect(res.rounds).toHaveLength(2);
    const second = JSON.parse(calls[1]!.init.body) as { system: { text: string }[]; messages: unknown[] };
    expect(second.system[0]?.text).toBe("SYS");
    expect(second.messages).toEqual([
      { role: "user", content: "BRIEF" },
      { role: "assistant", content: fenced(WARN) },
      { role: "user", content: buildFeedback(WARN.trim()) },
    ]);
  });

  it("throws CallFailed at once on a non-retryable 4xx, and refuses to start with no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls = stubFetch([() => new Response("bad request", { status: 400 })]);
    const author = makeAnthropicAuthor("claude-sonnet-5-5", new LiveLedger("claude-sonnet-5-5"), recordingPolicy());
    const err = await author([{ role: "user", content: "B" }], 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CallFailed);
    expect((err as CallFailed).message).toBe("Anthropic API 400: bad request");
    expect((err as CallFailed).retries).toEqual([]);
    expect(calls).toHaveLength(1);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => makeAnthropicAuthor("claude-haiku-5-5", new LiveLedger("claude-haiku-5-5"))).toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
  });
});

describe("postWithRetry — retry-after, exponential backoff, bounded total", () => {
  const init: RequestInit = { method: "POST", body: "{}" };

  it("retries a 429 for as long as retry-after asks, then a network error, and logs each", async () => {
    const policy = recordingPolicy();
    const calls = stubFetch([
      () => new Response("slow down", { status: 429, headers: { "retry-after": "7" } }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("overloaded", { status: 529 }),
      () => ok({ fine: true }),
    ]);
    const { res, retries } = await postWithRetry("Anthropic", "https://x.test", init, policy);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(4);
    // retry-after 7 s beats the 2 s step; then 4 s and 8 s.
    expect(policy.waits).toEqual([7000, 4000, 8000]);
    expect(retries).toEqual([
      { attempt: 1, status: 429, error: null, waitMs: 7000, retryAfterMs: 7000 },
      { attempt: 2, status: null, error: "fetch failed", waitMs: 4000, retryAfterMs: null },
      { attempt: 3, status: 529, error: null, waitMs: 8000, retryAfterMs: null },
    ]);
  });

  it("gives up once the next wait would pass the total cap, keeping the retries", async () => {
    const policy = recordingPolicy();
    stubFetch(Array.from({ length: 20 }, () => () => new Response("down", { status: 503 })));
    const err = await postWithRetry("Anthropic", "https://x.test", init, policy).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CallFailed);
    // 2+4+…+128 = 254 s; the next step (256 s) would pass 300 s.
    expect(policy.waits).toEqual([2000, 4000, 8000, 16000, 32000, 64000, 128000]);
    expect(policy.waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(300_000);
    expect((err as CallFailed).retries).toHaveLength(7);
    expect((err as CallFailed).message).toMatch(
      /^Anthropic API 503: down \(gave up after 7 retries, 254000 ms waited\)$/,
    );
  });

  it("gives up on network errors under the same cap, and a retry-after past the cap ends it at once", async () => {
    const policy = recordingPolicy(10_000);
    stubFetch(
      Array.from({ length: 10 }, () => () => {
        throw new TypeError("ECONNRESET");
      }),
    );
    const err = await postWithRetry("OpenAI", "https://x.test", init, policy).catch((e: unknown) => e);
    expect((err as CallFailed).message).toMatch(/^OpenAI API network error: ECONNRESET/);
    expect(policy.waits).toEqual([2000, 4000]); // the next, 8 s, would pass 10 s

    const p2 = recordingPolicy();
    stubFetch([() => new Response("later", { status: 429, headers: { "retry-after": "600" } })]);
    const e2 = await postWithRetry("Anthropic", "https://x.test", init, p2).catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(CallFailed);
    expect(p2.waits).toEqual([]);
  });

  it("reads retry-after as seconds or an HTTP date", () => {
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("1.5", 0)).toBe(1500);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 4000)).toBe(6000);
    expect(retryAfterMs("soon", 0)).toBeNull();
  });
});

describe("the OpenAI adapter (reference) and provider dispatch", () => {
  it("records finish_reason and the cached-prompt split", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    stubFetch([
      () =>
        ok({
          choices: [{ message: { content: "y" }, finish_reason: "length" }],
          usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 60 } },
          system_fingerprint: "fp_1",
        }),
    ]);
    const ledger = new LiveLedger("gpt-5.5-2026-04-23");
    const r = await makeOpenAIAuthor("gpt-5.5-2026-04-23", ledger)([], 1);
    expect(r.usage).toEqual({ input: 100, output: 5 });
    expect(r.call).toMatchObject({ text: "y", stop: "length", fresh: 40, cacheWrite: 0, cacheRead: 60, output: 5 });
    expect([...ledger.stops]).toEqual([["length", 1]]);
    expect(ledger.systemFingerprint).toBe("fp_1");
  });

  it("dispatches by provider", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    const calls = stubFetch([
      anthropicReply("x", { input_tokens: 1, output_tokens: 1 }),
      () => ok({ choices: [{ message: { content: "y" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    ]);
    await makeL2Author("anthropic", "claude-haiku-5-5", new LiveLedger("claude-haiku-5-5"))([], 1);
    await makeL2Author("openai", "gpt-5.5-2026-04-23", new LiveLedger("gpt-5.5-2026-04-23"))([], 1);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.anthropic.com/v1/messages",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });
});

/** A scripted live author: every call replies with a clean plan (so a trial is one loop call
 *  plus one control call), and call number `failAt` (1-based) fails for good. */
function scriptedAuthor(failAt: number): { author: LiveAuthor; count: () => number } {
  let n = 0;
  const author: LiveAuthor = async () => {
    n++;
    if (n === failAt) {
      throw new CallFailed("Anthropic API 503: down (gave up after 7 retries, 254000 ms waited)", [
        { attempt: 1, status: 503, error: null, waitMs: 2000, retryAfterMs: null },
      ]);
    }
    const text = fenced(CLEAN);
    const usage: Usage = { input: 10, output: 10 };
    const call: CallMeta = { text, stop: "end_turn", fresh: 4, cacheWrite: 0, cacheRead: 6, output: 10, retries: [] };
    return { text, usage, call };
  };
  return { author, count: () => n };
}

describe("runBrief — every paid call is kept", () => {
  const first = loadCorpus()[0] as CorpusEntry;
  const quiet = { log: () => {} };

  it("records each call by arm, index and seed on a complete brief", async () => {
    const { author } = scriptedAuthor(0);
    const b = await runBrief(first, author, new LiveLedger("claude-haiku-5-5"), { system: "S", trials: 2, ...quiet });
    expect(b.status).toBe("complete");
    expect(b.trials).toHaveLength(2);
    expect(b.trials[1]?.calls.map((c) => [c.arm, c.index, c.seed])).toEqual([
      ["loop", 0, 20261711],
      ["control", 0, 20261811],
    ]);
    expect(b.trials[0]?.calls[0]).toMatchObject({ text: fenced(CLEAN), stop: "end_turn", fresh: 4, cacheRead: 6 });
  });

  it("keeps the completed trials and the failed trial's calls when a later call fails", async () => {
    // Trials are 2 calls each: call 6 is trial 3's control call.
    const { author, count } = scriptedAuthor(6);
    const b = await runBrief(first, author, new LiveLedger("claude-haiku-5-5"), { system: "S", trials: 3, ...quiet });
    expect(count()).toBe(6);
    expect(b.status).toBe("partial");
    expect(b.trials.map((t) => t.trial)).toEqual([1, 2]);
    expect(b.failure?.trial).toBe(3);
    expect(b.failure?.message).toMatch(/503/);
    expect(b.failure?.retries).toHaveLength(1);
    expect(b.failure?.calls.map((c) => c.arm)).toEqual(["loop"]);
    // A partial brief is kept in the record but never enters the rates.
    expect(toCells([b])).toEqual([]);
  });

  it("skips a brief, with no call, once the budget breaker has tripped", async () => {
    const ledger = new LiveLedger("claude-haiku-5-5", { kind: "tok", amount: 1 });
    ledger.record({ input: 5, output: 5 });
    const { author, count } = scriptedAuthor(0);
    const b = await runBrief(first, author, ledger, { system: "S", trials: 3, ...quiet });
    expect(b).toEqual({ id: first.id, status: "skipped", trials: [] });
    expect(count()).toBe(0);
  });
});

describe("the record and the scorecard", () => {
  const first = loadCorpus()[0] as CorpusEntry;
  const meta: RunMeta = {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    trials: 2,
    briefs: 3,
    budget: "80usd",
    concurrency: 4,
    argv: ["--yes"],
    startedAt: "2026-11-16T00:00:00.000Z",
    endedAt: null,
    git: { head: "abc", dirty: false },
    sha256: { spec: "s1", systemPrompt: "s2" },
  };
  async function briefs(): Promise<{ list: BriefRecord[]; ledger: LiveLedger }> {
    const ledger = new LiveLedger("claude-sonnet-5-5");
    ledger.record({ input: 10, output: 20, cacheCreation: 30, cacheRead: 40, stop: "end_turn" });
    ledger.record({ input: 1, output: 2, stop: "max_tokens" });
    const quiet = { log: () => {} };
    const complete = await runBrief(first, scriptedAuthor(0).author, ledger, { system: "S", trials: 2, ...quiet });
    const partial = await runBrief({ ...first, id: "p" }, scriptedAuthor(3).author, ledger, {
      system: "S",
      trials: 2,
      ...quiet,
    });
    partial.failure!.message = "Anthropic API 400: a | b\nc \\| d \\ e";
    const skipped: BriefRecord = { id: "s", status: "skipped", trials: [] };
    return { list: [complete, partial, skipped], ledger };
  }

  it("carries the provenance, the counts and the ledger fields", async () => {
    const { list, ledger } = await briefs();
    const rec = buildRecord(meta, "running", list, ledger) as {
      meta: Record<string, unknown>;
      ledger: Record<string, unknown>;
      briefs: BriefRecord[];
      summary: { briefs: number };
    };
    expect(rec.meta).toMatchObject({
      mode: "live-l2",
      status: "running",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      startedAt: "2026-11-16T00:00:00.000Z",
      endedAt: null,
      git: { head: "abc", dirty: false },
      sha256: { spec: "s1", systemPrompt: "s2" },
      retry: { baseMs: 2000, maxTotalWaitMs: 300_000 },
      done: 3,
      complete: 1,
      partial: 1,
      skipped: 1,
    });
    expect(rec.ledger).toEqual({
      calls: ledger.calls,
      inputTokens: ledger.inputTokens,
      outputTokens: ledger.outputTokens,
      cacheCreationTokens: 30,
      cacheReadTokens: 40,
      totalTokens: ledger.totalTokens(),
      usd: ledger.usd(),
      stops: { end_turn: 1, max_tokens: 1 },
    });
    expect(rec.summary.briefs).toBe(1); // only the complete brief is in the rates
    expect(rec.briefs.map((b) => b.status)).toEqual(["complete", "partial", "skipped"]);
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec); // the record survives a JSON round trip
  });

  it("renders the stop reasons, the exclusions, partial rows and the raw verdict", async () => {
    const { list, ledger } = await briefs();
    const md = renderMd(list, toCells(list), {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      trials: 2,
      total: 3,
      stops: ledger.stops,
    });
    expect(md).toContain("Mode: **live L2** · anthropic · model claude-sonnet-5-5 · 2 trial(s) · 1 brief(s)");
    expect(md).toContain("labels only: the Anthropic API takes no seed");
    expect(md).toContain("Stop reasons: end_turn 1 · max_tokens 1. Truncated replies (`max_tokens`/`length`): 1/2.");
    expect(md).toContain(
      "> 1 skipped by the `--budget` breaker; 1 partial after a failed call of 3 brief(s) (excluded from the rates below).",
    );
    expect(md).toContain("**Verdict (harness arithmetic, not the pre-registered rule):** The loop does not beat");
    expect(md).toContain("| `s` | — | ⏭️ skipped (budget) | — |");
    expect(md).toContain("(partial brief: excluded)");
    // A failure message with a pipe, a newline and backslashes stays inside its table cell:
    // a backslash is escaped too, so a written `\|` cannot turn into an escaped pipe that ends
    // the escaping early (the raw text is `a | b⏎c \| d \ e`).
    expect(md).toContain(
      "| `p` | 2 | ✗ partial — Anthropic API 400: a \\| b c \\\\\\| d \\\\ e (excluded from the rates) | — |",
    );
  });

  it("prints no verdict sentence when no brief completed", async () => {
    const { list, ledger } = await briefs();
    const incomplete = list.filter((b) => b.status !== "complete");
    const md = renderMd(incomplete, toCells(incomplete), {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      trials: 2,
      total: 3,
      stops: ledger.stops,
    });
    expect(md).toContain(
      "**Verdict (harness arithmetic, not the pre-registered rule):** no complete briefs — no verdict",
    );
    expect(md).not.toMatch(/The loop (beats|does not beat)/);
  });
});

describe("writing the record", () => {
  it("writes atomically, leaving no temporary file, and the direct write fails loudly", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-record-"));
    try {
      const path = join(root, "results.l2.x.json");
      writeJsonAtomic(path, { a: 1 });
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ a: 1 });
      expect(existsSync(`${path}.tmp`)).toBe(false);
      // The first and the final write call this directly: a failure throws.
      expect(() => writeJsonAtomic(join(root, "missing-dir", "r.json"), {})).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("logs and swallows a failed per-brief write (EPERM from a locking reader on Windows)", () => {
    const lines: string[] = [];
    const eperm = Object.assign(new Error("EPERM: operation not permitted, rename 'r.json.tmp' -> 'r.json'"), {
      code: "EPERM",
    });
    const wrote = writeProgress(
      () => {
        throw eperm;
      },
      (l) => lines.push(l),
    );
    expect(wrote).toBe(false);
    expect(lines).toEqual([
      "⚠ eval:l2: progress write failed (EPERM: operation not permitted, rename 'r.json.tmp' -> 'r.json'); the next brief's write supersedes it\n",
    ]);
    expect(
      writeProgress(
        () => {},
        (l) => lines.push(l),
      ),
    ).toBe(true);
    expect(lines).toHaveLength(1);
  });
});
