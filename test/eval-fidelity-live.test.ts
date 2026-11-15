/**
 * The fidelity slice's live path (`eval/fidelity-live.ts`), offline: fetch is mocked, no key, no
 * network. Pins the request shape (the unchanged fidelity prompt and the brief verbatim), the
 * scoring wiring (each brief's committed correct reply scores 1 through the live path and its
 * laundered counter-example scores 0 with the moved requirement named), the guards (`--yes`, a
 * bad flag, the budget breaker, a failed call) and that a result is never overwritten.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRIALS,
  MAX_OUTPUT_TOKENS,
  SEED_BASE,
  type TrialRecord,
  estimateRun,
  liveResultsPaths,
  main,
  outcomeOf,
  parseArgs,
  rateLabel,
  renderLiveResults,
  runFidelityLive,
  summarizeLive,
} from "../eval/fidelity-live.js";
import {
  FIDELITY_VERSION,
  type FidelityEntry,
  fidelitySystemPrompt,
  loadFidelityCorpus,
  readReference,
} from "../eval/fidelity.js";
import { type RetryPolicy, makeL2Author } from "../eval/l2-run.js";
import { LiveLedger } from "../eval/run.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = loadFidelityCorpus();
const MODEL = "claude-haiku-5-5";

/** A reference reply as a model would send it: a fenced block. */
function fencedReply(path: string): string {
  const raw = readReference(path).trim();
  return path.endsWith(".json") ? `\`\`\`infeasible\n${raw}\n\`\`\`` : `\`\`\`arch\n${raw}\n\`\`\``;
}
const correctReply = (e: FidelityEntry): string => fencedReply(e.references.correct);
const launderedReply = (e: FidelityEntry): string => fencedReply(e.references.laundered);

type Call = { url: string; body: Record<string, unknown> };
const usage = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 };
const anthropicOk = (text: string, stop = "end_turn"): Response =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: stop, usage }), { status: 200 });

/** A fetch stub that answers each request by the brief in its user turn. */
function stubFetch(answer: (entry: FidelityEntry, n: number) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      const messages = body.messages as { role: string; content: string }[];
      const user = messages.filter((m) => m.role === "user").at(-1)?.content;
      const entry = entries.find((e) => e.prompt === user);
      if (!entry) throw new Error("fetch stub: unknown brief");
      return answer(entry, calls.length);
    }),
  );
  return calls;
}

/** A retry policy that never sleeps. */
const noSleep: RetryPolicy = { baseMs: 1, maxTotalWaitMs: 0, sleep: async () => {} };

function anthropicEnv(): void {
  vi.stubEnv("ARCHLANG_EVAL_PROVIDER", "anthropic");
  vi.stubEnv("ARCHLANG_EVAL_MODEL", MODEL);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the corpus the live path runs over", () => {
  it("has satisfiable and infeasible briefs, and the ruler did not move", () => {
    expect(FIDELITY_VERSION).toBe("1");
    expect(entries.some((e) => e.infeasible === undefined)).toBe(true);
    expect(entries.some((e) => e.infeasible !== undefined)).toBe(true);
  });
});

describe("request shape", () => {
  it("anthropic: the fidelity system prompt (cached), the brief verbatim, no temperature, the 16384 cap", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    const ledger = new LiveLedger(MODEL);
    const author = makeL2Author("anthropic", MODEL, ledger, noSleep);
    const system = fidelitySystemPrompt();
    await runFidelityLive([entries[0]!], author, ledger, { system, trials: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.body).toEqual({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: entries[0]!.prompt }],
    });
  });

  it("openai: system + user turns and the trial's seed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: correctReply(entries[0]!) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 6 },
          }),
          { status: 200 },
        );
      }),
    );
    const ledger = new LiveLedger("gpt-5.5-2026-04-23");
    const author = makeL2Author("openai", "gpt-5.5-2026-04-23", ledger, noSleep);
    await runFidelityLive([entries[0]!], author, ledger, { system: fidelitySystemPrompt(), trials: 2 });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
    ]);
    expect(calls.map((c) => c.body.seed)).toEqual([SEED_BASE, SEED_BASE + 1]);
    expect(calls[0]!.body.messages).toEqual([
      { role: "system", content: fidelitySystemPrompt() },
      { role: "user", content: entries[0]!.prompt },
    ]);
    expect(calls[0]!.body.temperature).toBeUndefined();
  });
});

