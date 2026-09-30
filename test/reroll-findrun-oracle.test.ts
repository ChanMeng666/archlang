/**
 * `findRun` (`src/reroll.ts`) went from a shrinking search — try every length from the
 * maximal same-kind window down to 3, re-running `collectSlots` over the whole prefix each
 * time, cubic on a long NON-progression window — to one forward pass that extends the run a
 * statement at a time and stops at the first failure. The contract is EQUALITY with the old
 * function on every input, not the argument in `findRun`'s docstring; this file pins it.
 *
 *  - The ORACLE below is the old `findRun` and every private helper it calls, copied
 *    VERBATIM from `src/reroll.ts` as it stood before the change. Never "fix" it to match
 *    the new code — a red here means the new `findRun` moved, which is the finding.
 *  - Equality is asserted at EVERY start index of every statement list, over (a) parsed
 *    sources mixing kinds, explicit ids, progression / non-progression / constant numeric
 *    slots (float steps included), varying and constant labels, comments and `zone`
 *    nesting, and (b) synthetic statement-shaped trees that reach corners the parser never
 *    emits (NaN, ±Infinity, −0, differing key sets, array lengths, non-num leaves).
 *  - The two lemmas the forward pass relies on — `collectSlots` decomposes into pairs
 *    against the first statement, and `isArithmeticProgression` is prefix-closed — are
 *    stated directly against the exported functions.
 *  - Finally `reroll()` end to end: the whole pipeline run with the new finder and with the
 *    oracle (`rerollWith`) must offer identical suggestions.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PlanNode, Statement } from "../src/ast.js";
import { statementBodies } from "../src/cursor.js";
import { reroll } from "../src/index.js";
import { parse } from "../src/parser.js";
import {
  collectSlots as newCollectSlots,
  findRun as newFindRun,
  isArithmeticProgression as newIsArithmeticProgression,
  rerollWith,
} from "../src/reroll.js";

// ======================================================================================
// ORACLE — verbatim from src/reroll.ts before the linear findRun (feat/math-robustness
// 297eb6b). Do not edit.
// ======================================================================================

const BLOCK_KINDS = new Set<Statement["kind"]>(["for", "if", "while", "level", "zone"]);

// ---- generic, span-blind structural diff over a run of statements --------

/** Any key never compared for equality: byte spans (and their many `…Span`
 *  siblings) and the source LINE number — everything the parser records for
 *  diagnostics, none of it semantic to what a statement DRAWS. */
function skipKey(k: string): boolean {
  return k === "span" || k === "line" || k.endsWith("Span");
}

function isExprNum(v: unknown): v is { t: "num"; value: number } {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as { t?: unknown }).t === "num" &&
    typeof (v as { value?: unknown }).value === "number"
  );
}

function isExprStr(v: unknown): v is { t: "str" } {
  return v !== null && typeof v === "object" && (v as { t?: unknown }).t === "str";
}

function stripKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (skipKey(k)) continue;
      out[k] = stripKeys(val);
    }
    return out;
  }
  return v;
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Walk `nodes` (one value per statement in a candidate run) in lockstep, driven
 * by `nodes[0]`'s own key order (so a caller re-walking the template alone in
 * the same order — {@link buildReplacement} — sees the same slot sequence).
 * Pushes one entry per matched numeric-literal slot (`Expr { t: "num" }`), each
 * entry the slot's value across the whole run, in run order — EVERY numeric
 * slot, constant or varying: the `isExprNum` branch is checked before any
 * reference/primitive shortcut, so a constant literal is recorded the same way
 * a varying one is, and {@link buildReplacement}'s identical ordering (it also
 * checks `isExprNum` first) stays in lockstep BY CONSTRUCTION rather than by
 * the two traversals happening to agree. Returns `null` the moment the
 * statements are NOT the same shape modulo numeric literals: a differing key
 * set, a differing non-numeric primitive, or a differing string (a `str`
 * `Expr` is opaque — required byte-for-byte, per v1).
 */
