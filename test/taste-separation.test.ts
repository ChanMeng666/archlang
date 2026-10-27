/**
 * The row-5 law (plan-soundness §7 row 5; ADR 0032; design §4): the taste score separates the
 * corpus's known-bad from its known-good plans MONOTONICALLY — on the comparisons the corpus
 * knows, never as a ranking of unrelated plans.
 *
 * Three sets of pairs, each a weaker plan and its better twin:
 *
 *  - **Set A**: defect-corpus pairs a PS5.1 criterion reads, compared on the OWNING subscore
 *    (zoning = R3, R11, R15; circulation = R14, R16; light = R7, R12). Each row is pinned with its relation; `<`
 *    rows are the pairs the design measured as separated, `=` rows are defects owned by lint
 *    that no taste criterion reads, and `n/a` is a subscore neither twin can judge. No row may
 *    read `>`.
 *  - **Set B**: defect-corpus pairs lint separates (the case warns, the twin is lint-clean),
 *    computed from the corpus, never listed. The twin's total must exceed the case's AND 0.5
 *    (design §4 rule 2: the cap holds the case at or under 0.5, so a twin at or under 0.5 is not
 *    separated by taste). A pair where either fails is a calibration finding, pinned in
 *    {@link LEDGER} with its reason. A pair where nothing is scored on either side is
 *    {@link UNJUDGED}, with its reason, and is never counted as a tie; a pair scored on one side
 *    only fails outright. Both lists are checked both ways, so neither can go stale.
 *  - **Set C**: `test/taste-corpus/`, lint-clean pairs that differ in one taste fact: strict on
 *    the criterion the header names and on the total, both twins asserted lint-clean.
 *
 * The concordance over A ∪ B ∪ C (each pair once) is printed like the defect corpus's catch
 * rate: ordered, tied (only set A's non-strict rows may tie, design §4 rule 4), reversed (with
 * how many are in the ledger) and unjudged, each counted apart. **Reversed = 0** outside the
 * ledger is the acceptance. A moved row is a finding to explain, never a table to edit to green.
 *
 * PS5.1b (the eight remaining criteria) re-read every set: no row of set A moved, one row was
 * added (`bath-via-bedroom` · circulation, `<`: the twin's bath door opens from the living room 600 mm
 * from the bath's corner, so R16 reads 1 of 2 corner doors against the case's 0 of 3; pinned), the ledger EMPTIED
 * (`door-window-overlap-chamfer`'s twin now scores 0.7303 > 0.5: R9 judges its one room 1, which
 * lifts the geometry subscore, while R7 still reads the twin's narrower window as less light,
 * 0.4606 against the case's 0.7677 — the order of the totals is the cap's, not R7's) and two
 * pairs left the UNJUDGED list (`wc-utility-passage`, `wc-window-crossed-by-partition`: R9 now judges their
 * bath/WC, and both twins out-score their capped cases).
 */

import { describe, expect, it } from "vitest";
import { LINT_CODE_LAYERS, lint, taste, type TasteReport, type TasteSubscore } from "../src/index.js";
import { TASTE_CRITERIA } from "../src/taste/criteria.js";
import { defectPairs, type TastePair, tasteCorpusPairs, TASTE_WORLD } from "./taste-sources.js";

type Rel = "<" | "=" | ">" | "n/a";

/** Set A, pinned (design §4 set A). */
const SET_A: ReadonlyArray<[string, TasteSubscore, Rel]> = [
  ["circulation-privacy/two-bed-chain", "zoning", "<"],
  ["circulation-privacy/two-bed-chain", "circulation", "<"],
  ["circulation-privacy/living-via-bedrooms", "zoning", "<"],
  ["circulation-privacy/living-via-bedrooms", "circulation", "<"],
  ["circulation-privacy/entry-into-bedroom", "zoning", "<"],
  // Two rooms in the system: R14 needs three.
  ["circulation-privacy/entry-into-bedroom", "circulation", "n/a"],
  // The defect is a route through a bedroom; equal on R3, which reads depths only.
  ["circulation-privacy/bedroom-via-bedroom", "zoning", "="],
  // The defect is a bath behind a bedroom; R3 reads public-to-bedroom depths only.
  ["circulation-privacy/bath-via-bedroom", "zoning", "="],
  // R16: the twin's bath door, off the living room, sits 600 mm from the bath's corner (R14 is equal).
  ["circulation-privacy/bath-via-bedroom", "circulation", "<"],
  ["daylight/accessible-living-no-window", "light", "<"],
  ["daylight/bedroom-no-window", "light", "<"],
  ["daylight/living-bay-no-window", "light", "<"],
  ["daylight/living-label-no-window", "light", "<"],
];