describe("scoring wiring — the live path scores with the offline measure", () => {
  async function runWith(reply: (e: FidelityEntry) => string): Promise<TrialRecord[]> {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubFetch((e) => anthropicOk(reply(e)));
    const ledger = new LiveLedger(MODEL);
    return runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
      system: fidelitySystemPrompt(),
      trials: 1,
    });
  }

  it("a scripted correct reply scores 1 on every brief (honoured or declared)", async () => {
    const records = await runWith(correctReply);
    expect(records.map((r) => [r.brief, r.status, r.score?.score])).toEqual(entries.map((e) => [e.id, "scored", 1]));
    for (const r of records) {
      const e = entries.find((x) => x.id === r.brief)!;
      expect(outcomeOf(r.score!)).toBe(e.infeasible === undefined ? "honoured" : "declared");
      expect(r.call?.text).toBe(correctReply(e));
    }
  });

  it("the scripted laundered counter-example scores 0 and names the moved requirement", async () => {
    const records = await runWith(launderedReply);
    for (const r of records) {
      const e = entries.find((x) => x.id === r.brief)!;
      expect(r.score?.score).toBe(0);
      expect(r.score?.laundered).toBe(true);
      expect(outcomeOf(r.score!)).toBe("laundered");
      for (const id of e.references.launderedDrift) expect(r.score?.drifted).toContain(id);
    }
    const s = summarizeLive(records);
    expect(s.laundered).toEqual({ k: entries.length, n: entries.length });
    expect(s.fidelity).toEqual({ k: 0, n: entries.length });
    const md = renderLiveResults(entries, records, { provider: "anthropic", model: MODEL, trials: 1 });
    for (const e of entries) {
      for (const id of e.references.launderedDrift) {
        expect(md).toMatch(new RegExp(`\`${e.id}\` trial 1 — laundering[^\\n]*${id}`));
      }
    }
  });

  it("a refusal of a satisfiable brief and a malformed reply score 0, never laundered", async () => {
    const feasible = entries.find((e) => e.infeasible === undefined)!;
    const infeasible = entries.find((e) => e.infeasible !== undefined)!;
    const records = await runWith((e) =>
      e === feasible ? fencedReply(infeasible.references.correct) : "```infeasible\nnot json\n```",
    );
    const byId = new Map(records.map((r) => [r.brief, r.score!]));
    expect(outcomeOf(byId.get(feasible.id)!)).toBe("false-refusal");
    expect(outcomeOf(byId.get(infeasible.id)!)).toBe("malformed");
    expect(records.every((r) => r.score?.score === 0 && r.score.laundered === false)).toBe(true);
  });
});

describe("runFidelityLive — breaker, failures, order", () => {
  it("runs trial-major and calls onTrial after every trial", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubFetch((e) => anthropicOk(correctReply(e)));
    const ledger = new LiveLedger(MODEL);
    const seen: number[] = [];
    const records = await runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
      system: fidelitySystemPrompt(),
      trials: 2,
      onTrial: (rs) => seen.push(rs.length),
    });
    expect(records.map((r) => `${r.trial}:${r.brief}`)).toEqual([
      ...entries.map((e) => `1:${e.id}`),
      ...entries.map((e) => `2:${e.id}`),
    ]);
    expect(seen).toEqual(records.map((_, i) => i + 1));
    expect(ledger.calls).toBe(entries.length * 2);
  });

  it("the budget breaker skips every call once usage reaches the limit; skips enter no rate", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    const ledger = new LiveLedger(MODEL, { kind: "tok", amount: 1 });
    const records = await runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
      system: fidelitySystemPrompt(),
      trials: 1,
    });
    expect(calls).toHaveLength(1);
    expect(records.map((r) => r.status)).toEqual(["scored", ...entries.slice(1).map(() => "skipped")]);
    const s = summarizeLive(records);
    expect([s.scored, s.skipped, s.fidelity.n]).toEqual([1, entries.length - 1, 1]);
  });

  it("a failed call is recorded with its error and excluded from the rates", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubFetch((e, n) => (n === 1 ? new Response("bad request", { status: 400 }) : anthropicOk(correctReply(e))));
    const ledger = new LiveLedger(MODEL);
    const records = await runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
      system: fidelitySystemPrompt(),
      trials: 1,
    });
    expect(records[0]).toMatchObject({ status: "failed", retries: [] });
    expect(records[0]!.error).toMatch(/Anthropic API 400: bad request/);
    const s = summarizeLive(records);
    expect([s.failed, s.scored, s.fidelity.k]).toEqual([1, entries.length - 1, entries.length - 1]);
  });
});

