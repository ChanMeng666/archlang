/** public check set: every case judged; both columns derived from their sources. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type LintRuleset, LINT_PROFILE_NAMES, LINT_PROFILES, lint, lintReport } from "../src/index.js";
import { effectiveRuleset, RULE_PROVENANCE, type VerificationGrade } from "../src/lint/provenance.js";
import { isTable } from "../src/lint/rule-ref.js";
import { type CheckCase, judge, type LintDoc, loadCases } from "./check-set/run.mjs";

/**
 * The public check set (`test/check-set/`, card CR10 of `docs/plans/product-roadmap/cards.md`): its
 * cases are listed in `check-set.json`, and each one is a plan that must report one code and a twin
 * that must not. This file judges every case with the runner's own {@link judge} against
 * `lintReport`, the document `arch lint --json` and the hosted `POST /check` print, and holds both
 * columns of the manifest to what they are derived from:
 *
 * - **default**: one case per code the defect corpus (`test/defect-corpus/`) reports as `done`,
 *   the first such case in path order whose code still fires when every number of the default
 *   ruleset graded `S-secondary` or `M` in the provenance table (`src/lint/provenance.ts`) is turned
 *   off (`null`; a number that cannot be `null` set to 0, its no-minimum value). A code no case
 *   reports that way is left out: its report rests on a number only a paraphrase or a magazine gives
 *   (product-roadmap README principle 10: only `V` and `S-full` numbers go into a public fixture).
 * - **cross-jurisdiction**: each case runs under a built-in profile and names the ruleset key that
 *   decides it. That key's row in the provenance table is `V` or `S-full`, the profile itself sets
 *   it to a value the default does not have (so the column never puts a rule in the default
 *   ruleset), the default ruleset does not report the case, the profile's `V` and `S-full` numbers
 *   alone do, and they no longer do without that key.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "defect-corpus");
const STRONG: readonly VerificationGrade[] = ["V", "S-full"];

const CASES: CheckCase[] = loadCases();
const DEFAULT_ROWS = CASES.filter((c) => c.column === "default");
const CROSS_ROWS = CASES.filter((c) => c.column === "cross-jurisdiction");
const read = (p: string) => readFileSync(p, "utf8");
const codes = (src: string, opts: Parameters<typeof lint>[1] = {}) => new Set(lint(src, opts).map((d) => d.code));

/** A plan with nothing in it, to ask the ruleset check alone whether a value is accepted. */
const EMPTY = 'plan "Empty" {\n}\n';
const refused = (ruleset: Partial<LintRuleset>) => lint(EMPTY, { ruleset }).some((d) => d.code === "E_RULESET_VALUE");

describe("the manifest", () => {
  it("lists distinct cases, each a plan and its twin on disk, in one of the two columns", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(DEFAULT_ROWS.length).toBeGreaterThan(0);
    expect(CROSS_ROWS.length).toBeGreaterThan(0);
    expect(DEFAULT_ROWS.length + CROSS_ROWS.length).toBe(CASES.length);
    for (const c of CASES) {
      expect(existsSync(c.planPath), c.plan).toBe(true);
      expect(c.twin, c.id).toBe(c.plan.replace(/\.arch$/, ".clean.arch"));
      expect(existsSync(c.twinPath), c.twin).toBe(true);
      if (c.column === "default") expect([c.profile, c.rule], c.id).toEqual([null, null]);
      else {
        expect(LINT_PROFILE_NAMES, c.id).toContain(c.profile);
        expect(typeof c.rule, c.id).toBe("string");
      }
    }
  });

  it("names every cross-jurisdiction plan in its folder, and nothing else is there", () => {
    const dir = join(HERE, "check-set", "cross-jurisdiction");
    const listed = CROSS_ROWS.flatMap((c) => [c.planPath, c.twinPath]).sort();
    const onDisk = readdirSync(dir)
      .map((f) => join(dir, f))
      .sort();
    expect(onDisk).toEqual(listed);
  });
});

describe("every case passes", () => {
  for (const row of CASES) {
    it(row.id, () => {
      const profile = row.profile ?? undefined;
      const plan = lintReport(read(row.planPath), { profile });
      const twin = lintReport(read(row.twinPath), { profile });
      expect(judge(row, plan, twin)).toEqual([]);
    });
  }

  it("the judge fails a case on each thing it checks", () => {
    const row = { expect: "W_X", rule: "k", profile: "p" };
    const doc = (...ds: LintDoc["diagnostics"][number][]): LintDoc => ({ diagnostics: ds });
    const hit = { code: "W_X", severity: "warning" };
    expect(judge(row, doc(hit), doc())).toEqual([]);
    expect(judge(row, doc(), doc())).toEqual(["the plan does not report W_X"]);
    expect(judge(row, doc(hit), doc(hit))).toEqual(["the twin reports W_X"]);
    expect(judge(row, doc(hit, { code: "E_PARSE", severity: "error" }), doc())).toEqual([
      "the plan does not compile: E_PARSE",
    ]);
    expect(judge(row, doc(hit), doc({ code: "E_PARSE", severity: "error" }))).toEqual([
      "the twin does not compile: E_PARSE",
    ]);
    expect(judge(row, doc({ ...hit, rule: { key: "j", profile: "q" } }), doc())).toEqual([
      "W_X cites j, not k",
      "W_X cites profile q, not p",
    ]);
  });
});

