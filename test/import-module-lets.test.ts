/**
 * An imported component sees its OWN module's plan-level `let`s (backlog M.5, owner decision:
 * the old `E_UNKNOWN_REF` was a defect).
 *
 * The rule, as built (`moduleFallback`, `src/ir.ts`; `moduleBindings`, `src/import.ts`): inside
 * the body of a component imported from module M — by name, or reached through a whole-file
 * `import … as` — a name that no parameter, no `let` of the body, no root plan `let` and no
 * built-in binds resolves against M's own plan-level `let`s (and value-functions), evaluated in
 * M's own scope. The rule is ADDITIVE: the fallback is consulted only by a lookup that would
 * otherwise be `E_UNKNOWN_REF` / `E_UNKNOWN_FN`, so no plan that compiles today can change, the
 * root's `let` still wins, and the importer's own statements never see M's names.
 *
 * The byte-identity law closes the file: every shipped example (incl. `lib`), fixture, recovery
 * plan and eval plan, every storey, with `compile().diagnostics`, against digests measured on
 * `main`'s `src/` at `25c053d` (a `git archive` of the branch point, through the same
 * `allStoreysDigestWithDiagnostics` body this test runs).
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint, makeVirtualWorld } from "../src/index.js";
import type { Diagnostic, World } from "../src/index.js";
import { MAX_EVAL_STEPS } from "../src/expr.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";

const API: CompilerApi = { compile, describe: describePlan, lint };

/** The backlog's reproduction module: a plan-level `let` and a component written in it. */
const M = `plan "m" {
  units mm
  let W = 5000
  component s1() {
    room id=r at (0,0) size W x 3000
  }
}
`;

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

/** Compile with the given modules in a virtual World; never cached. */
function run(src: string, files: Record<string, string> = { "m.arch": M }) {
  return compile(src, { world: makeVirtualWorld(files), noCache: true });
}

/** `lint()` with each diagnostic's `file` dropped: an imported body's findings name the module
 *  they were written in (`Diagnostic.file`), which is the one way an import may differ. */
const lintNoFile = (src: string, world?: World) => lint(src, world ? { world } : {}).map(({ file: _file, ...d }) => d);

const errors = (ds: readonly Diagnostic[]) => ds.filter((d) => d.severity === "error");

/** The resolved size of one room, from `describe()`. */
function roomBox(src: string, id: string, files: Record<string, string> = { "m.arch": M }) {
  const s = describePlan(src, { world: makeVirtualWorld(files) });
  if (!s.ok) throw new Error(JSON.stringify(s.diagnostics));
  const room = s.rooms.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id} in ${s.rooms.map((r) => r.id).join(", ")}`);
  return room.bbox;
}

suite("the reproduction (backlog M.5)", () => {
  const imported = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
  const inline = plan(
    `  let W = 5000\n  component s1() {\n    room id=r at (0,0) size W x 3000\n  }\n  place s1() as g at (0,0)`,
  );

  it('compiles — it used to fail with E_UNKNOWN_REF Unknown name "W"', () => {
    const r = run(imported);
    expect(r.diagnostics).toEqual([]);
    expect(r.svg).not.toBe("");
  });

  it("draws, describes and lints exactly what the inline form does", () => {
    const world = makeVirtualWorld({ "m.arch": M });
    expect(compile(imported, { world, noCache: true }).svg).toBe(compile(inline, { noCache: true }).svg);
    expect(describePlan(imported, { world })).toEqual(describePlan(inline));
    expect(lintNoFile(imported, world)).toEqual(lintNoFile(inline));
    expect(roomBox(imported, "g.r")).toEqual({ x: 0, y: 0, w: 5000, h: 3000 });
  });

  it("a bare call sees the module's `let` too", () => {
    const src = plan(`  import "m.arch": s1\n  s1()`);
    expect(run(src).diagnostics).toEqual([]);
    expect(roomBox(src, "r")).toEqual({ x: 0, y: 0, w: 5000, h: 3000 });
  });

  it("an aliased import is the same component", () => {
    const src = plan(`  import "m.arch": s1 as wing\n  place wing() as g at (0,0)`);
    expect(roomBox(src, "g.r").w).toBe(5000);
  });
});

suite("precedence: everything that resolved before still wins", () => {
  it("the root plan's `let` shadows the module's", () => {
    const src = plan(`  let W = 4000\n  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(run(src).diagnostics).toEqual([]);
    expect(roomBox(src, "g.r").w).toBe(4000);
  });

  it("a parameter and the body's own `let` shadow the module's", () => {
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  let H = 3000\n  component s1(W) {\n    let H = 2000\n    room id=r at (0,0) size W x H\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1(6000) as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod })).toEqual({ x: 0, y: 0, w: 6000, h: 2000 });
  });

  it("a built-in shadows a module `let` of the same name (it resolved before, so it still does)", () => {
    const mod = `plan "m" {\n  units mm\n  let min(a, b) = 9000\n  component s1() {\n    room id=r at (0,0) size min(5000, 6000) x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });

  it("the module's `let`s are NOT exported: the importer's own statements cannot see them", () => {
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)\n  room id=x at (0,4000) size W x 3000`);
    const errs = errors(run(src).diagnostics);
    expect(errs.map((d) => d.code)).toContain("E_UNKNOWN_REF");
    const unknown = errs.find((d) => d.code === "E_UNKNOWN_REF")!;
    expect(unknown.message).toBe('Unknown name "W"');
    // Reported in the importer's own source, not the module.
    expect(unknown.file).toBeUndefined();
    expect(src.slice(unknown.span!.start, unknown.span!.end)).toBe("W");
  });

  it("a component declared in the root still does not see a module's `let`s", () => {
    const src = plan(
      `  import "m.arch": s1\n  component mine() {\n    room id=q at (0,0) size W x 3000\n  }\n  place s1() as g at (0,0)\n  place mine() as h at (0,4000)`,
    );
    expect(errors(run(src).diagnostics).map((d) => d.code)).toContain("E_UNKNOWN_REF");
  });
});