/**
 * Set B pairs whose twin does not out-score the case, each with its reason. A finding, not an
 * exemption: the reason says why the order is right or what would fix the calibration.
 */
const LEDGER: Readonly<Record<string, string>> = {};

/**
 * Set B pairs nothing in PS5.1 can score on either side, each with its reason: no criterion
 * has anything to read, so the pair says nothing about taste. Listed, never counted as a tie.
 */
const UNJUDGED: Readonly<Record<string, string>> = {
  "clearances/bench-across-opening":
    "a concourse and an unclassified gallery: no classified habitable, wet or kitchen room, and too few rooms for R17",
  "clearances/exit-approach-blocked": "PS2.69 (PR #308): W_EXIT_APPROACH_BLOCKED is validity; neither twin is scored",
  "clearances/garage-door-undersized":
    "B6: W_GARAGE_OPENING_UNDERSIZED is validity, not taste; one garage, so neither twin is scored",
  "clearances/garage-too-shallow": "PS2.70 (PR #307): the depth finding is validity, not taste; neither twin is scored",
  "clearances/single-leaf-2400":
    "one entrance hall: no classified habitable, wet or kitchen room, and too few rooms for R17",
  "openings-ignore-walls/door-jamb-50-from-tee": "a store and an unclassified staff room: no classified habitable room",
  "openings-ignore-walls/door-on-exterior-tee": "two unclassified rooms",
  "openings-ignore-walls/window-overlaps-door": "one unclassified studio",
};

const cache = new Map<string, TasteReport>();
const scoreOf = (name: string, src: string): TasteReport => {
  let r = cache.get(name);
  if (!r) {
    r = taste(src, { world: TASTE_WORLD });
    cache.set(name, r);
  }
  return r;
};

const rel = (a: number | null, b: number | null): Rel =>
  a === null || b === null ? "n/a" : a < b ? "<" : a === b ? "=" : ">";

const PAIRS = defectPairs();
const byName = new Map(PAIRS.map((p) => [p.slug, p]));
/** No VALIDITY-layer warning (ADR 0032): the cap set B leans on reads that layer only, so a pair a
 *  drafting-layer code alone separates (PS2.12's radius pairs) is not lint-separated here. */
const lintClean = (p: TastePair, side: "bad" | "good") =>
  lint(p[side].src, { world: TASTE_WORLD }).every((d) => LINT_CODE_LAYERS[d.code ?? ""] === "drafting");

type Verdict = "ordered" | "tied" | "reversed" | "unjudged";
/** When two sets read one pair, the stronger verdict wins: a reversal anywhere is a reversal. */
const STRENGTH: Record<Verdict, number> = { unjudged: 0, tied: 1, ordered: 2, reversed: 3 };
const verdicts = new Map<string, { verdict: Verdict; sets: string[] }>();
function record(key: string, set: string, v: Verdict): void {
  const prev = verdicts.get(key);
  if (!prev) {
    verdicts.set(key, { verdict: v, sets: [set] });
    return;
  }
  prev.sets.push(set);
  if (STRENGTH[v] > STRENGTH[prev.verdict]) prev.verdict = v;
}

describe("set A: the owning subscore of each pair a criterion reads", () => {
  for (const [slug, sub, want] of SET_A) {
    it(`${slug} · ${sub}: ${want}`, () => {
      const p = byName.get(slug);
      expect(p, `no defect-corpus pair ${slug}`).toBeDefined();
      const got = rel(
        scoreOf(p!.bad.name, p!.bad.src).subscores[sub],
        scoreOf(p!.good.name, p!.good.src).subscores[sub],
      );
      expect(got).toBe(want);
    });
  }

  it("records each pair's verdict over its owning subscores", () => {
    const slugs = [...new Set(SET_A.map(([s]) => s))];
    for (const slug of slugs) {
      const p = byName.get(slug)!;
      const rels = SET_A.filter(([s]) => s === slug).map(([, sub]) =>
        rel(scoreOf(p.bad.name, p.bad.src).subscores[sub], scoreOf(p.good.name, p.good.src).subscores[sub]),
      );
      const v: Verdict = rels.includes(">")
        ? "reversed"
        : rels.includes("<")
          ? "ordered"
          : rels.includes("=")
            ? "tied"
            : "unjudged";
      record(`defect:${slug}`, "A", v);
    }
    expect(slugs.length).toBe(9);
  });
});

