/**
 * The byte-identity law for the **vertical datum layer** (v1.35).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon`, `arc`, `roof` and `void` each have one; this is the
 * heights' — and it is the widest of them, because heights touch more of the compiler than
 * any of those did.
 *
 * ## Why it covers all THIRTY examples, and every storey of each
 *
 * The earlier laws pin four hand-picked plans. That was right for `roof`/`void`, which are
 * new elements nothing else could reach. It is not right here. This change adds a required
 * field to `RWall`, appends four to `Opening`, puts a number on every resolved door,
 * window and cased opening, threads a new value through `ResolveExtras` (and therefore
 * through the resolve MEMO's key), and adds a gated block to `describe()` and to Plan JSON.
 * There is no shipped plan it does not touch, so the corpus is every shipped plan.
 *
 * And every STOREY of each, which the other laws do not do: `compile().svg` is the GROUND
 * floor alone — an upper storey reaches a caller through `pages[]` — so a digest taken over
 * `svg` would leave `townhouse`'s levels 2 and 3 unmeasured, on exactly the feature whose
 * elevation rule is per-storey. {@link allStoreysDigestWith} joins every page.
 *
 * ## The corpus is SPLIT, and that is the point (2026-09-20)
 *
 * As first shipped, this file asserted that every one of the thirty examples authors no
 * `height` — because the law is vacuous for a plan that does use the syntax. That assertion
 * was correct and load-bearing, and it also made the corpus a closed set: **no shipped
 * example could ever demonstrate the headline feature of v1.35, and for a release none
 * did.** The docs claimed a datum that nothing in `examples/` declared, and both committed
 * axonometric renders stood silently on the 3000 mm default.
 *
 * The fix is not to drop the assertion. It is to see that the claim being proved was the
 * WEAKER of the two available:
 *
 *   - *weak*  — a plan that authors NO height is unaffected by the feature existing.
 *   - *strong* — a plan that DOES author heights draws, byte for byte, exactly as the same
 *     plan with its height clauses removed.
 *
 * So the corpus is now two groups and both claims are proved. The no-height group keeps the
 * vacuity guard and the measured `v1.34.0` hashes exactly as they were. The authors-height
 * group ({@link AUTHORS_HEIGHT}) is held to the strong law, whose **two sides are both
 * computable at test time** — it needs no measured baseline, so it cannot go stale and
 * cannot be re-blessed to green a suite. That is a strictly better guard than a frozen hash.
 *
 * ## No baseline row was retired to make room
 *
 * `two-storey`'s `v1.34.0` rows in both tables are still checked, against its **height-free
 * derivation** (`./height-free-source.ts`) rather than against the file as written. The
 * derivation is behaviourally the text that shipped, so the measurement keeps its full
 * force: it still says that everything about that plan other than the datum is where
 * `v1.34.0` left it. Nothing was re-measured, re-typed or dropped.
 *
 * ## If one of these moves
 *
 * It is a finding to explain, never a value to re-bless. A moved digest in the no-height
 * group means the datum leaked into a plan that never asked for it: the most likely
 * culprits, in order, are `describe()`'s gate (`ResolvedPlan._heightsAuthored`), the
 * `Opening` fields reaching a serialized surface, and the resolve memo's `extrasKey`
 * colliding two storeys. A failure in the authors-height group means something worse and
 * simpler — a height moved a drawing, and a plan is a horizontal cut.
 *
 * ## Where the numbers came from
 *
 * They were measured **before a single line of `src/` changed**, on `f4548db` (the tree
 * `v1.34.0` shipped), by a script that imported these very digest bodies from
 * `test/byte-identity-digest.ts` — never a lookalike. That is the lesson
 * `test/roof-void-byte-identity.test.ts` records: its first attempt measured its baseline
 * with a scratch script whose payload separator differed by one character, and reported
 * four "failures" over artifacts that were in fact byte-identical.
 *
 * The measurement is cross-checked against a law that already existed: `studio`,
 * `gallery-l`, `laneway-house` and `aquarium`'s SEMANTIC digests are, character for
 * character, the four in `roof-void-byte-identity.test.ts`'s `SEMANTIC_BASELINE`. Two
 * independently-written callers of one shared body agreeing on four values is what says
 * the body is the sanctioned one.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";
// The two tables moved to a module of their own when `iso-byte-identity.test.ts` began
// making the same corpus-wide claim: one measurement, two laws, no retyped hash.
import { AUTHORS_HEIGHT, BASELINE, SEMANTIC_BASELINE } from "./byte-identity-baseline.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./byte-identity-digest.js";
import { authorsVerticalDatum, heightFreeSource } from "./height-free-source.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const EXAMPLES = resolvePath("examples");

/** A World that reads the examples directory, so the two plans that `import` are covered
 *  by the law rather than quietly skipped — a gate is only as strong as its corpus. */
