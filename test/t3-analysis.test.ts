/** eval/t3-analysis.ts — the pre-registered T3 analysis, on synthetic records built here with the
 *  harness's own `buildRecord`, so the record shape and `summary.net.intent` are the harness's. */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { type BriefRecord, type RunMeta, type TrialRecord, buildRecord } from "../eval/l2-run.js";
import { LiveLedger, loadCorpus } from "../eval/run.js";
import {
  HAIKU,
  type L2Record,
  SECONDARY_LABEL,
  SONNET,
  T3_ARGV,
  T3_BRIEFS,
  analyseModel,
  asRecord,
  holm2,
  ltR,
  renderReport,
  runCli,
  signTestP,
} from "../eval/t3-analysis.js";

// ── Synthetic records ────────────────────────────────────────────────────────────────

const score = (intent: boolean) => ({ valid: true, intent, sound: intent, scores: [] });

/** One trial whose two arms score `loop` and `control` on intent. */
function trial(t: number, loop: boolean, control: boolean): TrialRecord {
  return {
    trial: t,
    loopSeed: 20260711 + (t - 1) * 1000,
    controlSeedBase: 20260711 + (t - 1) * 1000 + 100,
    loopTokens: 30,
    loop: { rounds: [{ source: "plan X", usage: { input: 20, output: 10 } }] },
    control: { samples: [{ source: "plan X", usage: { input: 20, output: 10 }, seed: 1 }] },
    loopScore: score(loop),
    controlScore: score(control),
    calls: [
      {
        arm: "loop",
        index: 0,
        seed: 1,
        text: "",
        stop: "end_turn",
        fresh: 20,
        cacheWrite: 0,
        cacheRead: 0,
        output: 10,
        retries: [],
      },
      {
        arm: "control",
        index: 0,
        seed: 1,
        text: "",
        stop: "max_tokens",
        fresh: 20,
        cacheWrite: 0,
        cacheRead: 0,
        output: 10,
        retries: [],
      },
    ],
  };
}

/** A complete brief with s_b = s (−3 … +3): |s| trials favour one arm, the rest tie at 0–0. */
function brief(id: string, s: number): BriefRecord {
  const trials = [1, 2, 3].map((t) => (t <= Math.abs(s) ? trial(t, s > 0, s < 0) : trial(t, false, false)));
  return { id, status: "complete", trials };
}

/** Briefs from a list of [count, s_b] groups, numbered b01, b02, … */
function briefs(groups: [number, number][]): BriefRecord[] {
  const out: BriefRecord[] = [];
  for (const [count, s] of groups)
    for (let i = 0; i < count; i++) out.push(brief(`b${String(out.length + 1).padStart(2, "0")}`, s));
  return out;
}

const partial = (id: string): BriefRecord => ({
  id,
  status: "partial",
  trials: [trial(1, true, false)],
  failure: { trial: 2, message: "Anthropic API 400: credit\nexhausted", retries: [], calls: [] },
});
const skipped = (id: string): BriefRecord => ({ id, status: "skipped", trials: [] });

const HAIKU_START = "2026-11-20T08:00:00.000Z";
const HAIKU_END = "2026-11-20T10:00:00.000Z";
const SONNET_START = "2026-11-20T12:00:00.000Z";
const SONNET_END = "2026-11-20T16:00:00.000Z";

function meta(model: string, over: Partial<RunMeta> = {}): RunMeta {
  const haiku = model === HAIKU;
  return {
    provider: "anthropic",
    model,
    trials: 3,
    briefs: 26,
    budget: haiku ? "25usd" : "80usd",
    concurrency: 4,
    argv: [...(T3_ARGV[model] ?? [])],
    startedAt: haiku ? HAIKU_START : SONNET_START,
    endedAt: haiku ? HAIKU_END : SONNET_END,
    git: { head: "0123456789abcdef0123456789abcdef01234567", dirty: false },
    sha256: { spec: "a".repeat(64), systemPrompt: "b".repeat(64) },
    ...over,
  };
}

/** A record exactly as the harness writes it (`buildRecord`), round-tripped through JSON. */
function record(
  model: string,
  bs: BriefRecord[],
  opts: { status?: "running" | "complete"; meta?: Partial<RunMeta>; calls?: number } = {},
): L2Record {
  const ledger = new LiveLedger(model);
  for (let i = 0; i < (opts.calls ?? 10); i++)
    ledger.record({ input: 20, output: 10, stop: i === 0 ? "max_tokens" : "end_turn" });
  const status = opts.status ?? "complete";
  const m = meta(model, { ...(status === "running" ? { endedAt: null } : {}), ...opts.meta });
  return asRecord(JSON.parse(JSON.stringify(buildRecord(m, status, bs, ledger))), model);
}