suite("what a module `let` can be", () => {
  it("a value-function, called from the component", () => {
    const mod = `plan "m" {\n  units mm\n  let half(x) = x / 2\n  component s1() {\n    room id=r at (0,0) size half(10000) x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(run(src, { "m.arch": mod }).diagnostics).toEqual([]);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });

  it("a value-function that uses another module `let` (evaluated in the module's scope, not the root's)", () => {
    const mod = `plan "m" {\n  units mm\n  let K = 1000\n  let wide(n) = n * K\n  component s1() {\n    room id=r at (0,0) size wide(5) x 3000\n  }\n}\n`;
    // The root's K is a different number: the function must close over the MODULE's.
    const src = plan(`  let K = 7\n  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });

  it("a function written in the component body reaches the module's `let`s too", () => {
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  component s1() {\n    let w2(n) = W - n\n    room id=r at (0,0) size w2(1000) x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(4000);
  });

  it("a `let` that depends on another module `let`", () => {
    const mod = `plan "m" {\n  units mm\n  let A = 2000\n  let W = A + 3000\n  component s1() {\n    room id=r at (0,0) size W x A\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod })).toEqual({ x: 0, y: 0, w: 5000, h: 2000 });
  });

  it("a `let` inside a top-level `zone` (a zone is not a scope)", () => {
    const mod = `plan "m" {\n  units mm\n  zone z {\n    let W = 5000\n  }\n  component s1() {\n    room id=r at (0,0) size W x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });
});

suite("composition", () => {
  it("a module's component calling another of the same module's components", () => {
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  component s2() {\n    room id=r2 at (0,3000) size W x 2000\n  }\n  component s1() {\n    room id=r at (0,0) size W x 3000\n    place s2() as k at (0,0)\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1, s2\n  place s1() as g at (0,0)`);
    expect(run(src, { "m.arch": mod }).diagnostics).toEqual([]);
    expect(roomBox(src, "g.k.r2", { "m.arch": mod })).toEqual({ x: 0, y: 3000, w: 5000, h: 2000 });
  });

  it("nested import: each component sees the module it was WRITTEN in", () => {
    const n = `plan "n" {\n  units mm\n  let D = 1000\n  component n1() {\n    room id=q at (0,0) size D x D\n  }\n}\n`;
    const m = `plan "m" {\n  units mm\n  import "n.arch": n1\n  let W = 5000\n  component s1() {\n    room id=r at (0,0) size W x 3000\n    place n1() as k at (W, 0)\n  }\n}\n`;
    const files = { "n.arch": n, "m.arch": m };
    const src = plan(`  import "m.arch": *\n  place s1() as g at (0,0)`);
    expect(run(src, files).diagnostics).toEqual([]);
    expect(roomBox(src, "g.r", files).w).toBe(5000);
    expect(roomBox(src, "g.k.q", files)).toEqual({ x: 5000, y: 0, w: 1000, h: 1000 });
  });

  it("nested import: N's component does not see M's `let`s (M only imports it)", () => {
    const n = `plan "n" {\n  units mm\n  component n1() {\n    room id=q at (0,0) size W x 1000\n  }\n}\n`;
    const m = `plan "m" {\n  units mm\n  import "n.arch": n1\n  let W = 5000\n  component s1() {\n    place n1() as k at (0,0)\n  }\n}\n`;
    const src = plan(`  import "m.arch": *\n  place s1() as g at (0,0)`);
    const errs = errors(run(src, { "n.arch": n, "m.arch": m }).diagnostics);
    expect(errs.find((d) => d.code === "E_UNKNOWN_REF")?.file).toBe("n.arch");
  });

  it("a component reached through a whole-file import sees its module's `let`s", () => {
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  component helper() {\n    room id=r at (0,0) size W x 3000\n  }\n  helper()\n}\n`;
    const src = plan(`  import "m.arch" as whole\n  place whole() as g at (0,0)`);
    expect(run(src, { "m.arch": mod }).diagnostics).toEqual([]);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });

  it("whole-file import is unchanged: the file's own body still binds its `let`s locally (over the root's)", () => {
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  room id=r at (0,0) size W x 3000\n}\n`;
    const src = plan(`  let W = 4000\n  import "m.arch" as whole\n  place whole() as g at (0,0)`);
    expect(run(src, { "m.arch": mod }).diagnostics).toEqual([]);
    expect(roomBox(src, "g.r", { "m.arch": mod }).w).toBe(5000);
  });

  it("whole-file import is unchanged: a use before the file's `let` is still unknown (no forward reference)", () => {
    const mod = `plan "m" {\n  units mm\n  room id=r at (0,0) size W x 3000\n  let W = 5000\n}\n`;
    const src = plan(`  import "m.arch" as whole\n  place whole() as g at (0,0)`);
    const unknown = errors(run(src, { "m.arch": mod }).diagnostics).find((d) => d.code === "E_UNKNOWN_REF");
    expect(unknown?.file).toBe("m.arch");
  });

  const FRAMES: string[] = [];
  for (const r of [0, 90, 180, 270]) for (const m of ["", " mirror x", " mirror y"]) FRAMES.push(`rotate ${r}${m}`);
  it.each(FRAMES)("the same component under `place … %s` draws what the inline form draws", (frame) => {
    const body = `component s1() {\n    wall id=shell exterior thickness 200 { (0,0) (W,0) (W,3000) (0,3000) close }\n    room id=r at (0,0) size W x 3000\n    door id=d on shell at 25% width 900\n  }`;
    const mod = `plan "m" {\n  units mm\n  let W = 5000\n  ${body}\n}\n`;
    const world = makeVirtualWorld({ "m.arch": mod });
    const imported = plan(`  import "m.arch": s1\n  place s1() as g at (10000,10000) ${frame}`);
    const inline = plan(`  let W = 5000\n  ${body}\n  place s1() as g at (10000,10000) ${frame}`);
    const a = compile(imported, { world, noCache: true });
    expect(a.diagnostics).toEqual([]);
    expect(a.svg).toBe(compile(inline, { noCache: true }).svg);
    expect(describePlan(imported, { world })).toEqual(describePlan(inline));
    expect(lintNoFile(imported, world)).toEqual(lintNoFile(inline));
  });
});

suite("a module `let` that fails reports as it does in the module", () => {
  it("same code and span as compiling the module itself, with `file` naming the module", () => {
    const mod = `plan "m" {\n  units mm\n  let W = Q + 5000\n  component s1() {\n    room id=r at (0,0) size W x 3000\n  }\n  room id=own at (0,0) size W x 3000\n}\n`;
    const own = errors(compile(mod, { noCache: true }).diagnostics).find((d) => d.code === "E_UNKNOWN_REF")!;
    expect(own.message).toBe('Unknown name "Q"');
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    const errs = errors(run(src, { "m.arch": mod }).diagnostics);
    expect(errs.map((d) => d.code)).toEqual(["E_UNKNOWN_REF"]);
    expect(errs[0]!.file).toBe("m.arch");
    expect(errs[0]!.span).toEqual(own.span);
    expect(errs[0]!.message).toBe(own.message);
    expect(mod.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toBe("Q");
  });

  it("is reported once, however many instances look into the module", () => {
    const mod = `plan "m" {\n  units mm\n  let W = Q\n  component s1() {\n    room id=r at (0,0) size 3000 x 3000\n    room id=s at (0,3000) size 3000 x (W + 1000)\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as a at (0,0)\n  place s1() as b at (10000,0)`);
    const errs = errors(run(src, { "m.arch": mod }).diagnostics);
    expect(errs.filter((d) => d.code === "E_UNKNOWN_REF" && d.file === "m.arch")).toHaveLength(1);
  });

  it("a module that is never looked into is never evaluated: a broken `let` the component does not use reports nothing", () => {
    const mod = `plan "m" {\n  units mm\n  let W = Q\n  component s1() {\n    room id=r at (0,0) size 3000 x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    expect(run(src, { "m.arch": mod }).diagnostics).toEqual([]);
  });

  it("a module `let` past the step budget still returns E_STEP_LIMIT, at the module's `let`", () => {
    const mod = `plan "m" {\n  units mm\n  let f(n) = if n < 2 { 1 } else { f(n - 1) + f(n - 2) }\n  let X = f(40)\n  component s1() {\n    room id=r at (0,0) size X x 3000\n  }\n}\n`;
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    const r = run(src, { "m.arch": mod });
    const errs = errors(r.diagnostics);
    expect(errs.map((d) => d.code)).toEqual(["E_STEP_LIMIT"]);
    expect(errs[0]!.message).toContain(String(MAX_EVAL_STEPS));
    expect(errs[0]!.file).toBe("m.arch");
    expect(mod.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toBe("let X = f(40)");
    expect(r.svg).toBe("");
  }, 60_000);
});

/**
 * The byte-identity law. Digests measured on `main`'s `src/` at `25c053d` (`git archive`, the
 * same digest body); the module's new names can only ever be reached by a lookup that failed
 * there, so not one row may move. A move is a finding, never a re-measure.
 *
 * Seven rows re-measured for a DRAWING change, not this rule: a room name too wide for its room
 * on one line is now drawn on several when that fits (`wrapLabels`, `src/label-placement.ts`).
 * `examples/clinic.arch` and `test/recovery-corpus/clinic.arch` ("Accessible WC"),
 * `eval/fidelity-plans/wide-doorways.{faithful,laundered}.arch` ("Wet Room"),
 * `eval/goldens/core-and-shell.arch` ("Circulation Core"), `three-bed-2bath.arch` ("Master
 * Bedroom", "Main Bathroom") and `two-bed-hall.arch` ("Kitchen / Living"). In each only that
 * room's name and area figure move: the old SVG put back into the new payload reproduces the
 * old row, so `describe()`, `lint()` and `compile().diagnostics` are byte-identical.
 *
 * Six rows re-measured for a LINT change, not this rule: `W_BATH_VIA_BEDROOM` no longer names
 * an en-suite on a storey with another wet room reached without passing through a bedroom,
 * and its hint says so ("… add a second bathroom or WC on the same storey that is reached
 * without passing through a bedroom."). In every row the SVG, `describe()` and
 * `compile().diagnostics` are byte-identical and no other diagnostic moves:
 *   - `examples/hillside-villa.arch`: `lint()` loses that one diagnostic (the master ensuite,
 *     span 2564); put back at its old index in the new payload it reproduces the old row.
 *   - `eval/fidelity-plans/min-bedroom-flat.{faithful,laundered}.arch`,
 *     `over-programmed-flat.laundered.arch` and `wide-doorways.{faithful,laundered}.arch`:
 *     each plan's only wet room is behind a bedroom, so the warning stays; only its `hints[0]`
 *     sentence moves. The old sentence put back into the new payload reproduces the old row.
 *
 * Twenty-one rows re-measured for a deliberate diagnostic-TEXT change, not this rule (case (3)
 * in `./byte-identity-baseline.ts`'s header; `test/lint-fix-texts.test.ts`). In every row the
 * SVG, `describe()` and `compile().diagnostics` are byte-identical, and hashing the new payload
 * with the OLD `lint()` reproduces the old row:
 *   - `W_ROOM_NO_FIXTURE`'s hint no longer suggests importing the unshipped `lib/fixtures.arch`
 *     and gives a pasteable built-in statement: `test/fixtures/diff-{a,b}.arch`,
 *     `eval/goldens/core-and-shell.arch`, and `eval/fidelity-plans/capped-wet-room.laundered`,
 *     `min-bedroom-flat.{faithful,laundered}`, `over-programmed-flat.laundered`,
 *     `two-bed-min-area.{faithful,laundered}` and `wide-doorways.{faithful,laundered}`.
 *   - `W_FIXTURE_BACK_TO_ROOM`, where the size's aspect rules out every walled edge, now says to
 *     swap the size (with the `rotate` that follows): `eval/goldens/l-shaped-flat`,
 *     `reception-suite`, `sized-office-mix`, `three-bed-2bath`, `two-bath-flat`, `two-bed-hall`.
 *   - `W_FURNITURE_WALL_COLLISION` names the wall it crosses and how deep:
 *     `eval/faults/furniture-through-wall.arch`.
 *   - `arch repair` -> `archlang repair` in the `W_SWING_OBSTRUCTED`/`W_DOORWAY_BLOCKED` hints:
 *     `eval/faults/blocked-doorway.arch`, `eval/faults/combined.arch` (and `capped-wet-room`).
 *   - `W_PATH_TOO_NARROW` names the en-suite doors and withdraws the duplicate Master Suite ->
 *     Ensuite route: `examples/hillside-villa.arch` (the same row as
 *     `./while-byte-identity-baseline.ts`).
 * Ten of those rows re-measured a second time, after the red team's review, again `lint()` text
 * only (the previous `lint()` put back reproduces each previous row): `hillside-villa` (the
 * named en-suite door is now the one on the widest door path); `core-and-shell` and
 * `two-bed-min-area.{faithful,laundered}` (the `W_ROOM_NO_FIXTURE` statement is now placed
 * clear of doors, swings and furniture, so its anchor moved); and the six back-to-room goldens
 * (`W_FIXTURE_BACK_TO_ROOM`'s size hint no longer adds "or, placed `in <room> anchor`" to a
 * piece placed `at`, and asks no `rotate` of an anchored one). `hillside-villa` re-measured a
 * third time when every named door became re-measured before it is quoted: the same three
 * doors, hint wording only; the previous `lint()` put back reproduces the previous row.
 *
 * Two rows ADDED, not re-measured: `test/fixtures/star30.arch` and `test/fixtures/chain30.arch`,
 * new fixtures pinning `W_PATH_TOO_NARROW`'s re-measure count; first measured with the same
 * digest body on the tree that adds them (the same rows as `./while-byte-identity-baseline.ts`).
 * `test/fixtures/off-path-bypass.arch` likewise (the doorway-band bypass repro).
 *
 * Twenty-two rows re-measured for the thickness call-out station, the drawing only: every
 * corpus plan that draws a `dims auto all`/`walls` call-out (the sixteen examples,
 * `test/fixtures/axes-grid` and `schedule-sheet`, the `test/recovery-corpus/` copies of
 * `clinic`, `materials` and `two-storey`, and `eval/goldens/dims-auto-cottage`). Hashing the
 * new payload with the OLD SVG put back reproduces each old row. Each moved call-out in
 * `./byte-identity-baseline.ts`, "thickness call-outs keep off doorways and fixtures".
 *
 * EVERY row re-measured once for net internal area (owner decision 2): `describe()` gains
 * `net_area_m2` / `totals.net_floor_area_m2`; SVG and lint unchanged except room schedules.
 * A hybrid run of this file, unedited, with `describe()` from the pre-change tree (`1eb1bf9`)
 * and `compile()`/`lint()` from the new one reproduces every old row except the plans that
 * set `schedule rooms`: the twelve examples (`aquarium`, `bungalow`, `clinic`,
 * `courtyard-house`, `furnished-flat`, `garden-house`, `hillside-villa`, `library`,
 * `materials`, `museum-wings`, `sheet-notes`, `transit-hall`),
 * `test/fixtures/schedule-sheet.arch` and `zones-wings.arch`, and the `test/recovery-corpus/`
 * copies of `clinic` and `materials`, whose SVG gains the
 * ROOM SCHEDULE's NET AREA column; their `compile().diagnostics` is byte-identical, and with
 * `compile()` too from the old tree they reproduce as well. The account is in
 * `./byte-identity-baseline.ts`, "EVERY row re-measured, once". The same schedule rows,
 * and only they, were re-measured once more when the AREA column took its owner-given label
 * `AREA (CENTRELINE, m²)`; no other row moved.
 *
 * Re-measured once more when net area became the room less every wall band on it (ADR 0027):
 * the rows of `aquarium`, `hexagon-pavilion`, `hillside-villa`, `materials`, `tiny-house` and
 * `townhouse` (and the `test/recovery-corpus/` copy of `materials`), whose `describe()`
 * moves in its net figures only. Field by field in `./byte-identity-baseline.ts`, "Six
 * plans re-measured again".
 *
 * Five rows re-measured when two lint messages stopped quoting element ids (a consumer may show
 * `message` to someone who never sees the source; the id stays in the hint), `lint()` `message`
 * text only. Hashing the new payload with the previous `lint()` reproduces each previous row:
 *   - `W_PATH_TOO_NARROW` names a bottleneck door by the rooms it joins:
 *     `examples/hillside-villa.arch` (field by field in `./byte-identity-baseline.ts`, "names a
 *     door by its rooms"), `test/fixtures/chain30.arch`, `star30.arch` and
 *     `off-path-bypass.arch` (the same rows as `./while-byte-identity-baseline.ts`;
 *     `off-path-bypass` also moves in the collision below, `penetrates exterior wall "w_s" at
 *     y 2000` → `penetrates the exterior wall at y 2000`).
 *   - `W_FURNITURE_WALL_COLLISION` names the wall by its kind and line:
 *     `eval/faults/furniture-through-wall.arch`, `penetrates partition wall "partition_2" at
 *     x 4000` → `penetrates the partition wall at x 4000`.
 *
 * Three rows re-measured when a connector on a wall began to join the space off each face of
 * that wall, with an additive `straddles` (backlog C.4, plan-soundness PS0.1; field by field
 * in `./byte-identity-baseline.ts`, "read off the host wall's faces"). Hashing the new
 * `compile()` with the previous `describe()` and `lint()` reproduces each previous row: every
 * storey's SVG and `compile().diagnostics` are byte-identical.
 *   - `examples/hillside-villa.arch`: `describe()` gains `straddles` on `o_entry_dining` only.
 *   - `eval/goldens/strip-attach-clean.arch`: `d_bath` (800 mm at y 3750 on `w_bath`, which
 *     starts at y 3500) runs 150 mm past its host's end across the `w_mid` T, so `doors[4]`
 *     and `access.edges[4]` gain `straddles: ["r_live", "r_bed2", "r_hall", "r_bath"]`.
 *     `between` and `lint()` unchanged.
 *   - `test/fixtures/schedule-sheet.arch`: `door on shell at 20%` is centred on the T where
 *     `part` meets the shell, (4000, 0). It used to join `living` and `bath` and the plan had no
 *     entrance. It is now `between ["exterior", "living"]` (each room covers 400 mm of the inner
 *     face's clear span, so room order breaks the tie), `exterior: true`, `straddles ["living",
 *     "bath"]`; `access` gains the entrance, both rooms' depths and bottlenecks, `circulation`
 *     is measured (it was `null`) and the caption names the entrance. `lint()` withdraws
 *     `W_NO_ENTRANCE`, its only diagnostic, and gains nothing.
 *     Two surfaces no digest here pins move with it, on this row and on
 *     `docs/plans/plan-soundness/repro/door-on-tee.arch` (no row): Plan JSON (`compile -f json`),
 *     whose edge for that door goes from `living`→`bath`, `interior` to `exterior`→`living`,
 *     `front`; and `lint()` under `accessibility-advisory`, which gains `W_PATH_TOO_NARROW` twice
 *     (one walk per room, 840 and 740 mm clear against the 900 mm minimum) now that a route exists.
 *   - 2026-10-18, plan-soundness PS2.5–PS2.7 (three circulation-and-privacy lint rules
 *     appended): `examples/two-bed`, `examples/garden-house`, `test/fixtures/axes-grid` and
 *     `chain30` as in `./while-byte-identity-baseline.ts`; and four eval plans, `lint()` only, each
 *     reproduced by hashing with `lint()` minus the three new codes:
 *     `eval/goldens/reception-suite` (`W_WET_ROOM_DOOR`: the WC door opens into "Kitchenette"),
 *     `relational-studio` (`W_WET_ROOM_DOOR`: the bathroom door opens into "Kitchen"),
 *     `strip-attach-clean` (`W_ROOM_VIA_PRIVATE`: "Bedroom 2" is reached only through
 *     "Bathroom", depth 3) and `eval/fidelity-plans/four-bed-cap.laundered` (three
 *     `W_ROOM_VIA_PRIVATE`: bedrooms 2 and 3 only through bedroom 1, bedroom 4 through 1 then 3).
 *     After the rules' review, `two-bed` and the three goldens moved again on their hint wording
 *     alone (see `./byte-identity-baseline.ts`): the first commit's `lint()` reproduces each row.
 *
 * Fifteen rows re-measured on 2026-10-18 for the opening rules (plan-soundness PS2.1–PS2.3),
 * each with a held swap-back proof:
 *   - SOURCE fixed, `lint()` unchanged (field by field in `./byte-identity-baseline.ts`, "Six
 *     examples fixed for the opening rules"): `examples/` courtyard-house, furnished-flat,
 *     hillside-villa, library, terrace-row, two-storey, and `test/fixtures/axes-grid.arch`
 *     (`door on shell at 20%` → `25%`: the door ran x 3950–4850 across the partition at x 4000;
 *     the right room's walk 2800 → 1700) and `schedule-sheet.arch` (`20%` → `17%`: the door was
 *     centred on the T; it loses `straddles`, two walks move, 3000 → 2600 and 2800 → 3300).
 *     The new `lint()` with the previous SVG, `describe()` and `compile().diagnostics`
 *     reproduces each previous row.
 *   - SOURCE unchanged, `lint()` gains the new codes (true positives, left as written):
 *     `test/recovery-corpus/` terrace-row and two-storey (frozen copies, never edited), and
 *     `eval/goldens/` against-wall-bath, anchor-furniture, strip-attach-clean, three-bed-2bath
 *     and `eval/fidelity-plans/two-bed-min-area.faithful.arch` (holdout, never edited). The new
 *     SVG, `describe()` and `compile().diagnostics` with the previous `lint()` reproduce each
 *     previous row.
 *
 * Five of them re-measured again in the opening rules' review round, against `bc5c55f`, each
 * with a held swap-back proof: `examples/terrace-row.arch` (`win_bath` moved, the drawing only,
 * see `./byte-identity-baseline.ts`), and four whose `lint()` alone moved. The move hints now say
 * what the move was measured to open into ("still opens between …"), which rewords the hints
 * of `test/recovery-corpus/terrace-row.arch`, `eval/goldens/against-wall-bath.arch` and
 * `anchor-furniture.arch`; and `strip-attach-clean.arch` loses its `W_CONNECTOR_AMBIGUOUS`
 * (each straddled sliver is 100 mm, 50 mm net of the partition's body, under the 100 mm a
 * jamb's nib needs), keeping its `W_OPENING_AT_JUNCTION`.
 *
 * The rows moved by both plan-soundness branches are re-measured on their merge, as recorded
 * in `./byte-identity-baseline.ts` (the last paragraph of its header).
 * Thirty-two rows re-measured on 2026-10-18 (plan-soundness PS2.8 + PS2.9), with this test's own
 * digest body: the eleven of `./while-byte-identity-baseline.ts` (same reason), plus rows that
 * move on `lint()` alone. Hashing the new SVG, `describe()` and `compile().diagnostics` with the
 * previous `lint()` reproduces every previous row of those, measured with each payload separately.
 *   - `test/recovery-corpus/terrace-row.arch`, `two-storey.arch` (frozen copies, never edited):
 *     `W_ROOM_MISSING_DEFINING` — four "Living" rooms tagged dining with no table; a kitchen with
 *     a sink and no hob, a bath with a WC and basin and no bathtub or shower.
 *   - `eval/goldens/*` (never edited; holdout): `against-wall-bath`, `attach-openings`,
 *     `compact-studio` (kitchen without a hob), `core-and-shell`, `l-shaped-flat`,
 *     `relational-studio`, `sized-bedrooms`, `sized-kitchen-flat` (living room or kitchen with no
 *     window), `office`, `reception-suite`, `sized-office-mix` (both); `core-and-shell` also
 *     `W_ROOM_NO_FIXTURE`'s hint.
 *   - `eval/fidelity-plans/*` (eight rows): `W_ROOM_NO_FIXTURE`'s hint only.
 * Six rows re-measured on 2026-10-19 (plan-soundness PS2.4), with this test's own digest body:
 * the six of `./while-byte-identity-baseline.ts`, for the same reasons (the space-enclosure
 * rules move `lint()` only; three examples' sources fixed). No eval golden, fidelity plan or
 * recovery copy raises the three new codes.
 * `examples/hillside-villa.arch` re-measured for plan-soundness PS0.12, with this test's own
 * digest body, as `./while-byte-identity-baseline.ts` records (the bay window's `describe()`
 * `room`; the previous `describe()` put back reproduces the previous row).
 * Nineteen rows re-measured for plan-soundness PS0.10 (`describe().access` names the main
 * entrance; `describe()` only, the previous `describe()` put back reproduces each previous row):
 * the fifteen examples `./while-byte-identity-baseline.ts` lists, plus
 * `eval/goldens/scripting-units.arch` and `test/recovery-corpus/materials.arch`, `parametric.arch`
 * and `terrace-row.arch` (frozen copies, never edited), each a storey with more than one
 * entrance whose fact is refused (`tie`, `kind-conflict`): `access.mainEntrance` appended.
 * Fifteen re-measured again in the PS0.10 review round (width no longer decides; `kind-conflict`
 * is gone), `describe()` only, the first measurement's `describe()` put back reproducing each.
 * Eight again in review round 2 (the seven examples `./while-byte-identity-baseline.ts` names, and
 * `test/recovery-corpus/terrace-row.arch`), `describe()` only, the same way.
 *
 * 2026-10-20, plan-soundness PS2.17 (the kitchen row requires a worktop): the eleven examples
 * that gained one, as `./while-byte-identity-baseline.ts` says; and, `lint()` only, rows whose
 * SOURCE did not change (`test/recovery-corpus/terrace-row.arch` and `two-storey.arch`,
 * `eval/goldens/core-and-shell.arch`, seven `eval/fidelity-plans`): they gain the worktop
 * finding or a `W_ROOM_NO_FIXTURE` hint that quotes the worktop, and the new SVG, `describe()`
 * and `compile().diagnostics` with the PREVIOUS `lint()` reproduce each previous row.
 * Review round 1 (same card): the hint's placement search tries the worktop's 400 mm module
 * too, as `finish` does, so `core-and-shell` and five `eval/fidelity-plans` quote paste-able
 * statements again (sink, stove and worktop) where the first commit's hint said "make room
 * first"; `lint()` only, and the first commit's `lint()` put back reproduces each of its rows.
 * The same size fallback reaches every defining piece with more than one size: a bed's hint
 * now tries 1500 then 900 mm (`docs/plans/plan-soundness/repro/family-apartment.arch`'s "no
 * bed" quotes `bed … size 900x2000`; not a row here). Review round 2: a hint's set is linted
 * with its pieces standing and is not quoted if it would raise any other finding, and a corner
 * worktop the resolver would not turn quotes its `rotate`; `two-bed-min-area.laundered`'s kitchen
 * hint now says its placement would raise another finding (pasted, its pieces opened the
 * bathroom straight onto the kitchen, `W_WET_ROOM_DOOR`); `lint()` only, round 1's `lint()` put
 * back reproduces its row (e621f33b…).
 *
 * 2026-10-20, plan-soundness PS2.18 (dwelling-reading rules decline on a non-residential plan):
 * `eval/goldens/core-and-shell.arch`, `office.arch`, `reception-suite.arch` and
 * `sized-office-mix.arch` read as offices, so `W_HABITABLE_NO_WINDOW` no longer asks their
 * kitchenette for a window. `lint()` only: the new SVG, `describe()` and `compile().diagnostics`
 * with the PREVIOUS `lint()` reproduce each previous row (ddcdc0c9…, f4725500…, 2d52aba1…,
 * 019a62d8…).
 */
// Re-measured 2026-10-23 (PS3.7): aquarium, corner-cafe, furnished-flat, gallery-l, hillside-villa, materials, museum, themed: chairs turned to the table they sit at, a real
// defect `W_SEAT_FACING_AWAY` found (ADR 0029 §6); the cause and the proof that nothing else
// moved are in `test/byte-identity-baseline.ts`'s header.
// The two `test/recovery-corpus/` rows are copies of `materials` and `themed`: the same chairs,
// left unedited because the recovery metric reads those copies as frozen inputs. Re-measured
// once more for PS3.7's red team round 1: the seat hint was reworded (`On "<chair>", add
// `facing <id>``, or name an id-less desk first); the message, code and span are unchanged.
// Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (seven fixed examples, townhouse redrawn, eval/goldens/l-shaped-flat gains the warning); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header. l-shaped-flat's row again in PR #245's red-team rounds 1 and 2: only its warning's hint moved (it now names room `r_bath`, an authored id, and keeps "the basin" for the piece, whose id is assigned); the message is unchanged.
// Re-measured 2026-10-25 (PS2.11a/b): the twelve examples fixed for WC side clearance and tall units over windows; ten eval goldens, test/fixtures/schedule-sheet and three recovery-corpus plans gain a warning and are not edited; why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11c, PS2.11d): hillside-villa, relational and tiny-house fixed; eval/goldens/against-wall-bath gains `W_FOOTPRINT_TRANSPOSED` (holdout, not edited); why, and the swap-back proof, in `test/byte-identity-baseline.ts`s header.
// Re-measured 2026-10-26 (PS2.50): hillside-villa and tiny-house each lose one `W_FIXTURE_BACK_TO_ROOM` (a piece side-on or end-on to a wall); nothing else moved, see `test/byte-identity-baseline.ts`'s header.
const BASELINE: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["examples/accessible.arch", "85e27237df00e50be8aa1b46cf4cf11f619b2bb1093b3fe3390dc7ceba87d609"],
  ["examples/aquarium.arch", "78bd4379d464fdaac2de9d08e97fd8b99693c9713a05c15eb1add904b69e3d85"], // re-measured for PS2.4, see header; PS2.10 dims fixed (byte-identity-baseline.ts)
  ["examples/attached.arch", "632df13a9d8ee99fe25a5b71a9df34597a2becd4e2c9ef69015d4ae38b63926b"],
  ["examples/bungalow.arch", "f0ac0395cefa2df1b94a60cf396c00029e3ae2a31d19e6ec61e99e8db2e42631"],
  ["examples/classroom-block.arch", "4e99994194840efe6dc2257a57719e4a3bc0a4378c152452926666c0e835514c"], // added with the example, re-measured for net area, see header
  ["examples/clinic.arch", "3c8b4aeaa4f1e90c8aff25bb17e820da3f89756d54c321c5ae7c6d79dc8ee97d"],
  ["examples/corner-cafe.arch", "8392dbffa52f6854d9406f8b7420d89cfac0c46e2ee6bc60e5b370f0d55e876e"], // added with the example, re-measured for net area, see header
  ["examples/courtyard-house.arch", "b8121deef02b164c787053ba145465fd33d045dd7d87d38691d4b47ce673883d"], // re-measured for PS2.4, see header
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: "Utility" reads `utility` (`byte-identity-baseline.ts`).
  ["examples/furnished-flat.arch", "65b0ffbc76086c3cd0396f1a690cba6cb7c60811841b91cb1befbb3e35228540"],
  ["examples/gallery-l.arch", "54b9ca169ce2163a1c75a399e49e2b5a6b60b3c8f8da7fd6e28179549374f94f"], // PS2.10 dims fixed (byte-identity-baseline.ts)
  // Re-measured because the EXAMPLE changed (backlog D.1, its doubled chairs removed), and again
  // for the legend's ground swatches (backlog D.3, level 1's SVG only): the same row, with the
  // same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/garden-house.arch", "061efca9f04557dae0bf7e272fe5b42daa09d869332f76c4b51ebf0d567cbd92"],
  ["examples/garden-loft.arch", "987374c0f15d2b23767305c536015cd60f91c3d2cef2304f6538b995c94e5003"],
  ["examples/hexagon-pavilion.arch", "891af8cd488c23db8001c962347fd41d29e021fda2d933a3b33d2b467b25cceb"],
  // Re-measured for the facade-probe fix (level 2's `dims auto` chains only), and again because
  // the EXAMPLE changed (backlog D.2, its piano turned and moved): the same row, with the same
  // digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/hillside-villa.arch", "eeff7b8fa532f567c26cb473094ef6ff58648291b5875b75010e427fd505d333"], // re-measured, see header
  ["examples/imports.arch", "ef15afb9ec7f0c2d2e2685f137e5934c90ac41af0603c8a70199278ba2352845"],
  ["examples/laneway-house.arch", "abe288c68a810052245c81758241eb734189e257815c84c4eea5dc07be4ca358"],
  ["examples/library.arch", "8a36040b92af80972952125daf0b73a27454313ad3b2b47b86569f84c1a7a74e"],
  ["examples/materials.arch", "11159194446551253f972978abde8959a37a07fc52bfd92cd557884dffca540f"],
  ["examples/museum-wing.arch", "6833ec14e690c8a93e03f7021ef453ca877b3a524717afa63e1b77cc4b986be3"],
  ["examples/museum-wings.arch", "703c2614c7321c513055892eaaeacdd8cc9f9407837500d3678f39033c8bd6cb"],
  ["examples/museum.arch", "b4226b78babacfe1a8d56e6d8ba2f64b46e20aab9dba533cb287fb947f3a2794"],
  ["examples/one-room.arch", "95f9283ff6b02f3c39fd09d3e7a76ce977b06e5cb3095e5bdecd911a86e887b4"],
  ["examples/parametric.arch", "2df383db4f3fd671faa3e5277ba0140409708ab45093008501119234cd756490"],
  ["examples/practice-office.arch", "5eda7af75b09b46be68f9b6ea545a1d1dbb94f38ac2658db826faf1388231e2f"], // added with the example, re-measured for net area, see header
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/relational.arch", "a22334f627579d184403c238a560059d0473b721ff3b04000955fbbad4e47de0"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see ./byte-identity-baseline.ts
  // ADDED with the new example (the issued-sheet statements), then re-measured once when the
  // thickness call-out change met it (drawing only): the same row, with the same digest body,
  // as `./while-byte-identity-baseline.ts`, whose header has both.
  ["examples/sheet-notes.arch", "3f8154c12b87841ac58b2a9b4f44d6f3e723e7c5688f8857a279ddff4c8d2ce1"],
  ["examples/studio.arch", "f44a791a974b9f363ccf610656d42084a2d4ec27cf77055478f3622aabedf119"],
  ["examples/terrace-row.arch", "245a464047cebe8083df659a26f2c08259ca6e66f3e3431e3f047b7c1565689d"],
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/themed.arch", "70e8a38ff38f0585a17d4e430ffff6569b301a1468d2d03f1668ba3ba0086525"],
  ["examples/tiny-house.arch", "10541668c3377c88575621a16f10e8c31265bd159dca43cc748cfa7e3c000686"],
  ["examples/townhouse.arch", "19aaac944b66fd8b9a9d9ca9cd7764e95a1df3ad04d0c9cdbfa5039c45909d34"],
  ["examples/transit-hall.arch", "3f2f312a7cb40ac5f5e63d852f1c33a4738099488ca20fd70439e43d2ac219e1"],
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/two-bed.arch", "9fb86073236bea7574f0551f583dc05edb6bca91bc7cbe077b675d8d823d87ca"], // PS3.6 source rewrite, see ./byte-identity-baseline.ts
  ["examples/two-storey.arch", "22fab4467821c289f31e506222cfcf2630731888e4e24105d2912e50c74ceb1e"],
  ["examples/lib/doors.arch", "73fe5f4c758f2e520b7605b2c1e727378f2b15a21eb40c549f7672cf3bcbcfb1"],
  ["examples/lib/fixtures.arch", "253b3c683338a810d540cff738b2138ef7c6748545d7c1a8c5890ca63bafe210"],
  ["examples/lib/furniture.arch", "a07a3589fa884d943d3c01993922e4efedfbc08b44c32cadc0fcd092fabbd23e"],
  ["test/fixtures/axes-grid.arch", "77d4b09d0c981d263ac921469314cccc8b9dc88d9fa18eef482633d167b0f785"],
  ["test/fixtures/chain30.arch", "2997088e815b2f8fae3c3f02187d843a397941e424519d773ca8d7df148cf8b7"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "4601b4bb1dc59a322e1f7af12b7b6d5f28567839c64832cd726d6ad27c0f7892"],
  ["test/fixtures/diff-a.arch", "0e7174a00b646e604a1c4eaec97a680cbfa828a9291d13bf0840c04ae42a3b95"], // re-measured for PS2.4, see header
  ["test/fixtures/diff-b.arch", "e0e70c1f605fad6611a4e1d4356a0902564b1bea546f721d9b71980457174703"],
  ["test/fixtures/diff-circ-a.arch", "7841d2c91e36047ee99c31b64bc2eac53f1ed5db4443ae01f031db36d088add8"],
  ["test/fixtures/diff-circ-b.arch", "b8ebc690809f823fe06939d013b0be7c7b340e533def45896719131317a83d72"],
  ["test/fixtures/off-path-bypass.arch", "6ca934556d7587a7c734e14506e0a8790be063d348adee5dd90a9bcf22cf932f"], // new fixture, see header
  ["test/fixtures/schedule-sheet.arch", "38c2bcf210494861de34861249b407aa87fecd9b7f4269dc445ecc0bbc2a8f76"], // re-measured, see header; PS2.29: message text only, same code, same span
  ["test/fixtures/star30.arch", "3278865463e62a7e5fdacdf5c9a91231a71849bb5ffa750c7c1ab412cb8852ae"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "7d45e53ca15b5a093ff00383694df8659f2245b8603f0930aec52e82c1135b1a"], // re-measured for PS2.4, see header
  ["test/fixtures/zones-wings.arch", "fa91773f3c3426cf62ea9bcd58e7e74bc3eb6a68f1419f68f3f49fd575292988"], // re-measured for PS2.4, see header
  ["test/recovery-corpus/attached.arch", "632df13a9d8ee99fe25a5b71a9df34597a2becd4e2c9ef69015d4ae38b63926b"],
  ["test/recovery-corpus/clinic.arch", "3c8b4aeaa4f1e90c8aff25bb17e820da3f89756d54c321c5ae7c6d79dc8ee97d"],
  ["test/recovery-corpus/materials.arch", "ada2a75387bd63c86a92405a44f4d4c57127bdb07ba912bcd891e8ac9b78f3d9"],
  ["test/recovery-corpus/parametric.arch", "2df383db4f3fd671faa3e5277ba0140409708ab45093008501119234cd756490"],
  ["test/recovery-corpus/studio.arch", "f44a791a974b9f363ccf610656d42084a2d4ec27cf77055478f3622aabedf119"],
  ["test/recovery-corpus/terrace-row.arch", "846b4f2f42439d2d47ba1b63b7caa202328923e4c45031c04998bee97dd36a5a"],
  // Re-measured 2026-10-18 (PS0.7): a copy of `examples/themed.arch`, the same cause and value.
  ["test/recovery-corpus/themed.arch", "ab2e4e203fc1aecbc99be0652e8f91e58b0eaa6d7ac35117d9ec435c10dc7fea"],
  ["test/recovery-corpus/two-storey.arch", "b04122839a2a550e1848cdd1d7e30c460d8cd8812d67fa1ce767af19b0c50643"],
  ["eval/goldens/accessible-bath.arch", "6dafe5b3a03ff00d306dd154020ccc578d22ab5c5c5e126503097d73910bc63e"],
  ["eval/goldens/accessible-flat.arch", "67195a005d6b2dae19dfcf797d56f753f973e845fb009931c0c2c932fc00de0b"],
  ["eval/goldens/against-wall-bath.arch", "abbe0a7e402f1e0fc572040c9841a4c2e47f2047a25680f09f7c28bdc50f9faa"],
  ["eval/goldens/anchor-furniture.arch", "8bb4a263cf1399ceb961547baeb0977ef7d9ff13aae1f889c1a362b456cba835"],
  ["eval/goldens/attach-openings.arch", "eca8ee546ff47350447f9a5dfee10d4f9f2782286df0cbe6ef1b7eff5a5df027"],
  ["eval/goldens/bungalow.arch", "f8f7958f7cc7a82e6d4d93633d20a5693482217eb01f1686e5d188027cd123e7"],
  ["eval/goldens/compact-studio.arch", "4667bdec42cad98ade05c4c8623b599fd3c220b90edeffebb5108c78aaad6ec4"],
  ["eval/goldens/core-and-shell.arch", "8912fc688886be18aa6fc7ccfb85db7834bc65e10a79882cfe6c1cc3bbdb7466"],
  ["eval/goldens/dims-auto-cottage.arch", "3321e80770f2f574a64d21939e9edce1a0edfba46295c8e16af5f2508fb41758"],
  ["eval/goldens/galley-kitchen.arch", "e0d35f018de00be9beb92829656fa501de66d187fd92b16da965ef78029e3997"],
  ["eval/goldens/l-shaped-flat.arch", "a8dc59458f89b35d46a2684bab5ba62f623196cb3760c6281dfc615a0f2f99a4"],
  // Re-measured 2026-10-20 for PS2.19 (`describe()` only: "Open Office" reads `office`) and again for
  // PS2.18 (`lint()` only: the kitchenette's daylight warning declines); see header.
  ["eval/goldens/office.arch", "f6cf97e27ef5a48dc069230b98f9dd71a86c5c97df835621f27dd7f64241c117"],
  ["eval/goldens/open-plan-loft.arch", "1827d0800eda9abab40b0913cb795951f198bda003b6d3c3c1a2faf668a61dd8"],
  ["eval/goldens/reception-suite.arch", "c9bb588e0225d5ff470029fc45b9b5a83a3bf44420cfc12d2054df4a6b621749"],
  ["eval/goldens/relational-studio.arch", "cb72851c21bdc5d07d0cf52b74b3b50050d3d2e556cb837b053822c4b494907c"],
  ["eval/goldens/scripting-units.arch", "1c6c5cab4921e303acedfcdf93d036414c5f948dd755a13d78a83a192f9085cd"],
  ["eval/goldens/sized-bedrooms.arch", "129652c81c6c52b15f3373d1d7edd2cbf37ce94035b51a66309ad409bfc20ff7"],
  ["eval/goldens/sized-kitchen-flat.arch", "e985f43d0ccf9ba2143010597035e9888a41e95be4f1d1d66403e8a6c1bcd187"],
  ["eval/goldens/sized-office-mix.arch", "1839f2f388911d9f60af4695a85c9a37ef2846a2db8ae2c3b9eba26dd40978ea"],
  ["eval/goldens/sized-wet-room.arch", "259b50ca0cc821daa33e71c59aaa0d6ca9567c24a1311a8a478ccbaa8bd4bbb4"],
  ["eval/goldens/strip-attach-clean.arch", "d2296285dbb3ea687c53590a067f7c0da4ba4f4e7251c81660e6b89441955dce"], // re-measured, see header
  ["eval/goldens/strip-corridor.arch", "21d67396aef0acd4d8181db943589d6656f58ff29383b78c9077610963668dfc"],
  ["eval/goldens/three-bed-2bath.arch", "aa0384bd43c3608d71e70505278040df1a46c955aab99025584292f75efd5ca4"],
  ["eval/goldens/two-bath-flat.arch", "42d457d22261497573fb7b1c05e7da283a1c5db5d772866ff90caf10d7a4e5c7"],
  ["eval/goldens/two-bed-hall.arch", "ac1300e8e4887254af170d91e7890ceebbc1c8d67ed3f1a871772cec57af105a"],
  [
    "eval/fidelity-plans/capped-wet-room.laundered.arch",
    "a1833f7eed550c3c16db083794093b34f571994ba24b8b181f4870f96bdad0f7", // PS2.29: message text and the new door-id hint of W_SWING_OBSTRUCTED, same codes, same spans
  ],
  [
    "eval/fidelity-plans/four-bed-cap.laundered.arch",
    "851d8eb2f2da417f95fa99ce44fdd8a91705e20944643af40bafe4b0abad6896",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.faithful.arch",
    "53787bb3ed97dfde8444c79a1bd27286d40ae374feed74be457221259158f30d",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.laundered.arch",
    "ca1695638c51c21a5f54d27e3749e55c6a8274715668eecd14074e0806e3986f",
  ],
  [
    "eval/fidelity-plans/over-programmed-flat.laundered.arch",
    "ff092e9eb0a468804b400f605c652043aa52327fbfe82ed2461666c42b192fc0",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.faithful.arch",
    "fd06942afd81250fa105679862e979d02cf79e75262baa4f2375e9b2f9bf1e8b",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.laundered.arch",
    "b90f8ca5269cda2845a9a765edf72116fab90eebff6adc7a13fef370bca6902d",
  ],
  [
    "eval/fidelity-plans/wide-doorways.faithful.arch",
    "e592c912a977468e0c9312fb1203d2c0cbb909039610aebd50011453d34f8e03",
  ],
  [
    "eval/fidelity-plans/wide-doorways.laundered.arch",
    "9186aa4f70c3ec56acaa6d67da796c18efab283fc81818b671faef4b09aba97a",
  ],
  ["eval/faults/blocked-doorway.arch", "197392b25b6442ca08cd89e053ba57613cc918b99f7a7a00022c8b03fbf1deb2"],
  ["eval/faults/combined.arch", "84c21c7e5e8a8fde7d7e0a8d28cc1fba7126841ed7a4bebafbdd27040b8e865e"],
  ["eval/faults/furniture-through-wall.arch", "63156303d4ed25d96512fe94313b5512ff5c305de5d2c5c302c21bf8356d689c"],
  ["eval/faults/off-wall-door.arch", "f04951025604414c5972f148d0afe5dc9ec19ccc96838a0961a31cb0e80ed968"],
  ["eval/faults/off-wall-opening.arch", "252708db1350fc43b973d34b71b4fc19dc18bf36cc10add008d0a4e7eb72e7b5"],
  ["eval/faults/off-wall-window.arch", "e3f6e07c15a1279d4b87451569f15789b2eb6c3777e301da64c4391335ead0f3"],
];

const ROOT = resolvePath(__dirname, "..");
const CORPUS_DIRS = [
  "examples",
  "examples/lib",
  "test/fixtures",
  "test/recovery-corpus",
  "eval/goldens",
  "eval/fidelity-plans",
  "eval/faults",
];

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

suite("byte identity — every corpus plan, every storey, with compile().diagnostics", () => {
  it("covers the whole corpus — it cannot silently shrink", () => {
    const corpus = CORPUS_DIRS.flatMap((d) =>
      readdirSync(join(ROOT, d))
        .filter((f) => f.endsWith(".arch"))
        .sort()
        .map((f) => `${d}/${f}`),
    );
    expect(BASELINE.map(([n]) => n)).toEqual(corpus);
  });

  it.each(BASELINE)("digest unchanged: %s", (name, hash) => {
    const path = join(ROOT, name);
    expect(allStoreysDigestWithDiagnostics(API, readFileSync(path, "utf8"), { world: worldFor(dirname(path)) })).toBe(
      hash,
    );
  });

  it("is not vacuous: the reproduction's digest is not the one it had before this rule", () => {
    // Measured on the same `main`: the plan failed with E_UNKNOWN_REF there.
    const src = plan(`  import "m.arch": s1\n  place s1() as g at (0,0)`);
    const world = makeVirtualWorld({ "m.arch": M });
    expect(allStoreysDigestWithDiagnostics(API, src, { world })).not.toBe(
      "5697a839c36ae7e89b6ef97ef927f6dd216e1ea7023a8dffe459e67209ded731",
    );
  });
});
