/**
 * The fidelity slice's live path (`eval/fidelity-live.ts`), offline: fetch is mocked, no key, no
 * network. Pins the request shape (the unchanged fidelity prompt and the brief verbatim, the shared
 * output cap), the scoring wiring (each brief's committed correct reply scores 1 through the live
 * path and its laundered counter-example scores 0 with the moved requirement named), the live
 * reading of a zero (a reply that is not a compiling plan is never a laundering), the guards
 * (`--yes`, `--budget`, bad or repeated flags, the breaker, failed calls, the abort) and that a
 * result is never overwritten.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRIALS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_TRIALS,
  SEED_BASE,
  type TrialRecord,
  estimateRun,
  liveResultsPaths,
  main,
  outcomeOf,
  parseArgs,
  planCompiled,
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
  parseFidelityReply,
  readReference,
  scoreReply,
} from "../eval/fidelity.js";
import { MAX_OUTPUT_TOKENS, type RetryPolicy, makeL2Author } from "../eval/live-author.js";
import { LiveLedger } from "../eval/run.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = loadFidelityCorpus();
const MODEL = "claude-haiku-5-5";
const feasible = entries.filter((e) => e.infeasible === undefined);
const infeasible = entries.filter((e) => e.infeasible !== undefined);

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

/** A retry policy that never sleeps (and never retries: the tests answer 200 or a 400). */
const noSleep: RetryPolicy = { baseMs: 1, maxTotalWaitMs: 0, sleep: async () => {} };

function anthropicEnv(): void {
  vi.stubEnv("ARCHLANG_EVAL_PROVIDER", "anthropic");
  vi.stubEnv("ARCHLANG_EVAL_MODEL", MODEL);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
}

/** Run every brief once against scripted replies. */
async function runWith(reply: (e: FidelityEntry) => string, trials = 1) {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  stubFetch((e) => anthropicOk(reply(e)));
  const ledger = new LiveLedger(MODEL);
  return runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
    system: fidelitySystemPrompt(),
    trials,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the corpus the live path runs over", () => {
  it("has satisfiable and infeasible briefs, and the ruler did not move", () => {
    expect(FIDELITY_VERSION).toBe("1");
    expect(feasible.length).toBeGreaterThan(0);
    expect(infeasible.length).toBeGreaterThan(0);
  });
});

