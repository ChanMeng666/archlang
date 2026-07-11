import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCorpus, type CorpusEntry, type Score } from "../eval/run.js";
import {
  type ChatMsg,
  type L2Author,
  type TrialCell,
  type Usage,
  buildFeedback,
  combineMetrics,
  hasIssues,
  passAtN,
  passHatN,
  runControlArm,
  runLoopArm,
  scoreArm,
  summarizeTrials,
} from "../eval/l2.js";

/**
 * L2 protocol unit tests — all offline, driven by a scripted fake {@link L2Author}. The
 * fake returns preset replies in order and records the messages/seed it was called with,
 * so the whole feedback loop, the equal-budget control accounting, the best-of scoring,
 * and the cross-trial aggregation are testable with no network. It also guards the
 * load-bearing oracle isolation: the feedback the model sees must never leak the scorer's
 * private expectations.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** A lint-clean plan → `hasIssues` false (stops the loop early). */
const CLEAN = read("eval/goldens/two-bed-hall.arch");
/** A valid plan carrying a lint warning (blocked doorway) → `hasIssues` true. */
const WARN = read("eval/faults/blocked-doorway.arch");

/** Wrap a source as a model would (fenced ```arch block) so `extractArch` unwraps it. */
const fenced = (src: string): string => `\`\`\`arch\n${src}\n\`\`\``;

/** A scripted fake author: returns `script[i]` on the i-th call, recording every call's
 *  (deep-cloned) messages and seed. Throws if the script is exhausted. */
function makeFake(script: { text: string; usage: Usage }[]): {
  author: L2Author;
  calls: { messages: ChatMsg[]; seed: number }[];
} {
  const calls: { messages: ChatMsg[]; seed: number }[] = [];
  let i = 0;
  const author: L2Author = async (messages, seed) => {
    calls.push({ messages: structuredClone(messages), seed });
    const r = script[i++];
    if (!r) throw new Error("fake author script exhausted");
    return r;
  };
  return { author, calls };
}

const entry = (prompt: string): CorpusEntry => ({ id: "t", prompt, golden: "", expect: {} });

const usage = (input: number, output: number): Usage => ({ input, output });

describe("runLoopArm — the diagnostic feedback loop", () => {
  it("stops after one call when the first plan is clean", async () => {
    const { author, calls } = makeFake([{ text: fenced(CLEAN), usage: usage(10, 20) }]);
    const res = await runLoopArm(entry("brief"), author, { system: "SYS", seed: 1 });
    expect(calls).toHaveLength(1);
    expect(res.rounds).toHaveLength(1);
    expect(res.rounds[0]?.source).toBe(CLEAN.trim()); // extractArch trims the fenced block
  });

  it("runs exactly 1 + maxRounds calls when the plan never becomes clean", async () => {
    const script = Array.from({ length: 5 }, () => ({ text: fenced(WARN), usage: usage(1, 1) }));
    const { author, calls } = makeFake(script);
    const res = await runLoopArm(entry("brief"), author, { system: "SYS", seed: 1, maxRounds: 2 });
    expect(calls).toHaveLength(3); // 1 initial + 2 feedback rounds
    expect(res.rounds).toHaveLength(3);
  });

  it("feeds the prior raw reply + a deterministic feedback string on the next call", async () => {
    const first = fenced(WARN);
    const { author, calls } = makeFake([
      { text: first, usage: usage(1, 1) },
      { text: fenced(CLEAN), usage: usage(1, 1) },
    ]);
    await runLoopArm(entry("BRIEF"), author, { system: "SYS", seed: 7 });
    // Second call sees: [system, user brief, assistant prior-reply, user feedback].
    const second = calls[1]?.messages;
    expect(second).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "BRIEF" },
      { role: "assistant", content: first },
      { role: "user", content: buildFeedback(WARN) },
    ]);
  });
});

describe("runControlArm — equal-budget i.i.d. resampling", () => {
  it("keeps sampling until the spend crosses the budget (rounds the count up)", async () => {
    const { author } = makeFake(Array.from({ length: 6 }, () => ({ text: fenced(CLEAN), usage: usage(200, 200) })));
    const res = await runControlArm(entry("brief"), author, { system: "SYS", seedBase: 5, budgetTokens: 1000 });
    // 400/sample: 400, 800, 1200 — the sample crossing 1000 is kept → 3 samples.
    expect(res.samples).toHaveLength(3);
    expect(res.samples.map((s) => s.seed)).toEqual([5, 6, 7]);
  });

  it("always draws at least one sample even under a tiny budget", async () => {
    const { author } = makeFake([{ text: fenced(CLEAN), usage: usage(200, 200) }]);
    const res = await runControlArm(entry("brief"), author, { system: "SYS", seedBase: 5, budgetTokens: 100 });
    expect(res.samples).toHaveLength(1);
    expect(res.samples[0]?.seed).toBe(5);
  });
});