function collectSlots(nodes: unknown[]): number[][] | null {
  const slots: number[][] = [];
  function visit(vs: unknown[]): boolean {
    const v0 = vs[0];
    if (isExprNum(v0)) {
      if (!vs.every(isExprNum)) return false;
      slots.push(vs.map((v) => (v as { value: number }).value));
      return true;
    }
    if (isExprStr(v0)) {
      const s0 = stripKeys(v0);
      return vs.every((v) => isExprStr(v) && deepEqual(stripKeys(v), s0));
    }
    if (Array.isArray(v0)) {
      if (!vs.every((v) => Array.isArray(v) && v.length === v0.length)) return false;
      for (let i = 0; i < v0.length; i++) if (!visit(vs.map((v) => (v as unknown[])[i]))) return false;
      return true;
    }
    if (v0 !== null && typeof v0 === "object") {
      if (!vs.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) return false;
      const keys = Object.keys(v0 as object).filter((k) => !skipKey(k));
      for (const v of vs.slice(1)) {
        const vk = new Set(Object.keys(v as object).filter((k) => !skipKey(k)));
        if (vk.size !== keys.length || !keys.every((k) => vk.has(k))) return false;
      }
      for (const k of keys) if (!visit(vs.map((v) => (v as Record<string, unknown>)[k]))) return false;
      return true;
    }
    // A true primitive (string/number/boolean/undefined) — never a `num`/`str`
    // Expr node (those are handled above), so this must be exactly equal.
    return vs.every((v) => v === v0);
  }
  return visit(nodes) ? slots : null;
}

/** EXACT binary arithmetic progression: `vals[0] + j*d === vals[j]` for every
 *  `j`, no rounding. A progression that only agrees once printed (`100.1,
 *  100.2, 100.3` — IEEE-754 doubles a fraction of a unit apart) is refused: the
 *  substituted `a + loopVar*d` expression must reproduce the exact `scene`
 *  values the literals did, not merely their displayed form. */
function isArithmeticProgression(vals: number[]): boolean {
  if (vals.every((v) => v === vals[0])) return true; // constant — trivially fine, not "differing"
  const d = vals[1]! - vals[0]!;
  for (let j = 0; j < vals.length; j++) {
    if (vals[0]! + j * d !== vals[j]!) return false;
  }
  return true;
}

// ---- run detection (cheap: no compile) -------------------------------------

function isEligible(s: Statement): boolean {
  return !BLOCK_KINDS.has(s.kind) && s.kind !== "error" && "id" in s && s.id === "";
}

interface RunFound {
  length: number;
  slots: number[][];
}

/** The longest AP-valid, structurally-uniform run starting exactly at `start`
 *  (trimming from the tail when the maximal structural match's progression
 *  breaks partway through), or `null` if none of length ≥ 3 qualifies. */
function findRun(stmts: Statement[], start: number): RunFound | null {
  const first = stmts[start]!;
  if (!isEligible(first)) return null;
  let end = start + 1;
  while (end < stmts.length && isEligible(stmts[end]!) && stmts[end]!.kind === first.kind) end++;
  for (let len = end - start; len >= 3; len--) {
    const slots = collectSlots(stmts.slice(start, start + len));
    if (slots?.every(isArithmeticProgression)) return { length: len, slots };
  }
  return null;
}

// ======================================================================================
// end of ORACLE
// ======================================================================================

const oracleFindRun = findRun;

/** Every statement list in a plan: the body, every nested body, every component body. */
function statementLists(plan: PlanNode): Statement[][] {
  const out: Statement[][] = [];
  const visit = (stmts: Statement[]): void => {
    out.push(stmts);
    for (const s of stmts) for (const body of statementBodies(s)) visit(body);
  };
  visit(plan.body);
  for (const comp of plan.components.values()) visit(comp.body);
  return out;
}

// ---- (a) parsed sources ---------------------------------------------------------------

const MAX_RUN = 12;
const MAX_STATEMENTS = 60;

