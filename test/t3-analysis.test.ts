/** eval/t3-analysis.ts — the pre-registered T3 analysis, on synthetic records built here with the
 *  harness's own `buildRecord`, so the record shape and `summary.net.intent` are the harness's. */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { JUDGE_VERSION } from "../eval/assertions.js";
import { type BriefRecord, type RunMeta, type TrialRecord, buildRecord } from "../eval/l2-run.js";
import { LiveLedger, loadCorpus } from "../eval/run.js";
import {
  DEADLINE_READING,
  HAIKU,
  type L2Record,
  SECONDARY_LABEL,
  SONNET,
  T3_ARGV,
  T3_BRIEFS,
  analyseModel,
  asRecord,
  baseName,
  cell,
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
  const call = (arm: "loop" | "control", stop: string) => ({
    arm,
    index: 0,
    seed: 1,
    text: "",
    stop,
    fresh: 20,
    cacheWrite: 0,
    cacheRead: 0,
    output: 10,
    retries: [],
  });
  return {
    trial: t,
    loopSeed: 20260711 + (t - 1) * 1000,
    controlSeedBase: 20260711 + (t - 1) * 1000 + 100,
    loopTokens: 30,
    loop: { rounds: [{ source: "plan X", usage: { input: 20, output: 10 } }] },
    control: { samples: [{ source: "plan X", usage: { input: 20, output: 10 }, seed: 1 }] },
    loopScore: score(loop),
    controlScore: score(control),
    calls: [call("loop", "end_turn"), call("control", "max_tokens")],
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

const HEAD = "0123456789abcdef0123456789abcdef01234567";
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
    git: { head: HEAD, dirty: false },
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
  const calls = opts.calls ?? 10;
  for (let i = 0; i < calls; i++) ledger.record({ input: 20, output: 10, stop: i === 0 ? "max_tokens" : "end_turn" });
  const status = opts.status ?? "complete";
  const m = meta(model, { ...(status === "running" ? { endedAt: null } : {}), ...opts.meta });
  return asRecord(JSON.parse(JSON.stringify(buildRecord(m, status, bs, ledger))), model);
}
/** The same record as raw JSON, for the malformed-record tests. */
const raw = (rec: L2Record): Record<string, unknown> => JSON.parse(JSON.stringify(rec)) as Record<string, unknown>;

const report = (h: L2Record | null, s: L2Record | null): string =>
  renderReport({ source: "haiku.json", record: h }, { source: "sonnet.json", record: s });
/** The verdict bullet that names `model`. */
const verdictLine = (out: string, model: string): string => {
  const section = out.slice(out.indexOf("## Verdicts"), out.indexOf("## Primary quantities"));
  const line = section.split("\n").find((l) => l.startsWith("- ") && l.includes(model));
  if (!line) throw new Error(`no verdict line for ${model}`);
  return line;
};
const primaryRow = (out: string, model: string): string => {
  const section = out.slice(out.indexOf("## Primary quantities"), out.indexOf("## Dropped briefs"));
  return section.split("\n").find((l) => l.startsWith(`| ${model} |`)) ?? "";
};
const noDiff = (model: string, paren: string): string =>
  `- On this corpus and protocol, no difference between the loop and equal-budget resampling was detected for ${model} (${paren}).`;
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

  it("a Holm tie: both models at 19/26 get p_Holm 0.0579 and no difference", () => {
    const out = report(
      record(
        HAIKU,
        briefs([
          [19, 1],
          [7, -1],
        ]),
      ),
      record(
        SONNET,
        briefs([
          [19, 1],
          [7, -1],
        ]),
      ),
    );
    for (const model of [HAIKU, SONNET]) {
      expect(verdictLine(out, model)).toBe(noDiff(model, "D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0579"));
    }
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
    // p_Holm < 0.05 (the other model is strong), so only the S condition stops a loop verdict
    // and only the k condition stops a resampling one.
    const out = report(h, strong(SONNET));
    expect(verdictLine(out, HAIKU)).toBe(noDiff(HAIKU, "D = -0.0256, k/n = 19/26, 26/26 complete, p_Holm = 0.0290"));
    expect(out).toContain('A "no difference detected" verdict at this resolution is not evidence of no effect');
  });

  it("the mirror: 7 briefs at +3 and 19 at −1 (k < n − k but S > 0) prints no difference", () => {
    const h = record(
      HAIKU,
      briefs([
        [7, 3],
        [19, -1],
      ]),
    );
    const a = analyseModel(HAIKU, h);
    expect([a.k, a.n, a.S]).toEqual([7, 26, 2]);
    // p_Holm < 0.05 again: only the k condition stops a loop verdict and only the S condition
    // stops a resampling one.
    expect(verdictLine(report(h, strong(SONNET)), HAIKU)).toBe(
      noDiff(HAIKU, "D = +0.0256, k/n = 7/26, 26/26 complete, p_Holm = 0.0290"),
    );
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
    expect(verdictLine(report(h, null), HAIKU)).toBe(
      noDiff(HAIKU, "D = 0.0000, k/n = 13/26, 26/26 complete, p_Holm = 1"),
    );
  });

  it("n = 0: every complete brief tied, p = 1", () => {
    const h = record(HAIKU, briefs([[26, 0]]));
    const a = analyseModel(HAIKU, h);
    expect([a.n, a.k, a.ties]).toEqual([0, 0, 26]);
    expect(verdictLine(report(h, null), HAIKU)).toBe(
      noDiff(HAIKU, "D = 0.0000, k/n = 0/0, 26/26 complete, p_Holm = 1"),
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
      noDiff(SONNET, "D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0579"),
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
    expect(verdictLine(report(strong(HAIKU), nineteen), SONNET)).toBe(
      `- On this corpus and protocol, the loop met intent more often than equal-budget resampling for ${SONNET} (D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0290).`,
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

describe("t3-analysis: standings that enter Holm with p = 1", () => {
  const nineteen = (): L2Record =>
    record(
      SONNET,
      briefs([
        [19, 1],
        [7, -1],
      ]),
    );
  const sonnetNoDiff = noDiff(SONNET, "D = +0.1538, k/n = 19/26, 26/26 complete, p_Holm = 0.0579");

  it("a running record is inconclusive and cannot lift the other model, whatever its data", () => {
    const h = record(HAIKU, briefs([[26, 3]]), { status: "running" });
    const out = report(h, nineteen());
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: the run did not complete (status running).`);
    expect(verdictLine(out, SONNET)).toBe(sonnetNoDiff);
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

  it("more than 4 dropped: inconclusive, enters with p = 1", () => {
    const h = record(HAIKU, [
      ...briefs([[21, 3]]),
      partial("p1"),
      partial("p2"),
      partial("p3"),
      skipped("s1"),
      skipped("s2"),
    ]);
    const out = report(h, nineteen());
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: 5 of 26 briefs were not completed.`);
    expect(verdictLine(out, SONNET)).toBe(sonnetNoDiff);
  });

  it("B2 repro: Haiku started at the deadline is not run, so Sonnet's 19/26 is no difference", () => {
    const late = record(HAIKU, briefs([[26, 3]]), {
      meta: { startedAt: "2026-11-30T00:00:00.000Z", endedAt: "2026-11-30T02:00:00.000Z" },
    });
    const out = report(late, nineteen());
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive (not run) for ${HAIKU}.`);
    expect(verdictLine(out, SONNET)).toBe(sonnetNoDiff);
    expect(out).toContain(DEADLINE_READING);
    expect(out).toContain(`- Note: ${HAIKU}: \`meta.startedAt\` 2026-11-30T00:00:00.000Z is at or after`);
    expect(primaryRow(out, HAIKU)).toContain("not run (started at or after the deadline)");
    // One millisecond earlier it is a run, and its data lift Sonnet to a verdict.
    const inTime = record(HAIKU, briefs([[26, 3]]), { meta: { startedAt: "2026-11-29T23:59:59.999Z" } });
    expect(verdictLine(report(inTime, nineteen()), SONNET)).toContain("the loop met intent more often");
  });

  it("attempt 0 (ledger.calls = 0) is not a run and enters with p = 1", () => {
    const h = record(HAIKU, briefs([[26, 3]]), { calls: 0 });
    const out = report(h, nineteen());
    expect(verdictLine(out, HAIKU)).toBe(`- ${HAIKU}: attempt 0 — not a run (§3); restart only on the owner's word.`);
    expect(verdictLine(out, SONNET)).toBe(sonnetNoDiff);
  });

  it("an inconclusive model shows only its status and counts", () => {
    const out = report(record(HAIKU, briefs([[26, 3]]), { status: "running" }), null);
    const row = primaryRow(out, HAIKU);
    expect(row).toBe(`| ${HAIKU} | inconclusive (§ 5) | running | 26 | 0 | — | — | — | — | — | — | — | — | 1 | — |`);
    expect(out).not.toContain("complete briefs by s_b");
  });
});

describe("t3-analysis: § 5 attrition", () => {
  it("status running is inconclusive whatever the count; a missing brief is abort, with the corpus instruction", () => {
    const h = record(HAIKU, briefs([[20, 1]]), { status: "running" });
    const out = report(h, null);
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive for ${HAIKU}: the run did not complete (status running).`);
    expect(out).toContain(
      `(unnamed): abort (6 brief(s) never written to the record (record status running), which does not name them; the result file lists their ids by hand from \`git show ${HEAD}:eval/corpus.json\`)`,
    );
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
    expect(out5).toContain("`p1`: error (trial 2 failed, 1 trial(s) kept: Anthropic API 400: credit exhausted)");
    expect(out5).toContain("`s2`: budget (skipped by the --budget breaker)");

    const four = record(HAIKU, [...briefs([[22, 3]]), partial("p1"), partial("p2"), skipped("s1"), skipped("s2")]);
    expect(verdictLine(report(four, null), HAIKU)).toBe(
      `- On this corpus and protocol, the loop met intent more often than equal-budget resampling for ${HAIKU} (D = +1.0000, k/n = 22/22, 22/26 complete, p_Holm = 9.54e-7).`,
    );
    // A partial brief's completed trial is dropped from both arms: S counts complete briefs only.
    expect(analyseModel(HAIKU, four).S).toBe(66);
  });

  it("a complete-status brief without 3 trials is dropped as error", () => {
    const odd: BriefRecord = { id: "odd", status: "complete", trials: [trial(1, true, false)] };
    // buildRecord counts the odd brief's trial in its summary, so the assertion would fire:
    // check the drop on a record whose summary is taken over the 25 complete briefs.
    const base = record(HAIKU, briefs([[25, 0]]));
    const rec: L2Record = { ...base, briefs: [...base.briefs, odd] };
    const a = analyseModel(HAIKU, rec);
    expect(a.dropped).toEqual([{ id: "odd", reason: "error", detail: "status complete but 1 trial(s)" }]);
  });
});

describe("t3-analysis: the CLI and its inputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "t3-analysis-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("`none none`: both models inconclusive (not run), Holm all ones", () => {
    const out = runCli(["none", "none"]);
    expect(verdictLine(out, HAIKU)).toBe(`- Inconclusive (not run) for ${HAIKU}.`);
    expect(verdictLine(out, SONNET)).toBe(`- Inconclusive (not run) for ${SONNET}.`);
    expect(out).toContain("No model has a run to report.");
  });

  it("reads plain and gzipped JSON alike, prints only the file name, and takes `none` for one slot", () => {
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
    const a = runCli([plain, "none"]);
    const b = runCli([gz, "none"]);
    expect(a).toContain(`- ${HAIKU}: \`haiku.json\``);
    expect(b).toContain(`- ${HAIKU}: \`haiku.json.gz\``);
    expect(a).not.toContain(dir);
    expect(b.replace("haiku.json.gz", "haiku.json")).toBe(a);
    expect(verdictLine(a, HAIKU)).toContain("the loop met intent more often");
    expect(verdictLine(a, SONNET)).toBe(`- Inconclusive (not run) for ${SONNET}.`);
    expect(baseName("C:\\runs\\t3\\x.json.gz")).toBe("x.json.gz");
    expect(baseName("eval/live-runs/t3/y.json")).toBe("y.json");
  });

  it("asserts |D − summary.net.intent| < 1e-9: 5e-10 passes, 2e-9 fails", () => {
    const h = record(
      HAIKU,
      briefs([
        [20, 1],
        [6, -1],
      ]),
    );
    const net = h.summary.net.intent;
    expect(Math.abs((analyseModel(HAIKU, h).D ?? 0) - net)).toBeLessThan(1e-9);
    const near = structuredClone(h);
    near.summary.net.intent = net + 5e-10;
    expect(() => analyseModel(HAIKU, near)).not.toThrow();
    const off = structuredClone(h);
    off.summary.net.intent = net + 2e-9;
    expect(() => analyseModel(HAIKU, off)).toThrow(/summary\.net\.intent/);
    expect(() => report(off, null)).toThrow(/summary\.net\.intent/);
  });

  it("refuses a record in the wrong argument slot", () => {
    expect(() => report(record(SONNET, briefs([[26, 0]])), null)).toThrow(/argument slot/);
  });

  it("refuses malformed records: no summary, no head, too many briefs, duplicate ids, no stored intent", () => {
    const ok = record(HAIKU, briefs([[26, 0]]));
    const noSummary = raw(ok);
    Reflect.deleteProperty(noSummary, "summary");
    expect(() => asRecord(noSummary, "x")).toThrow(/no summary/);
    for (const head of [null, ""]) {
      const r = raw(ok);
      (r.meta as { git: { head: unknown } }).git.head = head;
      expect(() => asRecord(r, "x")).toThrow(/meta\.git\.head/);
    }
    const tooMany = raw(record(HAIKU, briefs([[27, 0]]).slice(0, 26)));
    (tooMany.briefs as unknown[]).push({ ...brief("b27", 0) });
    expect(() => asRecord(tooMany, "x")).toThrow(/more than 26 briefs/);
    const dup = raw(record(HAIKU, briefs([[25, 0]])));
    (dup.briefs as unknown[]).push(brief("b01", 0));
    expect(() => asRecord(dup, "x")).toThrow(/b01 appears twice/);
    const noIntent = raw(ok) as { briefs: { trials: { loopScore: unknown }[] }[] };
    const t = noIntent.briefs[0]?.trials[0];
    if (t) t.loopScore = {};
    expect(() => asRecord(noIntent, "x")).toThrow(/loopScore\.intent/);
    // The CLI exits 1 on these: runCli throws, and its caller turns that into exit 1.
    expect(() => runCli(["none", "none", "extra"])).toThrow(/usage/);
  });
});

describe("t3-analysis: § 2 / § 3 checks", () => {
  const clean = (): [L2Record, L2Record] => [record(HAIKU, briefs([[26, 0]])), record(SONNET, briefs([[26, 0]]))];
  const violationsOf = (out: string): string[] => out.split("\n").filter((l) => l.startsWith("> - **"));

  it("a clean pair passes every check", () => {
    const out = report(...clean());
    expect(out).not.toContain("PROTOCOL VIOLATION");
    expect(out).not.toContain("**NO**");
    expect(out).not.toContain("cannot verify");
  });

  it("the argv check ignores `--yes` and nothing else", () => {
    const noYes = T3_ARGV[HAIKU]?.filter((a) => a !== "--yes") ?? [];
    expect(report(record(HAIKU, briefs([[26, 0]]), { meta: { argv: noYes } }), null)).not.toContain(
      "PROTOCOL VIOLATION",
    );
    for (const argv of [
      [...(T3_ARGV[HAIKU] ?? []), "--max", "5"],
      ["--yes", "--trials", "3", "--concurrency", "4", "--budget", "80usd"],
      ["--yes", "--trials", "2", "--concurrency", "4", "--budget", "25usd"],
    ]) {
      const out = report(record(HAIKU, briefs([[26, 0]]), { meta: { argv } }), null);
      expect(violationsOf(out)).toEqual([expect.stringContaining(`**${HAIKU}: the command's arguments are § 2's`)]);
    }
  });

  it("flags the provider and the judge", () => {
    const openai = report(record(HAIKU, briefs([[26, 0]]), { meta: { provider: "openai" } }), null);
    expect(violationsOf(openai)).toEqual([expect.stringContaining(`**${HAIKU}: provider anthropic, 26 briefs`)]);
    const judged = raw(record(HAIKU, briefs([[26, 0]])));
    (judged.meta as { judge: string }).judge = `${JUDGE_VERSION}-old`;
    const out = report(asRecord(judged, "x"), null);
    expect(violationsOf(out)).toEqual([expect.stringContaining(`**${HAIKU}: judge ${JUDGE_VERSION}`)]);
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
    });
    const out = report(h, s);
    expect(out).toContain("PROTOCOL VIOLATION: 3 check(s) failed.");
    expect(violationsOf(out)).toEqual([
      expect.stringContaining(`**${HAIKU}: \`meta.git.dirty\` is false**`),
      expect.stringContaining("**both models ran at the same `meta.git.head`**"),
      expect.stringContaining(`**${SONNET} started after ${HAIKU}'s end and within 24 h of it**`),
    ]);
    expect(verdictLine(out, HAIKU)).toContain("the loop met intent more often");
    // Exactly 24 h holds; Sonnet starting before Haiku's end does not.
    const at24 = record(SONNET, briefs([[26, 0]]), { meta: { startedAt: "2026-11-21T10:00:00.000Z" } });
    expect(report(clean()[0], at24)).not.toContain("PROTOCOL VIOLATION");
    const early = record(SONNET, briefs([[26, 0]]), { meta: { startedAt: "2026-11-20T09:59:59.999Z" } });
    expect(violationsOf(report(clean()[0], early))).toHaveLength(1);
  });

  it("a Haiku run that did not end makes the 24 h window a note, not a violation", () => {
    const out = report(record(HAIKU, briefs([[26, 0]]), { status: "running" }), record(SONNET, briefs([[26, 0]])));
    expect(out).not.toContain("PROTOCOL VIOLATION");
    expect(out).toContain(`- Note: cannot verify "${SONNET} started after ${HAIKU}'s end and within 24 h of it"`);
    expect(out).toContain("| cannot verify |");
  });

  it("escapes a backslash and a pipe in a table cell", () => {
    expect(cell("a\\b|c\nd")).toBe("a\\\\b\\|c d");
    const out = report(record(HAIKU, briefs([[26, 0]]), { meta: { argv: ["x\\|y"] } }), null);
    // JSON.stringify writes the backslash as `\\`; the cell escaper then doubles each one and escapes the pipe.
    expect(out).toContain('argv = ["x\\\\\\\\\\|y"] |');
  });
});

describe("t3-analysis: § 6 tables", () => {
  it("labels every § 6 table, prices each arm, and the output is deterministic", () => {
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
    // Dollars per arm at the harness's prices. Haiku ($0.5 / $2.5 per Mtok): 78 calls per arm of
    // 20 in + 10 out = 78 × 35 / 1e6 = $0.00273. Sonnet ($2 / $10): 75 complete-trial calls per
    // arm plus the partial brief's one kept trial = 76 × 140 / 1e6 = $0.01064.
    expect(sec).toContain(`| ${HAIKU} | $0.0027 | $0.0027 |`);
    expect(sec).toContain(`| ${SONNET} | $0.0106 | $0.0106 |`);
  });

  it("a not-run model and attempt 0 have no § 6 rows", () => {
    const out = report(record(HAIKU, briefs([[26, 0]]), { calls: 0 }), null);
    expect(out).toContain("No model has a run to report.");
  });
});