describe("buildFeedback / oracle isolation", () => {
  it("never leaks the scorer's private expectations into the feedback", () => {
    const corpus = loadCorpus();
    const first = corpus[0] as CorpusEntry;
    const fb = buildFeedback(WARN);
    // The brief's expect block (area source quote, subscore/verdict vocabulary) must not appear.
    if (first.expect.totalAreaM2) expect(fb).not.toContain(first.expect.totalAreaM2.source);
    expect(fb).not.toContain("semanticPass");
    expect(fb).not.toContain("subscore");
    // It does carry the plan's own diagnostics — the feedback is real.
    expect(fb).toContain("arch compile --json");
    expect(fb).toContain("arch lint --json");
  });

  it("omits the describe facts block when the plan does not compile", () => {
    const fb = buildFeedback("plan Broken\nroom");
    expect(fb).not.toContain("arch describe --json");
  });

  it("l2.ts and l2-run.ts source never reference the private oracle", () => {
    for (const rel of ["eval/l2.ts", "eval/l2-run.ts"]) {
      expect(read(rel)).not.toMatch(/synonyms|goldens\//);
    }
  });
});

describe("scoreArm / combineMetrics — best-of is independent per metric", () => {
  it("passes valid/intent/sound each via a different output", () => {
    const score = (over: Partial<Score>): Score => ({
      id: "x",
      valid: false,
      lintWarnings: 0,
      physicalWarnings: 0,
      semanticPass: false,
      failures: [],
      ...over,
    });
    // A: valid + intent, but unsound (has lint warnings). B: valid + sound, but no intent.
    const a = score({ valid: true, semanticPass: true, lintWarnings: 3 });
    const b = score({ valid: true, semanticPass: false, lintWarnings: 0 });
    // No single output is both intent AND sound, yet the arm passes both.
    expect(combineMetrics([a, b])).toEqual({ valid: true, intent: true, sound: true });
    const single = (s: Score): boolean => s.semanticPass && s.valid && s.lintWarnings === 0;
    expect([a, b].some(single)).toBe(false);
  });

  it("scoreArm scores real sources and keeps every output's Score", () => {
    const first = loadCorpus()[0] as CorpusEntry;
    const arm = scoreArm(first, [read(first.golden)]);
    expect(arm.scores).toHaveLength(1);
    expect(arm.valid).toBe(true); // the golden compiles
  });
});

describe("aggregation — summarizeTrials / pass@n / pass^n", () => {
  // 2 briefs × 3 trials. loop intent: b1 passes every trial; b2 passes only trial 1.
  // Both arms are always valid; neither is ever sound; control never passes intent.
  const T = (valid: boolean, intent: boolean, sound: boolean) => ({ valid, intent, sound });
  const cells: TrialCell[] = [
    { id: "b1", trial: 1, loop: T(true, true, false), control: T(true, false, false) },
    { id: "b1", trial: 2, loop: T(true, true, false), control: T(true, false, false) },
    { id: "b1", trial: 3, loop: T(true, true, false), control: T(true, false, false) },
    { id: "b2", trial: 1, loop: T(true, true, false), control: T(true, false, false) },
    { id: "b2", trial: 2, loop: T(true, false, false), control: T(true, false, false) },
    { id: "b2", trial: 3, loop: T(true, false, false), control: T(true, false, false) },
  ];

  it("computes per-arm mean±σ and the net delta", () => {
    const s = summarizeTrials(cells);
    expect(s.trials).toBe(3);
    expect(s.briefs).toBe(2);
    // Loop intent per-trial rates: 1.0, 0.5, 0.5 → mean 2/3.
    expect(s.loop.intent.mean).toBeCloseTo(2 / 3, 10);
    expect(s.loop.intent.sigma).toBeCloseTo(Math.sqrt(0.05555555), 6);
    expect(s.loop.valid.mean).toBe(1);
    expect(s.loop.valid.sigma).toBe(0);
    expect(s.control.intent.mean).toBe(0);
    expect(s.net.intent).toBeCloseTo(2 / 3, 10);
    expect(s.net.valid).toBe(0);
  });

  it("computes pass@n and pass^n on intent for both arms", () => {
    // b1 passes all 3 trials; b2 passes ≥1 (trial 1) but not all.
    expect(passAtN(cells, "loop")).toBe(1); // both briefs pass in some trial
    expect(passHatN(cells, "loop")).toBe(0.5); // only b1 passes in every trial
    expect(passAtN(cells, "control")).toBe(0);
    expect(passHatN(cells, "control")).toBe(0);
  });
});

describe("determinism", () => {
  it("yields deeply-equal results for the same fake-author script", async () => {
    const build = () =>
      makeFake([
        { text: fenced(WARN), usage: usage(3, 4) },
        { text: fenced(CLEAN), usage: usage(5, 6) },
      ]);
    const a = await runLoopArm(entry("brief"), build().author, { system: "SYS", seed: 42 });
    const b = await runLoopArm(entry("brief"), build().author, { system: "SYS", seed: 42 });
    expect(a).toEqual(b);
  });
});

describe("hasIssues", () => {
  it("is false for a clean plan and true for one with a lint warning", () => {
    expect(hasIssues(CLEAN)).toBe(false);
    expect(hasIssues(WARN)).toBe(true);
  });
});