/** How one numeric field varies along a generated segment. `apBreak` is a progression
 *  with one bumped value — the case where the old search had to shrink from the window. */
type Mode =
  | { m: "const" }
  | { m: "ap"; step: number }
  | { m: "apBreak"; step: number; at: number; bump: number }
  | { m: "rand"; vals: number[] };

const modeOf = (steps: number[]): fc.Arbitrary<Mode> =>
  fc.oneof(
    fc.constant<Mode>({ m: "const" }),
    fc.constantFrom(...steps).map((step): Mode => ({ m: "ap", step })),
    fc
      .record({
        step: fc.constantFrom(...steps),
        at: fc.integer({ min: 1, max: MAX_RUN - 1 }),
        bump: fc.constantFrom(1, 7, 0.5),
      })
      .map(({ step, at, bump }): Mode => ({ m: "apBreak", step, at, bump })),
    fc
      .array(fc.integer({ min: 0, max: 4000 }), { minLength: MAX_RUN, maxLength: MAX_RUN })
      .map((vals): Mode => ({ m: "rand", vals })),
    fc
      .array(fc.integer({ min: 0, max: 40 }), { minLength: MAX_RUN, maxLength: MAX_RUN })
      .map((vals): Mode => ({ m: "rand", vals: vals.map((v) => v / 10) })),
  );

const posMode = modeOf([1, 100, -100, 1000, 0.1, -0.1, 0.25, 1.5, 333.3]);
const sizeMode = modeOf([1, 50, 100, 0.1, 0.25]);

function valueAt(mode: Mode, base: number, k: number): number {
  switch (mode.m) {
    case "const":
      return base;
    case "ap":
      return base + k * mode.step;
    case "apBreak":
      return base + k * mode.step + (k === mode.at ? mode.bump : 0);
    case "rand":
      return base + mode.vals[k]!;
  }
}

const segment = fc.record({
  kind: fc.constantFrom("room", "room", "column", "furniture", "dim"),
  count: fc.integer({ min: 1, max: MAX_RUN }),
  x: posMode,
  y: posMode,
  w: sizeMode,
  h: sizeMode,
  bx: fc.integer({ min: 2000, max: 6000 }),
  by: fc.integer({ min: 2000, max: 6000 }),
  bw: fc.integer({ min: 200, max: 3000 }),
  bh: fc.integer({ min: 200, max: 3000 }),
  label: fc.constantFrom<string | null>(null, "R", "Hall"),
  labelVaryAt: fc.option(fc.nat(MAX_RUN - 1), { nil: undefined }),
  idAt: fc.option(fc.nat(MAX_RUN - 1), { nil: undefined }),
  commentAt: fc.option(fc.nat(MAX_RUN - 1), { nil: undefined }),
  trailAt: fc.option(fc.nat(MAX_RUN - 1), { nil: undefined }),
  zone: fc.constantFrom(false, false, false, true),
});
type Segment = typeof segment extends fc.Arbitrary<infer T> ? T : never;