function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");
const worldOfExamples = worldFor(EXAMPLES);

const authorsHeight = new Set(AUTHORS_HEIGHT);
const shippedExamples = (): string[] =>
  readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".arch"))
    .map((f) => f.replace(/\.arch$/, ""))
    .sort();

/**
 * The text each measured hash is checked against.
 *
 * For a plan that authors nothing this is the file itself, unchanged. For a plan in
 * {@link AUTHORS_HEIGHT} it is the height-free derivation — see the header: the row is
 * honoured, not retired.
 */
const measuredText = (name: string): string => (authorsHeight.has(name) ? heightFreeSource(srcOf(name)) : srcOf(name));

suite("height byte-identity — the corpus, and which half each plan is in", () => {
  it("covers every shipped example — the corpus cannot silently shrink", () => {
    const shipped = shippedExamples();
    expect(BASELINE.map(([n]) => n).sort()).toEqual(shipped);
    expect(SEMANTIC_BASELINE.map(([n]) => n).sort()).toEqual(shipped);
  });

  it("the authors-height group is a real subset of it, and is NOT empty", () => {
    // An empty group would make the strong law below vacuous — the exact defect this split
    // exists to remove, so it is asserted rather than assumed.
    expect(AUTHORS_HEIGHT.length).toBeGreaterThan(0);
    expect(new Set(AUTHORS_HEIGHT).size).toBe(AUTHORS_HEIGHT.length);
    expect([...AUTHORS_HEIGHT].sort()).toEqual([...AUTHORS_HEIGHT].filter((n) => shippedExamples().includes(n)).sort());
  });

  it("the declared split matches a scan of the sources, in BOTH directions", () => {
    // `AUTHORS_HEIGHT` is a declaration of intent; this is the check that it is true. A
    // plan that quietly grows a `height` without being named there fails here, and so does
    // a name there whose plan authors nothing.
    const scanned = shippedExamples()
      .filter((n) => authorsVerticalDatum(srcOf(n)))
      .sort();
    expect(scanned).toEqual([...AUTHORS_HEIGHT].sort());
  });
});

