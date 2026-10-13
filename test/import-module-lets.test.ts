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
 */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "7d17249d81b43f1ff5b17c6b1219750bbdd695599f31e66fb298be9facc7c169"],
  ["examples/aquarium.arch", "bd7b2666cb68c863d7a89064d0b96710e130cc2163ba426750ca1b76f8e22ba0"],
  ["examples/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["examples/bungalow.arch", "1e374f87b266082707aa4e0baa263a2f2784ddc75eba8aeec94e5049f97d84ae"],
  ["examples/classroom-block.arch", "ebc0980ed917903edb1326185314716e4ceba136f7635f0f623f57dd665a9886"], // first measurement, added with the example
  ["examples/clinic.arch", "2713e28ea3bfb3409f54cab4fac70402777397fbc0414ac91fd22a13093b6a9d"],
  ["examples/corner-cafe.arch", "80f015667ee308b0114411abf462f7e8ff1137f0680565cc0898dbaac5e49750"], // first measurement, added with the example
  ["examples/courtyard-house.arch", "91c2a44265e69f983cf775eed28aa33e0aa5888334ad13856662a15fefa68169"],
  ["examples/furnished-flat.arch", "12473e1ca6aaacf6adea0da3c46565d93a14a8396700eed2f8d70dd90d73957a"],
  ["examples/gallery-l.arch", "83bfc4e12622ae307469b173ce83a27b9dcb5aafd661fa004a8330f58c14e4e4"],
  // Re-measured because the EXAMPLE changed (backlog D.1, its doubled chairs removed), and again
  // for the legend's ground swatches (backlog D.3, level 1's SVG only): the same row, with the
  // same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/garden-house.arch", "78af129f024f23540fc2ea037bd3ba8f5eb8875098303ee5899ce5a8fe4715d8"],
  ["examples/garden-loft.arch", "35f94551f233a8b74a41fa33653068b5f7a6a39afd362d0646b861d7c44e5a4d"],
  ["examples/hexagon-pavilion.arch", "293447ab543aa86945af475e440ff85cddb8070f3330d6887e94f5e344d4c216"],
  // Re-measured for the facade-probe fix (level 2's `dims auto` chains only), and again because
  // the EXAMPLE changed (backlog D.2, its piano turned and moved): the same row, with the same
  // digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/hillside-villa.arch", "4eed978244287e971800bed3775fff061c0602b894b8076087c1e0532678752d"],
  ["examples/imports.arch", "dbbdb95881775e34e5abecc72a52bc72160af81a5883ddced18bbf3d7f1a7f2c"],
  ["examples/laneway-house.arch", "22c7826c336b629f99f486b29fd601033ba3220c27a8db9ab166f4de721ab40f"],
  ["examples/library.arch", "087897f49ddcea8e83f7c59081946b38e36db0b6f4afe37aa99e4f91522b54e9"],
  ["examples/materials.arch", "3222a896a4a48f27bb92bb3e6396fde2395af69307536eae38cdd75e8bcf32cd"],
  ["examples/museum-wing.arch", "961bb8630adfb67925212a4ddfd0ad2fa95213306e8d3ee27def73dcb8bb6d6e"],
  ["examples/museum-wings.arch", "9d1a8cd57df5a37100ec394c8a263481d280a7e1cef5d53c931fb13b2a5972c1"],
  ["examples/museum.arch", "7635661a9e48d26588950f7c4c902b7961f2e28bc50025e55b20f2053a5a67d3"],
  ["examples/one-room.arch", "050d5beb84aff06312d933a3b16de45f4b98cac0aa2d25efba6ed0234f45e4ca"],
  ["examples/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["examples/relational.arch", "78396bc038b0198f2ed2952cc6169d0c810ffeb4149d04ba3203aa397a16cabd"],
  // ADDED with the new example (the issued-sheet statements), then re-measured once when the
  // thickness call-out change met it (drawing only): the same row, with the same digest body,
  // as `./while-byte-identity-baseline.ts`, whose header has both.
  ["examples/sheet-notes.arch", "90e7d0ad148524bd71ba014f2b3849737034c6a23f27bf6f5a40ea800c20eaa1"],
  ["examples/small-office.arch", "d1ad040c172e5ae6643bebec52e5e3613fa99b185238dfc1733a39346bb63c3e"], // first measurement, added with the example
  ["examples/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["examples/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["examples/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["examples/tiny-house.arch", "af84b98168791a856d4b2787106534b2def58541ad554405d6d890c576444106"],
  ["examples/townhouse.arch", "35e1b257702e6facdc73fa3bf34e00571d7721744b6c20e816246198ecf361a7"],
  ["examples/transit-hall.arch", "adf801635352b34e5fbba07ea84cd55c5b2df81a8a13b12dc2722e963c48ff56"],
  ["examples/two-bed.arch", "595276f8bf7cf2b3531acf5f6f89808b33653e3ec99c4d30e5ca9b81d5f8bd1f"],
  ["examples/two-storey.arch", "1876fbe4389260e58f93a68c8100c81fd7fb7976ad3dc926ba68ba5d7d2e4419"],
  ["examples/lib/doors.arch", "5ae00707fc962b042e0e7e8d824a15a6bf7c7b4889bfb721632c667f7614396d"],
  ["examples/lib/fixtures.arch", "71bb04c18469e802cf1c04e05e2f2685a76912a18ce2052a9eba2b233b4a974c"],
  ["examples/lib/furniture.arch", "ca0855ab5f5f529305941fb64427d316c1c048fe9a2809d0c5ef00eabedc88ed"],
  ["test/fixtures/axes-grid.arch", "2c703799551f36dfba311db77835e04ca15ef5a38e7fe7e7ff8fb9eee511a284"],
  ["test/fixtures/chain30.arch", "b1e38c910666b9f7f7bf2fb6e8a4b043fe7787419e1e0b41bfad0be774194b09"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "a7bad45dcc57e01a854d130cf857857ae056546c8f8b37ddd5474f22c2cf1bb1"],
  ["test/fixtures/diff-b.arch", "aed751c9f9579dd29c93d4c0363c1f17428fc68f6e6003f59281824eacd7ff06"],
  ["test/fixtures/diff-circ-a.arch", "84d413c8733e5dae6fe6adf57a9ecea3ced920501be76a4175f225ea2e8a9974"],
  ["test/fixtures/diff-circ-b.arch", "c22679ed9da2f1386e64c665245bb8a4555ffb5e7f38010e5d4252c858a8f2f9"],
  ["test/fixtures/off-path-bypass.arch", "db9817836d83fc29efad66097ca383032c0c918d8ca4fabb23e2feed79f088a3"], // new fixture, see header
  ["test/fixtures/schedule-sheet.arch", "fd7706850384f0179d82a74abd64f4e0744de7705eb0ddf25aae71eb3617a24b"],
  ["test/fixtures/star30.arch", "e5cf06a13db022de20a0a085d113e38405b4ea1dd81325890fd9c8a68db6e539"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "2ee9feeb3f6ca7c09e51eee71ffb78272b3b09be7ccdccbf87a38a4ee1234cae"],
  ["test/fixtures/zones-wings.arch", "9375f1e04051120bf1d5734fe7a99a7dd828926d08993da28ec5b3d02a20591c"],
  ["test/recovery-corpus/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["test/recovery-corpus/clinic.arch", "2713e28ea3bfb3409f54cab4fac70402777397fbc0414ac91fd22a13093b6a9d"],
  ["test/recovery-corpus/materials.arch", "3222a896a4a48f27bb92bb3e6396fde2395af69307536eae38cdd75e8bcf32cd"],
  ["test/recovery-corpus/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["test/recovery-corpus/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["test/recovery-corpus/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["test/recovery-corpus/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["test/recovery-corpus/two-storey.arch", "1876fbe4389260e58f93a68c8100c81fd7fb7976ad3dc926ba68ba5d7d2e4419"],
  ["eval/goldens/accessible-bath.arch", "8a06dc1f092eb641d7b14895561328a74330d5a07337d1f3082259652b434649"],
  ["eval/goldens/accessible-flat.arch", "6a3e3cd076e055fa83f56c38f17eb16f417e799a58250c90b9111dda52613281"],
  ["eval/goldens/against-wall-bath.arch", "e50dada1bbdf60e384d778e9d14af5df21d7ba52e3bac27ae00888ca2180de1e"],
  ["eval/goldens/anchor-furniture.arch", "97dedd43834ce64c58a58e1150c77efcf99c8099ae1b3e67a9810add92a3107d"],
  ["eval/goldens/attach-openings.arch", "a71997936ccd603733d51d8d40127e8d839f56352b9d287b19761ddc4d6f69ff"],
  ["eval/goldens/bungalow.arch", "8a78708cb2e3a68c804503f21636760a10f5f2340ade7c466504bce97cb0a75e"],
  ["eval/goldens/compact-studio.arch", "cf52c97f1d5f7d7c4828cab6b822c751be4cb23593b74b2ade0cbcbfe3f78f5e"],
  ["eval/goldens/core-and-shell.arch", "84af937dbce93717860c527a6ceb1a97a35b8a670c07a554e7b23b50f4170688"],
  ["eval/goldens/dims-auto-cottage.arch", "917fb0cfdc332a48c378d5b2fe20bbe2b0eaa08a3aef7f565ea0f7c559f8d186"],
  ["eval/goldens/galley-kitchen.arch", "b190809df967d7008c95e68134df884f1d95426299a87e6da36b9d7eb92ac183"],
  ["eval/goldens/l-shaped-flat.arch", "90113c81e835dd968f8e5bb9fd1a46cc4cd6e00b0e440f97b1f7ea8b67c4e7fb"],
  ["eval/goldens/office.arch", "ca092efa461b06eafd3fe564c4181954c7d7caec3437ebe75d43148916c9d3de"],
  ["eval/goldens/open-plan-loft.arch", "7748783a6670f951810ea8d023e02fe1c322c66823eb7c8054b8c17bea6d0b40"],
  ["eval/goldens/reception-suite.arch", "a8527cf19555c6d5f99756d403f6f98bc0b179d769137380d410beb11974f2dd"],
  ["eval/goldens/relational-studio.arch", "cfcf525c809c750fefe98d1a61b8d74c812e973032568b8d355f9680c370f72d"],
  ["eval/goldens/scripting-units.arch", "1be140a2007206ebbcf26c2c827a16700de809d1ca027a3a67ab284cd7ec21d4"],
  ["eval/goldens/sized-bedrooms.arch", "67bd3800febc6ad5991317bcd9fe0c0744acb70ee80c27e8a4b96cad61c6e293"],
  ["eval/goldens/sized-kitchen-flat.arch", "c0f81334c48dd897c3faf62669b2e22047391df9058c14901457c11022dfb7cb"],
  ["eval/goldens/sized-office-mix.arch", "9787bb4806543281381683750bd160a9cebf2050ec0c5ff363f9bc5dde895b03"],
  ["eval/goldens/sized-wet-room.arch", "f977bf5849035621b9fabebc46a859581ffc564d6e43862662e2933e03778870"],
  ["eval/goldens/strip-attach-clean.arch", "90ec59f876aea6ca2cd1db41eaac638a54f0f2da4b57dcd3e6c2ac3ca9eef549"],
  ["eval/goldens/strip-corridor.arch", "952b90cc7e2f66db3ece1fa383032457ded46a74e8a7c3ad0e709d176f80aef1"],
  ["eval/goldens/three-bed-2bath.arch", "d697fc84915e67d2e26aaf548ba8750423ba0916cd518dacb1b55a8517ca579f"],
  ["eval/goldens/two-bath-flat.arch", "7b02ce87583b07531cdd6eec25b1b4fd26e3e0d34c386cb165597002fbb3feab"],
  ["eval/goldens/two-bed-hall.arch", "a8848e530097c54b92f2915945be130dc4c22b8502bc925ee313d084d3215d3d"],
  [
    "eval/fidelity-plans/capped-wet-room.laundered.arch",
    "547f0e3daf8b55359fa77556790923eda386f05a8c90e7c77b571100b2725b93",
  ],
  [
    "eval/fidelity-plans/four-bed-cap.laundered.arch",
    "c35f1bd3308dcadbdc8d2f5be657f0e9770a2baf02fc96acd513139952fa2a14",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.faithful.arch",
    "50ab5059293b27747811d9f767927211589a1465d115462c5a13fd26118f9fcd",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.laundered.arch",
    "47bb377d37ba79e48326a874f2deabe210aabaecf46a422c25e2eae060a20dfc",
  ],
  [
    "eval/fidelity-plans/over-programmed-flat.laundered.arch",
    "1281a8ebaf25f2aa0b502eb5cf2e8ad5590ee5bd30547c9b22657d504416ea06",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.faithful.arch",
    "e27e739d6b9baa59153bc6005cb6b4bcc9e510acfe802ff11bf9756e3086bb84",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.laundered.arch",
    "8b39d9274e03eab0090432642a596c16836994635d5724f91fb0f18b6ec0f47d",
  ],
  [
    "eval/fidelity-plans/wide-doorways.faithful.arch",
    "a99fd393602e6e7689848d0b9582f94bf3c86c7179ae38ccdc89c7d95303bd2d",
  ],
  [
    "eval/fidelity-plans/wide-doorways.laundered.arch",
    "eb095b96bfccc8e9bd60f76770a13b4614e2b66d12e2d0fa14891a816999ed92",
  ],
  ["eval/faults/blocked-doorway.arch", "fc58f6cad1c4c3d3b50bceb98a7c01b1c5ebab280d63fa7eaf4c2889941f203a"],
  ["eval/faults/combined.arch", "d63cfe8e9b9b7e5d2de98bbbd79c98a6fbdc4053737787b354a99e332ef01177"],
  ["eval/faults/furniture-through-wall.arch", "8086bf6b28ba4952b5a64b3c9ee12576cdb205cfc8adfcf57c249446792cdce4"],
  ["eval/faults/off-wall-door.arch", "482edf124e42e1a4fb706de30ac9a22b44e642651a79e4da2b340f8bf21c0957"],
  ["eval/faults/off-wall-opening.arch", "79337035fcfa5f7d77fc894faf1951071bd868204d538d7e97947c0f6491c803"],
  ["eval/faults/off-wall-window.arch", "2e146a3b275111bcdf4b824199d68058b0ffe14777b3dfef30f46a37acbcfee5"],
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