describe("set B: pairs lint separates", () => {
  const setB = PAIRS.filter((p) => !lintClean(p, "bad") && lintClean(p, "good"));

  it("is computed from the corpus and not empty", () => {
    expect(setB.length).toBeGreaterThan(20);
  });

  it("the twin's total exceeds the case's and 0.5, except the ledger (both ways); unjudged pairs are listed (both ways)", () => {
    const misses: string[] = [];
    const unjudged: string[] = [];
    const oneSided: string[] = [];
    for (const p of setB) {
      const b = scoreOf(p.bad.name, p.bad.src).score;
      const g = scoreOf(p.good.name, p.good.src).score;
      // The cap holds the case at or under 0.5.
      if (b !== null) expect(b, p.slug).toBeLessThanOrEqual(0.5);
      if (b === null && g === null) {
        unjudged.push(p.slug);
        record(`defect:${p.slug}`, "B", "unjudged");
        continue;
      }
      if (b === null || g === null) {
        // Scored on one side only: the comparison cannot be read, and that is a failure.
        oneSided.push(`${p.slug}: case ${b}, twin ${g}`);
        continue;
      }
      if (!(b < g && g > 0.5)) misses.push(p.slug);
      record(`defect:${p.slug}`, "B", b < g ? "ordered" : b === g ? "tied" : "reversed");
    }
    expect(oneSided, "a set-B pair scored on one side only").toEqual([]);
    expect(misses.sort(), "set-B pairs not separated, against the ledger").toEqual(Object.keys(LEDGER).sort());
    expect(unjudged.sort(), "set-B pairs scored on neither side, against UNJUDGED").toEqual(
      Object.keys(UNJUDGED).sort(),
    );
  }, 300_000);
});

describe("set C: the taste corpus", () => {
  const pairs = tasteCorpusPairs();

  it("has a pair for every PS5.1 criterion", () => {
    expect([...new Set(pairs.map((p) => p.criterion))].sort()).toEqual([...TASTE_CRITERIA.map((c) => c.id)].sort());
  });

  for (const p of pairs) {
    it(`${p.slug} (${p.criterion}): both twins lint clean; strict on the criterion and the total`, () => {
      expect(lint(p.bad.src)).toEqual([]);
      expect(lint(p.good.src)).toEqual([]);
      const b = scoreOf(p.bad.name, p.bad.src);
      const g = scoreOf(p.good.name, p.good.src);
      const cb = b.criteria.find((c) => c.id === p.criterion)!;
      const cg = g.criteria.find((c) => c.id === p.criterion)!;
      expect(rel(cb.score, cg.score)).toBe("<");
      expect(rel(b.score, g.score)).toBe("<");
      record(`taste:${p.slug}`, "C", "ordered");
    });
  }
});

describe("the concordance over A ∪ B ∪ C", () => {
  it("prints ordered / tied / reversed / unjudged; ties come only from set A; nothing outside the ledger is reversed", () => {
    const all = [...verdicts.entries()];
    const count = (v: Verdict) => all.filter(([, x]) => x.verdict === v).length;
    const slug = (k: string) => k.replace(/^defect:/, "");
    const reversed = all.filter(([, x]) => x.verdict === "reversed").map(([k]) => slug(k));
    const unexplained = reversed.filter((k) => !(k in LEDGER));
    const setA = new Set(SET_A.map(([s]) => s));
    const badTies = all.filter(([k, x]) => x.verdict === "tied" && !setA.has(slug(k))).map(([k]) => k);
    console.log(
      `taste concordance (A ∪ B ∪ C): ${all.length} pairs — ${count("ordered")} ordered, ${count("tied")} tied, ` +
        `${count("reversed")} reversed (${reversed.length - unexplained.length} in the ledger), ${count("unjudged")} unjudged`,
    );
    expect(all.length).toBeGreaterThan(30);
    expect(badTies, "a tie outside set A's non-strict rows").toEqual([]);
    expect(unexplained).toEqual([]);
  });
});