const report = (h: L2Record | null, s: L2Record | null): string =>
  renderReport({ source: "haiku.json", record: h }, { source: "sonnet.json", record: s });
const verdictLine = (out: string, model: string): string => {
  const line = out.split("\n").find((l) => l.startsWith("- ") && l.includes(`for ${model}`));
  if (!line) throw new Error(`no verdict line for ${model}`);
  return line;
};
/** A model so strong (26/26 at +3) that its own raw p is 2/2^26: Holm then leaves the other at its raw p. */
const strong = (model: string): L2Record => record(model, briefs([[26, 3]]));

// ── Tests ────────────────────────────────────────────────────────────────────────────

describe("t3-analysis: fixed constants", () => {
  it("the corpus has the 26 briefs the pre-registration counts", () => {
    expect(loadCorpus()).toHaveLength(T3_BRIEFS);
  });
});

describe("t3-analysis: exact sign test and Holm", () => {
  it("p = 1 at n = 0 and the exact tails at 19/26 and 20/26", () => {
    expect(signTestP(0, 0)).toEqual({ num: 1n, den: 1n });
    // P(X ≥ 20) = 313912 / 2^26, so p = 627824 / 2^26 = 39239 / 2^22 ≈ 0.00936.
    expect(signTestP(20, 26)).toEqual({ num: 39239n, den: 4194304n });
    // P(X ≥ 19) = 971712 / 2^26, so p = 1943424 / 2^26 = 15183 / 2^19 ≈ 0.0290.
    expect(signTestP(19, 26)).toEqual({ num: 15183n, den: 524288n });
    expect(signTestP(6, 26)).toEqual(signTestP(20, 26)); // two-sided: symmetric
    expect(signTestP(13, 26)).toEqual({ num: 1n, den: 1n }); // capped at 1
    expect(signTestP(1, 1)).toEqual({ num: 1n, den: 1n });
  });

  it("Holm doubles the smaller, lifts the larger to at least that, caps both at 1", () => {
    const a = signTestP(20, 26);
    const one = { num: 1n, den: 1n };
    expect(holm2(a, one)).toEqual([{ num: 39239n, den: 2097152n }, one]);
    expect(holm2(one, a)).toEqual([one, { num: 39239n, den: 2097152n }]);
    const tiny = signTestP(26, 26);
    const [h, s] = holm2(tiny, signTestP(19, 26));
    expect(s).toEqual(signTestP(19, 26)); // max(0.029, 2·tiny) = 0.029
    expect(ltR(h, s)).toBe(true);
  });
});