describe("the default column is derived from the defect corpus", () => {
  /** Every number of the default ruleset that only a paraphrase or a magazine gives, turned off. */
  const weakKeys = Object.entries(RULE_PROVENANCE.defaults)
    .filter(([, p]) => p.verification === "S-secondary" || p.verification === "M")
    .map(([k]) => k);
  const neutral: Record<string, number | null> = Object.fromEntries(
    weakKeys.map((k) => [k, refused({ [k]: null } as Partial<LintRuleset>) ? 0 : null]),
  );

  it("turns off each weak number with a value the ruleset accepts", () => {
    expect(weakKeys.length).toBeGreaterThan(0);
    // A per-use table entry would need its table rebuilt; none is weak in the defaults today.
    for (const k of weakKeys) expect(k, "a scalar key").not.toContain(".");
    expect(refused(neutral as Partial<LintRuleset>)).toBe(false);
  });

  it("holds one case per corpus code, the first that does not rest on a weak number", () => {
    const picks = new Map<string, string>();
    const left = new Set<string>();
    for (const cls of readdirSync(CORPUS)
      .filter((d) => statSync(join(CORPUS, d)).isDirectory())
      .sort()) {
      for (const f of readdirSync(join(CORPUS, cls)).sort()) {
        if (!f.endsWith(".arch") || f.endsWith(".clean.arch")) continue;
        const src = read(join(CORPUS, cls, f));
        if (!/^# status: done\r?$/m.test(src)) continue;
        const code = /^# expect: (\S+)/m.exec(src)![1]!;
        if (picks.has(code)) continue;
        if (codes(src, { ruleset: neutral as Partial<LintRuleset> }).has(code)) {
          picks.set(code, `${cls}/${f.replace(/\.arch$/, "")}`);
          left.delete(code);
        } else left.add(code);
      }
    }
    const derived = [...picks]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([code, id]) => ({ id, expect: code, plan: `../defect-corpus/${id}.arch` }));
    expect(
      DEFAULT_ROWS.map((r) => ({ id: r.id, expect: r.expect, plan: r.plan })),
      "test/check-set/check-set.json's default rows, in code order: add, drop or move the row this names",
    ).toEqual(derived);
    // The codes left out, each because every case of it rests on a weak number (printed for the PR).
    console.log(`check set: ${derived.length} default cases; left out (weak numbers only): ${[...left].join(", ")}`);
  }, 60_000);
});

describe("the cross-jurisdiction column uses only V and S-full numbers, under a profile", () => {
  /** The profile's own numbers graded V or S-full, as a ruleset, without `drop`. */
  function strongRows(profile: string, drop?: string): Partial<LintRuleset> {
    const rows = RULE_PROVENANCE.profiles[profile]!;
    const strong = (key: string) => key !== drop && STRONG.includes(rows[key]!.verification);
    const out: Record<string, unknown> = {};
    for (const [field, v] of Object.entries(LINT_PROFILES[profile]!)) {
      if (isTable(v)) {
        const kept = Object.entries(v).filter(([use]) => strong(`${field}.${use}`));
        if (kept.length) out[field] = Object.fromEntries(kept);
      } else if (strong(field)) out[field] = v;
    }
    return out as Partial<LintRuleset>;
  }

  it("leaves out every profile with no V or S-full number (us-residential-advisory today)", () => {
    const weakOnly = LINT_PROFILE_NAMES.filter(
      (p) => !Object.values(RULE_PROVENANCE.profiles[p] ?? {}).some((r) => STRONG.includes(r.verification)),
    );
    expect(weakOnly).toContain("us-residential-advisory");
    for (const c of CROSS_ROWS) expect(weakOnly, c.id).not.toContain(c.profile);
  });

  for (const row of CROSS_ROWS) {
    it(row.id, () => {
      const profile = row.profile!;
      const key = row.rule!;
      // The deciding number: graded V or S-full, and the profile's own, not the default's.
      expect(STRONG, `${profile} ${key}`).toContain(RULE_PROVENANCE.profiles[profile]![key]?.verification);
      const own = effectiveRuleset(profile).rules.find((r) => r.key === key);
      const dflt = effectiveRuleset().rules.find((r) => r.key === key);
      expect(own?.from, `${key} is set by ${profile}`).toBe(profile);
      expect(own?.value, `${key} under ${profile} differs from the default`).not.toEqual(dflt?.value);
      const plan = read(row.planPath);
      const twin = read(row.twinPath);
      expect(codes(plan).has(row.expect), "the default ruleset does not report it").toBe(false);
      expect(codes(plan, { ruleset: strongRows(profile) }).has(row.expect), "the strong numbers report it").toBe(true);
      expect(codes(twin, { ruleset: strongRows(profile) }).has(row.expect), "nor its twin").toBe(false);
      expect(codes(plan, { ruleset: strongRows(profile, key) }).has(row.expect), `not without ${key}`).toBe(false);
    });
  }
});