function renderSource(segments: Segment[]): string {
  const lines = ['plan "Oracle" {', "  units mm"];
  let emitted = 0;
  segments.forEach((seg, si) => {
    const pad = seg.zone ? "    " : "  ";
    if (seg.zone) lines.push(`  zone z${si} {`);
    for (let k = 0; k < seg.count && emitted < MAX_STATEMENTS; k++, emitted++) {
      const x = valueAt(seg.x, seg.bx, k);
      const y = valueAt(seg.y, seg.by, k);
      const w = valueAt(seg.w, seg.bw, k);
      const h = valueAt(seg.h, seg.bh, k);
      const id = seg.idAt === k ? ` id=s${si}_${k}` : "";
      const labelText = seg.labelVaryAt === k ? "Other" : seg.label;
      const label = labelText === null ? "" : ` label "${labelText}"`;
      if (seg.commentAt === k) lines.push(`${pad}# note ${si}.${k}`);
      let stmt: string;
      if (seg.kind === "room") stmt = `room${id} at (${x},${y}) size ${w}x${h}${label}`;
      else if (seg.kind === "column") stmt = `column${id} at (${x},${y}) size ${w}x${h}`;
      else if (seg.kind === "furniture") stmt = `furniture${id} bed at (${x},${y}) size ${w}x${h}${label}`;
      else stmt = `dim (${x},${y})->(${x + w},${y}) offset ${h}`;
      lines.push(`${pad}${stmt}${seg.trailAt === k ? ` # trailing ${si}.${k}` : ""}`);
    }
    if (seg.zone) lines.push("  }");
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}

const archSource = fc.array(segment, { minLength: 1, maxLength: 8 }).map(renderSource);

// ---- (b) synthetic statement-shaped trees ------------------------------------------------

/** A numeric leaf value, weighted toward the corners the parser never produces. */
const numValue = fc.oneof(
  fc.integer({ min: -5, max: 5 }),
  fc.constantFrom(
    0,
    -0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.1,
    0.2,
    0.3,
    0.7,
    1e-17,
    2 ** 53,
    1e308,
    5e-324,
  ),
  fc.double(),
);

/**
 * How one numeric hole varies along a synthetic run. Each mode aims at a way the
 * forward pass could drift from the old `isArithmeticProgression` call:
 *  - `ap` (`v + i*d`, raw) and `exact` (`v + i*d'` with `d' = (v+d) − v`, which the old
 *    check accepts by construction) against `accum` (`v, v+d, (v+d)+d, …`) — so
 *    "`v0 + j*d`" and "previous + d" disagree somewhere;
 *  - `jump` (`v, w, w, …`) — `[1, ∞, ∞]` passes every term but `j = 0` (`0 * ∞` is NaN);
 *  - `const` with NaN / ±0 — `===`, not `Object.is`, decides "constant".
 */
type HoleMode =
  | { m: "const"; v: number }
  | { m: "ap"; v: number; d: number }
  | { m: "exact"; v: number; d: number }
  | { m: "accum"; v: number; d: number }
  | { m: "jump"; v: number; w: number }
  | { m: "list"; vals: number[] };
const vd = fc.oneof(
  fc.record({ v: numValue, d: numValue }),
  fc.record({ v: fc.integer({ min: -3, max: 3 }), d: fc.integer({ min: -3, max: 3 }) }),
  fc.record({ v: fc.integer({ min: -2000, max: 6000 }), d: fc.constantFrom(0.1, 0.2, 0.3, 0.7, 1.1, 333.3, -0.1) }),
);
const holeMode: fc.Arbitrary<HoleMode> = fc.oneof(
  numValue.map((v): HoleMode => ({ m: "const", v })),
  fc.constantFrom(Number.NaN, 0, -0).map((v): HoleMode => ({ m: "const", v })),
  vd.map(({ v, d }): HoleMode => ({ m: "ap", v, d })),
  vd.map(({ v, d }): HoleMode => ({ m: "exact", v, d })),
  vd.map(({ v, d }): HoleMode => ({ m: "accum", v, d })),
  fc.record({ v: numValue, w: numValue }).map(({ v, w }): HoleMode => ({ m: "jump", v, w })),
  fc.array(numValue, { minLength: 16, maxLength: 16 }).map((vals): HoleMode => ({ m: "list", vals })),
);

const HOLE = Symbol("hole");
const { node: templateNode } = fc.letrec<{ node: unknown }>((tie) => ({
  node: fc.oneof(
    { maxDepth: 3 },
    fc.constant(HOLE),
    fc.constant(HOLE),
    fc.record({ t: fc.constant("str"), value: fc.constantFrom("a", "b"), span: fc.constant({ start: 0, end: 1 }) }),
    fc.constantFrom<unknown>(1, "x", true, null, undefined, Number.NaN),
    fc.array(tie("node"), { maxLength: 3 }),
    fc.dictionary(fc.constantFrom("a", "b", "c", "lineSpan", "line"), tie("node"), { maxKeys: 3 }),
  ),
}));

type Perturb = { op: "drop" | "add" | "str" | "prim" | "num"; at: number };
/** Mostly clean statements, so runs of ≥ 3 are common; one in seven is perturbed. */
const perturb = fc.oneof(
  { arbitrary: fc.constant(undefined), weight: 6 },
  {
    arbitrary: fc.record({ op: fc.constantFrom<Perturb["op"]>("drop", "add", "str", "prim", "num"), at: fc.nat() }),
    weight: 1,
  },
);

function holeValue(mode: HoleMode, i: number): number {
  switch (mode.m) {
    case "const":
      return mode.v;
    case "ap":
      return mode.v + i * mode.d;
    case "exact": {
      const d = mode.v + mode.d - mode.v;
      return i === 0 ? mode.v : mode.v + i * d;
    }
    case "accum": {
      let x = mode.v;
      for (let j = 0; j < i; j++) x += mode.d;
      return x;
    }
    case "jump":
      return i === 0 ? mode.v : mode.w;
    case "list":
      return mode.vals[i % mode.vals.length]!;
  }
}

/** Statement `i` of a synthetic run: the template with every hole filled by its mode. */
function instantiate(template: unknown, modes: HoleMode[], i: number): unknown {
  let hole = 0;
  const build = (n: unknown): unknown => {
    if (n === HOLE) return { t: "num", value: holeValue(modes[hole++ % modes.length]!, i), span: { start: i, end: i } };
    if (Array.isArray(n)) return n.map(build);
    if (n !== null && typeof n === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n)) out[k] = build(v);
      return out;
    }
    return n;
  };
  return build(template);
}

/** Apply one structural perturbation at the `at`-th container of `root` (DFS order). */
function applyPerturb(root: Record<string, unknown>, p: Perturb): void {
  const containers: (Record<string, unknown> | unknown[])[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      containers.push(n);
      n.forEach(walk);
    } else if (n !== null && typeof n === "object") {
      containers.push(n as Record<string, unknown>);
      Object.values(n).forEach(walk);
    }
  };
  walk(root);
  const target = containers[p.at % containers.length]!;
  const replacement: Record<Perturb["op"], unknown> = {
    drop: undefined,
    add: 1,
    str: { t: "str", value: "q" },
    prim: 7,
    num: { t: "num", value: 42 },
  };
  if (Array.isArray(target)) {
    if (p.op === "drop") target.pop();
    else if (p.op === "add") target.push(1);
    else if (target.length > 0) target[0] = replacement[p.op];
  } else {
    const keys = Object.keys(target);
    if (p.op === "drop") {
      if (keys.length > 0) delete target[keys[0]!];
    } else if (p.op === "add") target.zz = 1;
    else if (keys.length > 0) target[keys[0]!] = replacement[p.op];
  }
}