describe("request shape", () => {
  it("anthropic: the fidelity system prompt (cached), the brief verbatim, no temperature, the shared cap", async () => {
    expect(MAX_OUTPUT_TOKENS).toBe(16384);
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

  it("openai: system + user turns, the trial's seed, the shared cap, no temperature", async () => {
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
    expect(calls[0]!.body).toEqual({
      model: "gpt-5.5-2026-04-23",
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      seed: SEED_BASE,
      messages: [
        { role: "system", content: fidelitySystemPrompt() },
        { role: "user", content: entries[0]!.prompt },
      ],
    });
    expect(calls[1]!.body.seed).toBe(SEED_BASE + 1);
  });

  it("the key message names no single harness", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const ledger = new LiveLedger(MODEL);
    expect(() => makeL2Author("anthropic", MODEL, ledger)).toThrow(
      "ANTHROPIC_API_KEY is not set (required for a live eval with the anthropic provider)",
    );
    expect(() => makeL2Author("openai", MODEL, ledger)).toThrow(
      "OPENAI_API_KEY is not set (required for a live eval with the openai provider)",
    );
  });
});

describe("scoring wiring — the live path scores with the offline measure", () => {
  it("a scripted correct reply scores 1 on every brief (honoured or declared)", async () => {
    const { records, aborted } = await runWith(correctReply);
    expect(aborted).toBe(false);
    expect(records.map((r) => [r.brief, r.status, r.score?.score])).toEqual(entries.map((e) => [e.id, "scored", 1]));
    for (const r of records) {
      const e = entries.find((x) => x.id === r.brief)!;
      expect(r.outcome).toBe(e.infeasible === undefined ? "honoured" : "declared");
      expect(r.compiled).toBe(e.infeasible === undefined ? true : null);
      expect(r.call?.text).toBe(correctReply(e));
    }
  });

  it("the scripted laundered counter-example scores 0, compiles, and names exactly the moved requirement", async () => {
    const { records } = await runWith(launderedReply);
    for (const r of records) {
      const e = entries.find((x) => x.id === r.brief)!;
      expect(r.score?.score).toBe(0);
      expect(r.score?.laundered).toBe(true);
      expect(r.compiled).toBe(true);
      expect(r.outcome).toBe("laundered");
      expect(r.score?.drifted).toEqual(e.references.launderedDrift);
    }
    const s = summarizeLive(records);
    expect(s.laundered).toEqual({ k: entries.length, n: entries.length });
    expect(s.noPlanInfeasible).toEqual({ k: 0, n: infeasible.length });
    expect(s.fidelity).toEqual({ k: 0, n: entries.length });
    const md = renderLiveResults(entries, records, { provider: "anthropic", model: MODEL, trials: 1 });
    for (const e of entries) {
      const line = md.split("\n").find((l) => l.startsWith(`- \`${e.id}\` trial 1 — laundering`));
      expect(line).toBeDefined();
      for (const id of e.references.launderedDrift) expect(line).toContain(id);
    }
  });

  it("a false refusal, a wrong conflict set, a malformed fence and a non-compiling plan each score 0, never laundered", async () => {
    const f = feasible[0]!;
    const g = feasible[1]!;
    const i = infeasible[0]!;
    const j = infeasible[1]!;
    const replies = new Map<string, string>([
      [f.id, fencedReply(i.references.correct)], // refuses a satisfiable brief
      [g.id, "```arch\nthis is not ArchLang\n```"], // a plan that does not compile
      [i.id, '```infeasible\n{"infeasible": true, "conflicts": ["R1"], "reason": "too small"}\n```'], // wrong set
      [j.id, "```infeasible\nnot json\n```"], // malformed
    ]);
    const { records } = await runWith((e) => replies.get(e.id) ?? correctReply(e));
    const byId = new Map(records.map((r) => [r.brief, r]));
    expect(i.infeasible?.conflicts).not.toEqual(["R1"]);
    expect([f, g, i, j].map((e) => byId.get(e.id)?.outcome)).toEqual([
      "false-refusal",
      "not-compiled",
      "wrong-conflict",
      "malformed",
    ]);
    for (const e of [f, g, i, j]) expect(byId.get(e.id)?.score?.score).toBe(0);
    expect(byId.get(g.id)?.compiled).toBe(false);
    const s = summarizeLive(records);
    expect(s.laundered.k).toBe(0);
    expect(s.outcomes).toMatchObject({ "false-refusal": 1, "not-compiled": 1, "wrong-conflict": 1, malformed: 1 });
    const md = renderLiveResults(entries, records, { provider: "anthropic", model: MODEL, trials: 1 });
    expect(md).toContain("## Launderings\n\nNone.");
  });
});

describe("an infeasible brief: a reply that is not a compiling plan is a format failure, not a laundering", () => {
  const e = infeasible[0]!;
  const conflicts = JSON.stringify(e.infeasible?.conflicts);
  const probes: Record<string, string> = {
    "prose refusal": `This brief cannot be satisfied: ${e.infeasible?.conflicts.join(" and ")} conflict, so I will not draw a plan.`,
    "json fence": `\`\`\`json\n{ "infeasible": true, "conflicts": ${conflicts}, "reason": "over capacity" }\n\`\`\``,
    "bare JSON": `{ "infeasible": true, "conflicts": ${conflicts}, "reason": "over capacity" }`,
    "truncated fence": `\`\`\`infeasible\n{ "infeasible": true, "conflicts": ${conflicts.slice(0, 5)}`,
    "non-compiling arch": '```arch\nplan "Flat" {\n  room "Living" at (0, 0\n```',
  };

  for (const [shape, text] of Object.entries(probes)) {
    it(`${shape}: the ruler's 0 stands; the live outcome is not-compiled and nothing is listed as moved`, () => {
      const score = scoreReply(e, parseFidelityReply(text));
      // The ruler, unchanged: the reply is read as plan source, scores 0 and is marked laundered.
      expect(score.score).toBe(0);
      expect(score.replyKind).toBe("plan");
      const compiled = planCompiled(text);
      expect(compiled).toBe(false);
      expect(outcomeOf(score, compiled)).toBe("not-compiled");
    });
  }

  it("rendered: counted under no plan / wrong format, absent from the launderings", () => {
    const records = Object.values(probes).map((text, n): TrialRecord => {
      const score = scoreReply(e, parseFidelityReply(text));
      const compiled = planCompiled(text);
      return {
        brief: e.id,
        trial: n + 1,
        seed: SEED_BASE + n,
        status: "scored",
        call: { text, stop: "end_turn", fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0, retries: [] },
        score,
        compiled,
        outcome: outcomeOf(score, compiled),
      };
    });
    const s = summarizeLive(records);
    const n = Object.keys(probes).length;
    expect(s.noPlanInfeasible).toEqual({ k: n, n });
    expect(s.launderedInfeasible).toEqual({ k: 0, n });
    const md = renderLiveResults([e], records, { provider: "anthropic", model: MODEL, trials: n });
    expect(md).toContain(
      `- **Infeasible briefs, no plan / wrong format (malformed or not-compiled):** ${rateLabel({ k: n, n })}`,
    );
    expect(md).toContain("## Launderings\n\nNone.");
    expect(md).toContain(`| \`${e.id}\` | **no** | ${rateLabel({ k: 0, n })} | 0 | not-compiled ${n} | — |`);
  });
});

describe("runFidelityLive — breaker, failures, order, abort", () => {
  it("runs trial-major and calls onTrial after every trial", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubFetch((e) => anthropicOk(correctReply(e)));
    const ledger = new LiveLedger(MODEL);
    const seen: number[] = [];
    const { records } = await runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
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

  it("a failed call is recorded with its error, excluded from the rates, and rendered as unscored", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    stubFetch((e, n) => (n === 1 ? new Response("bad request", { status: 400 }) : anthropicOk(correctReply(e))));
    const ledger = new LiveLedger(MODEL, { kind: "tok", amount: 300 });
    const { records } = await runFidelityLive(entries, makeL2Author("anthropic", MODEL, ledger, noSleep), ledger, {
      system: fidelitySystemPrompt(),
      trials: 1,
    });
    // Call 1 fails (no usage), calls 2–4 spend 100 tok each, so the breaker trips after call 4.
    expect(records.map((r) => r.status)).toEqual(["failed", "scored", "scored", "scored", "skipped", "skipped"]);
    expect(records[0]).toMatchObject({ status: "failed", retries: [] });
    expect(records[0]!.error).toMatch(/Anthropic API 400: bad request/);
    const s = summarizeLive(records);
    expect([s.failed, s.skipped, s.scored, s.fidelity.k]).toEqual([1, 2, 3, 3]);
    const md = renderLiveResults(entries, records, { provider: "anthropic", model: MODEL, trials: 1 });
    expect(md).toContain("## Unscored trials");
    expect(md).toContain(`- \`${entries[0]!.id}\` trial 1 — failed: Anthropic API 400: bad request`);
    expect(md).toContain(`- \`${entries[4]!.id}\` trial 1 — skipped`);
  });

  it(`stops after ${MAX_CONSECUTIVE_FAILURES} failed calls in a row`, async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const calls = stubFetch(() => new Response("overloaded?", { status: 400 }));
    const ledger = new LiveLedger(MODEL);
    const { records, aborted } = await runFidelityLive(
      entries,
      makeL2Author("anthropic", MODEL, ledger, noSleep),
      ledger,
      { system: fidelitySystemPrompt(), trials: 3 },
    );
    expect(aborted).toBe(true);
    expect(calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(records.map((r) => r.status)).toEqual(Array(MAX_CONSECUTIVE_FAILURES).fill("failed"));
  });

  it("a success resets the failure count", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // Every 4th call succeeds: never 5 failures in a row.
    stubFetch((e, n) => (n % 4 === 0 ? anthropicOk(correctReply(e)) : new Response("no", { status: 400 })));
    const ledger = new LiveLedger(MODEL);
    const { records, aborted } = await runFidelityLive(
      entries,
      makeL2Author("anthropic", MODEL, ledger, noSleep),
      ledger,
      { system: fidelitySystemPrompt(), trials: 2 },
    );
    expect(aborted).toBe(false);
    expect(records).toHaveLength(entries.length * 2);
  });
});