suite("height byte-identity — a plan that writes NO height is unchanged everywhere", () => {
  for (const [name, sha] of BASELINE) {
    const label = authorsHeight.has(name) ? `${name}.arch, with its heights removed,` : `${name}.arch`;
    it(`${label} renders, describes and lints exactly as on v1.34.0 — every storey`, () => {
      expect(allStoreysDigestWith(API, measuredText(name), { world: worldOfExamples })).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    const label = authorsHeight.has(name) ? `${name}.arch, with its heights removed,` : `${name}.arch`;
    it(`${label}'s SUMMARY (describe + lint, no drawing) is unchanged`, () => {
      expect(semanticDigestWith(API, measuredText(name), { world: worldOfExamples })).toBe(sha);
    });
  }
});

/**
 * The stronger half: a plan that DOES author the datum draws identically to itself without
 * it. Both sides are computed here — there is no hash in this suite, by design.
 */
suite("height byte-identity — a plan that DOES write heights draws identically", () => {
  for (const name of AUTHORS_HEIGHT) {
    const src = srcOf(name);
    const free = heightFreeSource(src);

    it(`${name}.arch: the derivation really removes the datum and really changes something`, () => {
      // The non-vacuity guard. A derivation that silently became a no-op would make every
      // assertion below trivially true; this is what stops that.
      expect(authorsVerticalDatum(src), `${name}.arch is listed as authoring heights but writes none`).toBe(true);
      expect(free, "the height-free derivation is a no-op — the law below would be vacuous").not.toBe(src);
      expect(authorsVerticalDatum(free), "the derivation left a vertical clause behind").toBe(false);
    });

    it(`${name}.arch: every storey's DRAWING is byte-identical to the height-free plan`, () => {
      // The claim in one line: a plan is a horizontal cut, so a vertical fact moves no byte
      // of it. Every page, not just the ground floor.
      const withH = compile(src, { world: worldOfExamples, noCache: true });
      const without = compile(free, { world: worldOfExamples, noCache: true });
      const pages = (o: typeof withH): string[] => (o.pages ? o.pages.map((p) => p.svg) : [o.svg]);
      expect(withH.errors).toEqual(without.errors);
      expect(pages(withH)).toEqual(pages(without));
    });

    it(`${name}.arch: lint() is unmoved — the datum is not a soundness fact`, () => {
      expect(lint(src, { world: worldOfExamples })).toEqual(lint(free, { world: worldOfExamples }));
    });

    it(`${name}.arch: describe() differs by the datum keys and by NOTHING else`, () => {
      // The sharp version of "only the reported datum changed": strip the block the feature
      // adds and the bounds it puts on each opening, and what is left must equal the
      // height-free summary key for key. An area that moved, a room that vanished or a
      // reordered array all fail here.
      const authored = withoutDatumKeys(describePlan(src, { world: worldOfExamples }));
      expect(authored).toEqual(describePlan(free, { world: worldOfExamples }));
    });
  }
});

/**
 * Remove exactly what authoring the datum ADDS to a summary: the `heights` block (at the
 * plan and on every level) and the `sill`/`head` an opening reports once the plan is
 * height-authoring. Scoped to the three opening arrays rather than deleting those key names
 * anywhere, so a `head`/`sill` appearing somewhere new is a failure rather than a silent
 * exemption.
 */
function withoutDatumKeys(summary: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;
  const scrub = (node: Record<string, unknown>): void => {
    delete node.heights;
    for (const key of ["doors", "windows", "openings"]) {
      const arr = node[key];
      if (!Array.isArray(arr)) continue;
      for (const el of arr as Record<string, unknown>[]) {
        delete el.sill;
        delete el.head;
      }
    }
    if (Array.isArray(node.levels)) for (const lvl of node.levels as Record<string, unknown>[]) scrub(lvl);
  };
  scrub(clone);
  return clone;
}

/** The other half of the claim: the datum is really THERE, it just is not reported. */
suite("height byte-identity — the datum exists even when the summary hides it", () => {
  it("every wall of a silent plan resolved to the 3000 default", async () => {
    const { resolve: resolvePlan } = await import("../src/ir.js");
    const { parse } = await import("../src/parser.js");
    const { ir } = resolvePlan(parse(srcOf("studio")).plan!);
    expect(ir.storeyHeight).toBe(3000);
    expect(ir.elevation).toBe(0);
    expect(ir._heightsAuthored).toBe(false);
    expect(ir.walls.map((w) => w.height)).toEqual(ir.walls.map(() => 3000));
    // …and none of it reaches the summary, which is the whole point.
    expect(describePlan(srcOf("studio")).heights).toBeUndefined();
  });

  it("and a plan that authors one reports it, accumulating rather than multiplying", () => {
    // The counterpart to the test above, and the reason a shipped example had to gain
    // heights at all: the gate has two sides and only one of them used to be exercised by
    // a file a reader can open. `two-storey.arch` writes `height 2700` for the plan and
    // `height 3000` on level 2, so the first floor sits at 2700 — the storey below it —
    // and NOT at 2 x 3000, which is the arithmetic `spec.llm.md` warns against.
    const summary = describePlan(srcOf("two-storey"), { world: worldOfExamples });
    expect(summary.heights?.storey_height).toBe(2700);
    expect(summary.heights?.elevation).toBe(0);
    const upper = summary.levels?.find((l) => l.level === 2);
    expect(upper?.heights?.storey_height).toBe(3000);
    expect(upper?.heights?.elevation).toBe(2700);
    // An authored bound and a defaulted one coexist on the same storey, and on the same
    // opening: `w_bath` writes only a sill, so its head is still the 2100 default.
    const bath = upper?.windows?.find((w) => w.id === "w_bath");
    expect([bath?.sill, bath?.head]).toEqual([1500, 2100]);
    const bed1 = upper?.windows?.find((w) => w.id === "w_bed1");
    expect([bed1?.sill, bed1?.head]).toEqual([900, 2100]);
  });
});