const syntheticList: fc.Arbitrary<Statement[]> = fc
  .record({
    template: templateNode,
    modes: fc.array(holeMode, { minLength: 1, maxLength: 6 }),
    stmts: fc.array(
      fc.record({
        kind: fc.oneof(
          { arbitrary: fc.constant("room"), weight: 12 },
          { arbitrary: fc.constantFrom("column", "for", "error"), weight: 1 },
        ),
        id: fc.oneof({ arbitrary: fc.constant(""), weight: 12 }, { arbitrary: fc.constant("x"), weight: 1 }),
        perturb,
      }),
      { minLength: 1, maxLength: 16 },
    ),
  })
  .map(({ template, modes, stmts }) =>
    stmts.map(({ kind, id, perturb: p }, i) => {
      const s: Record<string, unknown> = {
        kind,
        id,
        span: { start: i, end: i + 1 },
        body: instantiate(template, modes, i),
      };
      if (p) applyPerturb(s, p);
      return s as unknown as Statement;
    }),
  );

// ---- the properties -------------------------------------------------------------------

describe("findRun — linear forward pass equals the old shrinking search", () => {
  it("parsed sources: equal at every start index of every statement list", () => {
    let found = 0;
    let trimmed = 0;
    fc.assert(
      fc.property(archSource, (src) => {
        const { plan } = parse(src);
        expect(plan).toBeDefined();
        for (const stmts of statementLists(plan!)) {
          for (let i = 0; i < stmts.length; i++) {
            const want = oracleFindRun(stmts, i);
            expect(newFindRun(stmts, i)).toEqual(want);
            if (want) {
              found++;
              let end = i + 1;
              while (end < stmts.length && isEligible(stmts[end]!) && stmts[end]!.kind === stmts[i]!.kind) end++;
              if (want.length < end - i) trimmed++;
            }
          }
        }
      }),
      { numRuns: 300 },
    );
    // Not vacuous: runs were found, and some only after the old search shrank the window.
    expect(found).toBeGreaterThan(0);
    expect(trimmed).toBeGreaterThan(0);
  });

  it("synthetic trees (NaN, ±Infinity, −0, key/length/leaf-type differences): equal at every start", () => {
    let found = 0;
    fc.assert(
      fc.property(syntheticList, (stmts) => {
        for (let i = 0; i < stmts.length; i++) {
          const want = oracleFindRun(stmts, i);
          expect(newFindRun(stmts, i)).toEqual(want);
          if (want) found++;
        }
      }),
      { numRuns: 5000 },
    );
    expect(found).toBeGreaterThan(0);
  });

  it("lemma: collectSlots(n0…nL) is non-null iff every collectSlots([n0, ni]) is, with the same slots", () => {
    fc.assert(
      fc.property(syntheticList, (stmts) => {
        if (stmts.length < 2) return;
        const whole = newCollectSlots(stmts);
        const pairs = stmts.slice(1).map((s) => newCollectSlots([stmts[0], s]));
        expect(whole === null).toBe(pairs.some((p) => p === null));
        if (whole === null) return;
        const rebuilt = whole.map((_, k) => [pairs[0]![k]![0]!, ...pairs.map((p) => p![k]![1]!)]);
        for (const p of pairs) expect(p!.length).toBe(whole.length);
        expect(rebuilt).toEqual(whole);
      }),
      { numRuns: 5000 },
    );
  });

  it("lemma: isArithmeticProgression is prefix-closed (every prefix of length ≥ 2)", () => {
    const vals = fc.oneof(
      fc.array(numValue, { minLength: 2, maxLength: 12 }),
      fc
        .record({ v: numValue, d: numValue, n: fc.integer({ min: 2, max: 12 }) })
        .map(({ v, d, n }) => Array.from({ length: n }, (_, j) => v + j * d)),
      fc
        .record({
          v: fc.integer({ min: -9, max: 9 }),
          d: fc.constantFrom(0.1, 0.25, 1.5, 3),
          n: fc.integer({ min: 2, max: 12 }),
        })
        .map(({ v, d, n }) => Array.from({ length: n }, (_, j) => v + j * d)),
    );
    let ap = 0;
    fc.assert(
      fc.property(vals, (vs) => {
        if (!newIsArithmeticProgression(vs)) return;
        ap++;
        for (let m = 2; m <= vs.length; m++) expect(newIsArithmeticProgression(vs.slice(0, m))).toBe(true);
      }),
      { numRuns: 5000 },
    );
    expect(ap).toBeGreaterThan(0);
  });
});

describe("reroll() — identical suggestions with the new finder and with the oracle", () => {
  it("generated sources", { timeout: 300_000 }, () => {
    let offered = 0;
    fc.assert(
      fc.property(archSource, (src) => {
        const got = reroll(src);
        expect(got).toEqual(rerollWith(src, {}, oracleFindRun));
        offered += got.length;
      }),
      { numRuns: 60 },
    );
    expect(offered).toBeGreaterThan(0);
  });
});