describe("t3-analysis: § 4 decision rule", () => {
  it("M1: 19 briefs at +1 and 7 at −3 (k > n − k but S < 0) prints no difference", () => {
    const h = record(
      HAIKU,
      briefs([
        [19, 1],
        [7, -3],
      ]),
    );
    const a = analyseModel(HAIKU, h);
    expect([a.k, a.n, a.S]).toEqual([19, 26, -2]);
    // Even with p_Holm < 0.05 (the other model is strong), the disagreement gives no direction.
    const out = report(h, strong(SONNET));
    expect(verdictLine(out, HAIKU)).toBe(
      `- On this corpus and protocol, no difference between the loop and equal-budget resampling was detected for ${HAIKU} (D = -0.0256, k/n = 19/26, 26/26 complete, p_Holm = 0.0290).`,
    );
    expect(out).toContain('A "no difference detected" verdict at this resolution is not evidence of no effect');
  });

  it("D = 0 exactly with integer S (13 at +1, 13 at −1)", () => {
    const h = record(
      HAIKU,
      briefs([
        [13, 1],
        [13, -1],
      ]),
    );
    const a = analyseModel(HAIKU, h);
    expect(a.S).toBe(0);
    expect(a.D).toBe(0);
    expect(Object.is(a.D, -0)).toBe(false);
    expect(verdictLine(report(h, null), HAIKU)).toContain("no difference");
    expect(verdictLine(report(h, null), HAIKU)).toContain("D = 0.0000, k/n = 13/26");
  });

  it("n = 0: every complete brief tied, p = 1", () => {
    const h = record(HAIKU, briefs([[26, 0]]));
    const a = analyseModel(HAIKU, h);
    expect([a.n, a.k, a.ties]).toEqual([0, 0, 26]);
    expect(verdictLine(report(h, null), HAIKU)).toBe(
      `- On this corpus and protocol, no difference between the loop and equal-budget resampling was detected for ${HAIKU} (D = 0.0000, k/n = 0/0, 26/26 complete, p_Holm = 1).`,
    );
  });

  it("20/26 alone is a loop verdict; 19/26 alone is not", () => {
    const twenty = record(
      SONNET,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    expect(verdictLine(report(null, twenty), SONNET)).toBe(
      `- On this corpus and protocol, the loop met intent more often than equal-budget resampling for ${SONNET} (D = +0.1795, k/n = 20/26, 26/26 complete, p_Holm = 0.0187).`,
    );
    const nineteen = record(
      SONNET,
      briefs([
        [19, 1],
        [7, -1],
      ]),
    );
    expect(verdictLine(report(null, nineteen), SONNET)).toBe(
      `- On this corpus and protocol, no difference between the loop and equal-budget resampling was detected for ${SONNET} (D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0579).`,
    );
  });

  it("19/26 suffices when the other model's raw p is below 0.025", () => {
    const nineteen = record(
      SONNET,
      briefs([
        [19, 1],
        [7, -1],
      ]),
    );
    expect(verdictLine(report(strong(HAIKU), nineteen), SONNET)).toContain(
      `the loop met intent more often than equal-budget resampling for ${SONNET} (D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0290)`,
    );
  });

  it("the resampling direction: 6 at +1, 20 at −1", () => {
    const h = record(
      HAIKU,
      briefs([
        [6, 1],
        [20, -1],
      ]),
    );
    expect(verdictLine(report(h, null), HAIKU)).toBe(
      `- On this corpus and protocol, equal-budget resampling met intent more often than the loop for ${HAIKU} (D = -0.1795, k/n = 6/26, 26/26 complete, p_Holm = 0.0187).`,
    );
  });
});

describe("t3-analysis: Holm with an inconclusive model", () => {
  it("a running record enters with p = 1 whatever its own data show", () => {
    // Haiku's data are 26/26, but its record is still `running`: it enters Holm with p = 1, so
    // it cannot lift Sonnet's 19/26 to a verdict.
    const h = record(HAIKU, briefs([[26, 3]]), { status: "running" });
    const nineteen = record(
      SONNET,
      briefs([
        [19, 1],
        [7, -1],
      ]),
    );
    const out = report(h, nineteen);
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: the run did not complete (status running).`);
    expect(verdictLine(out, SONNET)).toContain("no difference");
    expect(verdictLine(out, SONNET)).toContain("p_Holm = 0.0579");
    // And 20/26 still passes on its own: 2 × 0.0094 = 0.0187.
    const twenty = record(
      SONNET,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    expect(verdictLine(report(h, twenty), SONNET)).toContain("the loop met intent more often");
  });
});

describe("t3-analysis: § 5 attrition", () => {
  it("status running is inconclusive whatever the count, and a missing brief is listed as abort", () => {
    const h = record(HAIKU, briefs([[20, 1]]), { status: "running" });
    const out = report(h, null);
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: the run did not complete (status running).`);
    expect(out).toContain("(unnamed): abort. 6 brief(s) never written to the record");
  });

  it("5 dropped is inconclusive; 4 dropped still gets a verdict; every dropped brief is listed", () => {
    const five = record(HAIKU, [
      ...briefs([[21, 3]]),
      partial("p1"),
      partial("p2"),
      partial("p3"),
      skipped("s1"),
      skipped("s2"),
    ]);
    const out5 = report(five, null);
    expect(verdictLine(out5, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: 5 of 26 briefs were not completed.`);
    expect(out5).toContain("`p1`: error. trial 2 failed (1 trial(s) kept): Anthropic API 400: credit exhausted");
    expect(out5).toContain("`s2`: budget. skipped by the --budget breaker");

    const four = record(HAIKU, [...briefs([[22, 3]]), partial("p1"), partial("p2"), skipped("s1"), skipped("s2")]);
    const out4 = report(four, null);
    expect(verdictLine(out4, HAIKU)).toContain(
      `the loop met intent more often than equal-budget resampling for ${HAIKU} (D = +1.0000, k/n = 22/22, 22/26 complete, p_Holm = 9.54e-7)`,
    );
    // A partial brief's completed trial is dropped from both arms: S counts complete briefs only.
    expect(analyseModel(HAIKU, four).S).toBe(66);
  });
});

describe("t3-analysis: the CLI and its inputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "t3-analysis-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("`none none`: both models inconclusive (not run), Holm all ones", () => {
    const out = runCli(["none", "none"]);
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive (not run) for ${HAIKU}.`);
    expect(verdictLine(out, SONNET)).toBe(`- Inconclusive (not run) for ${SONNET}.`);
    expect(out).toContain("No model was run.");
  });

  it("reads plain and gzipped JSON alike, and `none` for one slot", () => {
    const h = record(
      HAIKU,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    const plain = join(dir, "haiku.json");
    const gz = join(dir, "haiku.json.gz");
    writeFileSync(plain, JSON.stringify(h));
    writeFileSync(gz, gzipSync(JSON.stringify(h, null, 2)));
    const a = runCli([plain, "none"]).replace(plain.replace(/\\/g, "/"), "X");
    const b = runCli([gz, "none"]).replace(gz.replace(/\\/g, "/"), "X");
    expect(b).toBe(a);
    expect(verdictLine(a, HAIKU)).toContain("the loop met intent more often");
    expect(verdictLine(a, SONNET)).toBe(`- Inconclusive (not run) for ${SONNET}.`);
  });

  it("asserts |D − summary.net.intent| < 1e-9", () => {
    const h = record(
      HAIKU,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    const net = h.summary?.net?.intent ?? Number.NaN;
    expect(Math.abs((analyseModel(HAIKU, h).D ?? 0) - net)).toBeLessThan(1e-9);
    const tampered = structuredClone(h);
    if (tampered.summary?.net) tampered.summary.net.intent = net + 1e-6;
    expect(() => analyseModel(HAIKU, tampered)).toThrow(/summary\.net\.intent/);
  });

  it("refuses a record in the wrong argument slot", () => {
    expect(() => report(record(SONNET, briefs([[26, 0]])), null)).toThrow(/argument slot/);
  });

  it("refuses a record without the stored intent scores", () => {
    const h = JSON.parse(JSON.stringify(record(HAIKU, briefs([[26, 0]])))) as {
      briefs: { trials: { loopScore: unknown }[] }[];
    };
    const t = h.briefs[0]?.trials[0];
    if (t) t.loopScore = {};
    expect(() => asRecord(h, "x")).toThrow(/loopScore\.intent/);
  });
});

describe("t3-analysis: § 2 / § 3 checks and § 6 tables", () => {
  it("a clean pair passes every check", () => {
    const out = report(record(HAIKU, briefs([[26, 0]])), record(SONNET, briefs([[26, 0]])));
    expect(out).not.toContain("PROTOCOL VIOLATION");
    expect(out).not.toContain("**NO**");
  });

  it("prints violations prominently and changes no verdict", () => {
    const h = record(
      HAIKU,
      briefs([
        [20, 1],
        [6, -1],
      ]),
      { meta: { git: { head: "aaa", dirty: true } } },
    );
    const s = record(SONNET, briefs([[26, 0]]), {
      meta: { startedAt: "2026-11-21T10:00:00.001Z", git: { head: "bbb", dirty: false } },
      calls: 0,
    });
    const out = report(h, s);
    expect(out).toContain("PROTOCOL VIOLATION: 4 check(s) failed.");
    expect(out).toContain(`**${HAIKU}: \`meta.git.dirty\` is false**`);
    expect(out).toContain("**both models ran at the same `meta.git.head`**");
    expect(out).toContain(`**${SONNET} started after ${HAIKU}'s end and within 24 h of it**`);
    expect(out).toContain(`**${SONNET}: \`ledger.calls\` ≥ 1`);
    expect(verdictLine(out, HAIKU)).toContain("the loop met intent more often");
  });

  it("a Haiku run that did not end cannot be checked for the 24 h window", () => {
    const out = report(record(HAIKU, briefs([[26, 0]]), { status: "running" }), record(SONNET, briefs([[26, 0]])));
    expect(out).toContain(`cannot verify: ${HAIKU}'s endedAt is null`);
  });

  it("labels every § 6 table, and the output is deterministic", () => {
    const h = record(
      HAIKU,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    const s = record(SONNET, [...briefs([[25, 0]]), partial("p1")]);
    const out = report(h, s);
    expect(report(h, s)).toBe(out);
    const sec = out.slice(out.indexOf("## Secondary measures (§ 6)"));
    const tables = sec.split("\n").filter((l) => l.startsWith("### "));
    expect(tables).toHaveLength(8);
    expect(sec.split(`*${SECONDARY_LABEL}.*`).length - 1).toBe(8);
    // Truncations: one control call per complete trial is `max_tokens` in the fixture.
    expect(sec).toContain(`| ${HAIKU} | 0 | 78 | 1 |`);
    expect(sec).toContain(`| ${SONNET} | 0 | 75 | 1 |`);
  });
});