describe("flags and labels", () => {
  it("parseArgs: --trials defaults to 5, takes a positive integer, and nothing unknown passes", () => {
    expect(DEFAULT_TRIALS).toBe(5);
    expect(parseArgs([])).toEqual({ yes: false, trials: 5 });
    expect(parseArgs(["--yes", "--trials", "3", "--budget", "2usd"])).toEqual({ yes: true, trials: 3 });
    for (const bad of [["--trials"], ["--trials", "0"], ["--trials", "1.5"], ["--live"], ["--max", "2"]]) {
      expect("error" in parseArgs(bad)).toBe(true);
    }
  });

  it("rateLabel prints k/n with an outward-rounded Wilson interval", () => {
    expect(rateLabel({ k: 0, n: 0 })).toBe("0/0 (—)");
    expect(rateLabel({ k: 30, n: 30 })).toMatch(/^30\/30 \(100 %; Wilson 95 % 88–100 %\)$/);
    expect(rateLabel({ k: 0, n: 30 })).toMatch(/^0\/30 \(0 %; Wilson 95 % 0–12 %\)$/);
  });

  it("estimateRun counts briefs × trials calls and a worst-case output", () => {
    const est = estimateRun(entries, fidelitySystemPrompt(), 5, MODEL);
    expect(est.calls).toBe(entries.length * 5);
    expect(est.maxOutputTokens).toBe(entries.length * 5 * MAX_OUTPUT_TOKENS);
    expect(est.maxUsd).not.toBeNull();
    expect(estimateRun(entries, "", 1, "unpriced-model").maxUsd).toBeNull();
  });

  it("results paths are per model and git-ignored", () => {
    expect(liveResultsPaths("claude-haiku-5-5")).toEqual({
      md: "eval/results.fidelity-live.claude-haiku-5-5.md",
      json: "eval/results.fidelity-live.claude-haiku-5-5.json",
    });
    expect(liveResultsPaths("a/b:c").json).toBe("eval/results.fidelity-live.a_b_c.json");
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    for (const p of ["eval/results.fidelity-live.*.md", "eval/results.fidelity-live.*.json"]) {
      expect(ignore.split(/\r?\n/)).toContain(p);
    }
  });
});

describe("main — guards and the record (temporary root)", () => {
  let root: string;
  const log: string[] = [];
  const io = () => ({
    root,
    out: (s: string) => void log.push(s),
    err: (s: string) => void log.push(s),
    retry: noSleep,
  });
  const paths = liveResultsPaths(MODEL);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fidelity-live-"));
    mkdirSync(join(root, "eval"));
    log.length = 0;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("without --yes prints the plan and exits 3 without any call or write", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    expect(await main([], io())).toBe(3);
    expect(calls).toHaveLength(0);
    const text = log.join("");
    expect(text).toMatch(/Nothing was sent/);
    expect(text).toContain(`calls    : ${entries.length * DEFAULT_TRIALS}`);
    expect(text).toContain(`model    : ${MODEL}`);
    expect(existsSync(join(root, paths.json))).toBe(false);
  });

  it("a bad flag exits 3 without any call", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    expect(await main(["--yes", "--trials", "zero"], io())).toBe(3);
    expect(await main(["--yes", "--live"], io())).toBe(3);
    expect(calls).toHaveLength(0);
  });

  it("refuses to overwrite an existing result, json or md, with or without --yes", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    for (const p of [paths.json, paths.md]) {
      writeFileSync(join(root, p), "prior");
      for (const argv of [[], ["--yes"]]) {
        log.length = 0;
        expect(await main(argv, io())).toBe(3);
        expect(log.join("")).toMatch(/never overwritten/);
      }
      expect(readFileSync(join(root, p), "utf8")).toBe("prior");
      rmSync(join(root, p));
    }
    expect(calls).toHaveLength(0);
  });

  it("a confirmed run writes the record and the scorecard, then refuses a second run", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    expect(await main(["--yes", "--trials", "2"], io())).toBe(0);
    expect(calls).toHaveLength(entries.length * 2);
    const record = JSON.parse(readFileSync(join(root, paths.json), "utf8")) as {
      meta: Record<string, unknown>;
      summary: { fidelity: { k: number; n: number }; stops: Record<string, number> };
      trials: TrialRecord[];
      ledger: { calls: number };
    };
    expect(record.meta).toMatchObject({
      mode: "live-fidelity",
      status: "complete",
      provider: "anthropic",
      model: MODEL,
      trials: 2,
      fidelityVersion: FIDELITY_VERSION,
    });
    expect(record.summary.fidelity).toEqual({ k: entries.length * 2, n: entries.length * 2 });
    expect(record.summary.stops).toEqual({ end_turn: entries.length * 2 });
    expect(record.ledger.calls).toBe(entries.length * 2);
    expect(record.trials[0]!.call).toMatchObject({
      text: correctReply(entries[0]!),
      stop: "end_turn",
      fresh: 10,
      output: 20,
      cacheWrite: 30,
      cacheRead: 40,
    });
    const md = readFileSync(join(root, paths.md), "utf8");
    expect(md).toContain(`- **Fidelity (score 1):** ${rateLabel({ k: entries.length * 2, n: entries.length * 2 })}`);
    expect(md).toMatch(/never compared/);
    for (const e of entries) expect(md).toContain(`| \`${e.id}\` |`);

    log.length = 0;
    expect(await main(["--yes"], io())).toBe(3);
    expect(log.join("")).toMatch(/never overwritten/);
    expect(calls).toHaveLength(entries.length * 2);
  });

  it("the record is written before the first call and after every call", async () => {
    anthropicEnv();
    const statuses: string[] = [];
    stubFetch((e) => {
      const rec = JSON.parse(readFileSync(join(root, paths.json), "utf8")) as {
        meta: { status: string; done: number };
      };
      statuses.push(`${rec.meta.status}:${rec.meta.done}`);
      return anthropicOk(correctReply(e));
    });
    expect(await main(["--yes", "--trials", "1"], io())).toBe(0);
    expect(statuses).toEqual(entries.map((_, i) => `running:${i}`));
  });
});