describe("flags and labels", () => {
  it("parseArgs: defaults, --trials 1 to 20, --budget with a unit, nothing unknown or repeated", () => {
    expect(DEFAULT_TRIALS).toBe(5);
    expect(MAX_TRIALS).toBe(20);
    expect(parseArgs([])).toEqual({ yes: false, trials: 5, budget: undefined });
    expect(parseArgs(["--yes", "--trials", "20", "--budget", "2.5usd"])).toEqual({
      yes: true,
      trials: 20,
      budget: { kind: "usd", amount: 2.5 },
    });
    expect(parseArgs(["--budget", "500000tok"])).toMatchObject({ budget: { kind: "tok", amount: 500000 } });
    const bad = [
      ["--trials"],
      ["--trials", "0"],
      ["--trials", "1.5"],
      ["--trials", "21"],
      ["--budget"],
      ["--budget", "5"],
      ["--budget", "0usd"],
      ["--budget", "-1tok"],
      ["--budget", "1usd", "--budget", "2usd"],
      ["--trials", "2", "--trials", "3"],
      ["--live"],
      ["--max", "2"],
    ];
    for (const argv of bad) expect("error" in parseArgs(argv), argv.join(" ")).toBe(true);
  });

  it("rateLabel prints k/n with an outward-rounded Wilson interval", () => {
    expect(rateLabel({ k: 0, n: 0 })).toBe("0/0 (—)");
    expect(rateLabel({ k: 30, n: 30 })).toBe("30/30 (100 %; Wilson 95 % 88–100 %)");
    expect(rateLabel({ k: 0, n: 30 })).toBe("0/30 (0 %; Wilson 95 % 0–12 %)");
  });

  it("estimateRun counts briefs × trials calls and a worst-case output", () => {
    const est = estimateRun(entries, fidelitySystemPrompt(), 5, MODEL);
    expect(est.calls).toBe(entries.length * 5);
    expect(est.maxOutputTokens).toBe(entries.length * 5 * MAX_OUTPUT_TOKENS);
    expect(est.worstUsd).not.toBeNull();
    expect(estimateRun(entries, "", 1, "unpriced-model").worstUsd).toBeNull();
  });

  it("results paths are per model and git-ignored", () => {
    expect(liveResultsPaths("claude-haiku-5-5")).toEqual({
      md: "eval/results.fidelity-live.claude-haiku-5-5.md",
      json: "eval/results.fidelity-live.claude-haiku-5-5.json",
    });
    expect(liveResultsPaths("a/b:c").json).toBe("eval/results.fidelity-live.a_b_c.json");
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8").split(/\r?\n/);
    for (const p of ["eval/results.fidelity-live.*.md", "eval/results.fidelity-live.*.json"]) {
      expect(ignore).toContain(p);
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
  type RecordJson = {
    meta: Record<string, unknown>;
    summary: { fidelity: { k: number; n: number }; stops: Record<string, number> };
    trials: TrialRecord[];
    ledger: { calls: number };
  };
  const record = (): RecordJson => JSON.parse(readFileSync(join(root, paths.json), "utf8")) as RecordJson;

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
    expect(text).toMatch(/estimate : ≈ \d+ prompt tok/);
    expect(text).not.toMatch(/estimate :[^\n]*≤/);
    expect(text).toContain("none — required with --yes");
    expect(existsSync(join(root, paths.json))).toBe(false);
  });

  it("--yes without --budget, a bad --budget, a repeated flag and a bad --trials each exit 3 without any call", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    for (const argv of [
      ["--yes"],
      ["--yes", "--budget", "lots"],
      ["--yes", "--budget", "1usd", "--budget", "9usd"],
      ["--yes", "--budget", "1usd", "--trials", "21"],
      ["--yes", "--budget", "1usd", "--live"],
    ]) {
      log.length = 0;
      expect(await main(argv, io()), argv.join(" ")).toBe(3);
      expect(log.join("")).toMatch(/Nothing was sent/);
    }
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, paths.json))).toBe(false);
  });

  it("refuses to overwrite an existing result, json or md, with or without --yes", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    for (const p of [paths.json, paths.md]) {
      writeFileSync(join(root, p), "prior");
      for (const argv of [[], ["--yes", "--budget", "1usd"]]) {
        log.length = 0;
        expect(await main(argv, io())).toBe(3);
        expect(log.join("")).toMatch(/never overwritten/);
      }
      expect(readFileSync(join(root, p), "utf8")).toBe("prior");
      rmSync(join(root, p));
    }
    expect(calls).toHaveLength(0);
  });

  it("--budget end to end: 1tok allows one call and records the rest as skipped", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    expect(await main(["--yes", "--budget", "1tok"], io())).toBe(0);
    expect(calls).toHaveLength(1);
    const rec = record();
    expect(rec.meta).toMatchObject({ status: "complete", budget: "1tok", trials: DEFAULT_TRIALS });
    expect(rec.trials).toHaveLength(entries.length * DEFAULT_TRIALS);
    expect(rec.trials.map((t) => t.status)).toEqual([
      "scored",
      ...Array(entries.length * DEFAULT_TRIALS - 1).fill("skipped"),
    ]);
    expect(rec.ledger.calls).toBe(1);
  });

  it("a confirmed run writes the record and the scorecard, then refuses a second run", async () => {
    anthropicEnv();
    const calls = stubFetch((e) => anthropicOk(correctReply(e)));
    expect(await main(["--yes", "--trials", "2", "--budget", "100usd"], io())).toBe(0);
    expect(calls).toHaveLength(entries.length * 2);
    const rec = record();
    expect(rec.meta).toMatchObject({
      mode: "live-fidelity",
      status: "complete",
      provider: "anthropic",
      model: MODEL,
      trials: 2,
      budget: "100usd",
      fidelityVersion: FIDELITY_VERSION,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    expect(rec.summary.fidelity).toEqual({ k: entries.length * 2, n: entries.length * 2 });
    expect(rec.summary.stops).toEqual({ end_turn: entries.length * 2 });
    expect(rec.ledger.calls).toBe(entries.length * 2);
    expect(rec.trials[0]!.call).toMatchObject({
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
    expect(await main(["--yes", "--budget", "100usd"], io())).toBe(3);
    expect(log.join("")).toMatch(/never overwritten/);
    expect(calls).toHaveLength(entries.length * 2);
  });

  it("the record is written before the first call and after every call", async () => {
    anthropicEnv();
    const statuses: string[] = [];
    stubFetch((e) => {
      const rec = record() as unknown as { meta: { status: string; done: number } };
      statuses.push(`${rec.meta.status}:${rec.meta.done}`);
      return anthropicOk(correctReply(e));
    });
    expect(await main(["--yes", "--trials", "1", "--budget", "100usd"], io())).toBe(0);
    expect(statuses).toEqual(entries.map((_, i) => `running:${i}`));
  });

  it(`an abort after ${MAX_CONSECUTIVE_FAILURES} failed calls exits 1 with the record marked aborted`, async () => {
    anthropicEnv();
    const calls = stubFetch(() => new Response("no", { status: 400 }));
    expect(await main(["--yes", "--budget", "100usd"], io())).toBe(1);
    expect(calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    const rec = record();
    expect(rec.meta.status).toBe("aborted");
    expect(rec.trials).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    const md = readFileSync(join(root, paths.md), "utf8");
    expect(md).toContain("> **Aborted** after");
    expect(md).toContain("## Unscored trials");
  });
});
