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
 * `test/fixtures/lock-before.arch`, `lock-partition-moved.arch` and `lock-window-moved.arch`
 * likewise (preview-and-remodel B1, the `impact --lock` acceptance pair; `test/lock.test.ts`).
 * `examples/remodel.arch` likewise (preview-and-remodel B3b, the wall-status drawing example;
 * `test/wall-status-drawing.test.ts`).
 * `examples/turning-stair.arch` likewise (issue #362, S2: the block stair's example).
 * `test/fixtures/storeys-eaves-overflow.arch` likewise (PS2.77, the multi-storey eaves overflow;
 * the same digest on `e432c24a`'s `src/`).
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
 *
 * 2026-10-26, plan-soundness PS2.11e/PS2.34/PS2.15 (six stair-safety lint rules): four examples
 * fixed for a real stair defect (`garden-house`, `hillside-villa`, `library`, `two-storey`; the
 * account is in `./byte-identity-baseline.ts`, "Four examples fixed: stair safety"), whose SVG,
 * `describe()` and `lint()` move; and `test/fixtures/zones-levels.arch` (no floor beyond its stair)
 * and `test/recovery-corpus/two-storey.arch` (the old example's head void and short run), which
 * only gain the new warnings: the new SVG, `describe()` and `compile().diagnostics` with `lint()`
 * stripped of the six new codes reproduce their previous rows (0d1a1bf3…, 309aae8f…).
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
// Re-measured 2026-10-26 (PS2.11e, PS2.46, PS2.54): the twenty examples fixed for a hob under a window, a hob beside a fridge, a hinged leaf over 1219 mm (now `door double` pairs) and a doorway approach read from the wall's face; why, in `test/byte-identity-baseline.ts`'s header. Not edited, gaining a warning (or a hint): test/fixtures/off-path-bypass (its cabinet 250 mm off d_d's face: `W_DOORWAY_BLOCKED`); the recovery-corpus copies of studio (`W_HOB_FRIDGE_GAP`, 150 mm) and themed (its bed 250 mm off the bedroom door's face); the holdout goldens compact-studio (a sink 250 mm off the kitchenette opening's face), core-and-shell (one 1500 mm leaf), dims-auto-cottage and galley-kitchen (a WC and a basin 250 mm off a door's face), sized-kitchen-flat, sized-wet-room and three-bed-2bath (a hob 100, 100 and 150 mm from the fridge), and against-wall-bath and attach-openings (the stove hint's anchored statement would now stand under a window, so it is no longer quoted); and eval/faults blocked-doorway and combined (the chest's gap now from the face: 100 → 0 mm). `lint()` and these hints only, per a sweep of every `.arch` against `8c2d6150` (the as-built note's table).
// Re-measured 2026-10-26 (PR #283 red-team round 1): the examples edited by its rulings (relational, hillside-villa, tiny-house, garden-house, terrace-row, and the widened `double` pairs of gallery-l, classroom-block and aquarium) and the summary of every example writing a `double` door (a person passes one leaf, so `describe()`'s clear width halves); why, in `test/byte-identity-baseline.ts`'s header Not edited, `lint()` only (the cited 305 mm hob figure): the recovery-corpus copies of studio (its message) and terrace-row (four hobs 300 mm from their fridges), and the holdout goldens sized-kitchen-flat, sized-wet-room and three-bed-2bath (their message).
// Re-measured 2026-10-26 (merging main@e432c24a, PR #280, into PR #283): garden-house, hillside-villa and library carry both PRs' example edits (the stair fixes and this PR's), each row the measurement with this suite's body; two-storey (and its recovery-corpus copy) is `main`'s row, unedited by this PR; why, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (PR #283 red-team round 2): eval/goldens/core-and-shell, `lint()` only: `W_LEAF_TOO_WIDE`'s hint now quotes widths rounded down to the plan grid.
// Re-measured 2026-10-27 (PS2.74): museum and practice-office, each accessible-WC pan moved into the 400–500 mm band by one line; why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header. Not edited, gaining `W_ACCESSIBLE_WC_SIDE_WALL` (`lint()` only): test/recovery-corpus/clinic, the frozen copy of the clinic before PR #305 (its pan 900 mm from the nearer side wall); with the rule off its previous row (8321ab6d…) reproduces.
// Re-measured 2026-11-01 (H4, #362): `test/recovery-corpus/two-storey.arch` only; the `W_STAIR_TOO_STEEP` hint no longer says "turn the climb into two flights with a landing". Old vs new `lint()` and `compile().diagnostics` differ in that one `hints[0]` string (no span, code, severity or count); the SVG and `describe()` do not read it. The old tree reproduces the old row.
// Re-measured 2026-11-01 (S2, #362, D24): the same row and the same one `hints[0]` string; the hint offers a block stair again, now that a landing replaces one going. Field by field against the old tree, nothing else moved.
const BASELINE: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521"], // re-measured for PS2.4, see header; PS2.10 dims fixed (byte-identity-baseline.ts); PS2.11e, see header
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283"], // PS2.11e, see header
  ["examples/classroom-block.arch", "809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6"], // added with the example, re-measured for net area, see header; PS2.11e, see header
  ["examples/clinic.arch", "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5"],
  ["examples/corner-cafe.arch", "199a01c5d9fcbe38de99e8a87109a800428eee868b171404e81e2dfbb51a57ce"], // added with the example, re-measured for net area, see header
  ["examples/courtyard-house.arch", "e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce"], // re-measured for PS2.4, see header; PS2.11e, see header
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: "Utility" reads `utility` (`byte-identity-baseline.ts`).
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"], // PS2.11e, see header
  ["examples/gallery-l.arch", "0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2"], // PS2.10 dims fixed (byte-identity-baseline.ts); PS2.11e, see header
  // Re-measured because the EXAMPLE changed (backlog D.1, its doubled chairs removed), and again
  // for the legend's ground swatches (backlog D.3, level 1's SVG only): the same row, with the
  // same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/garden-house.arch", "2ebce59ad2ade8fd181400ff73c88b9e6ab3af4217c1341a63745bb64ca4243d"],
  ["examples/garden-loft.arch", "f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0"], // PS2.11e, see header
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  // Re-measured for the facade-probe fix (level 2's `dims auto` chains only), and again because
  // the EXAMPLE changed (backlog D.2, its piano turned and moved): the same row, with the same
  // digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/hillside-villa.arch", "9f493e8903437b74f50eb72fd227871d17c13a17b6bc9ccf7592d423f6908572"], // re-measured, see header; PS2.11e, see header
  ["examples/imports.arch", "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252"],
  ["examples/laneway-house.arch", "21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e"], // PS2.11e, see header
  ["examples/library.arch", "9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92"], // PS2.11e, see header
  ["examples/materials.arch", "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/museum-wings.arch", "1149f0993df1cd719dcffd1d8c5c43c4ea6176c9a43b47954b23b3950bcc6f4a"], // PS2.11e, see header
  ["examples/museum.arch", "3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4"], // PS2.11e, see header; PS2.74 source edit, see header
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef"],
  ["examples/practice-office.arch", "f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4"], // added with the example, re-measured for net area, see header; PS2.11e, see header; PS2.74 source edit, see header
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/relational.arch", "4c117d32d823ccbfa76734397cf58001d5b3fcf700a67ee52b493856c436f5b1"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e, see header
  // ADDED with the new example (the issued-sheet statements), then re-measured once when the
  // thickness call-out change met it (drawing only): the same row, with the same digest body,
  // as `./while-byte-identity-baseline.ts`, whose header has both.
  ["examples/remodel.arch", "0899315f2bd50e559d3e6e13350734231cd9c11f821fa929a9d0c1b51f1e13db"], // new example (B3b), see header
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"], // PS2.11e, see header
  ["examples/terrace-row.arch", "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d"],
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"], // PS2.11e, see header
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"], // PS2.11e, see header
  ["examples/townhouse.arch", "2ba4f5c6510c8c1c5b0dce5fda946532a49aa27d9d14668e8398903af71f3612"], // PS2.11e, see header
  ["examples/transit-hall.arch", "a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5"], // PS2.11e, see header
  ["examples/turning-stair.arch", "9e27b499358898fd45376c73ca5771c883335999f3506c5b84acb3b1a4eef835"], // new example (S2), see header
  // Re-measured 2026-10-18 (PS0.7, the label classifier emits living; `describe()` only): the
  // same row, with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reasons.
  ["examples/two-bed.arch", "4fb4b10d1cde2487691965ce44bb8eb7e210c785e026f586dbeaf853f1e5b610"], // PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e, see header
  ["examples/two-storey.arch", "30fea74236f151947c7fec764e66b2f5a860ce6f71908a5a60fc68e87566837a"],
  ["examples/lib/doors.arch", "f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804"],
  ["examples/lib/fixtures.arch", "57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310"],
  ["examples/lib/furniture.arch", "adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b"],
  ["test/fixtures/axes-grid.arch", "e6be5d70788d931cacaa8cb1db2c2c454c1532d01153b90e2427c125770e5559"],
  ["test/fixtures/chain30.arch", "9ba4940dd0056ea94b3ff99e95a9288b8130a485aa2a3e7e97c9c6cc32b797d9"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"], // re-measured for PS2.4, see header
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"],
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/lock-before.arch", "23d883d88f5b94b73686c13e795ed57352dd778e3b807c1d73fdea1e3870943c"], // new fixture (B1), see header
  ["test/fixtures/lock-partition-moved.arch", "8a18c466ef0388eaba790eea5e5dc217fcdfe8d8624ec8e0ed529ec98a4e4d56"], // new fixture (B1), see header
  ["test/fixtures/lock-window-moved.arch", "5178ac32070a056b37462b4169b3fbdbbb0ee9a94ca05221cc0c64cedf89dd99"], // new fixture (B1), see header
  ["test/fixtures/off-path-bypass.arch", "81ef92c32f98bc41635428f477b2cf7e59adea520e60892b5e39aa48fcbcaecf"], // new fixture, see header; PS2.11e, see header
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"], // re-measured, see header; PS2.29: message text only, same code, same span
  ["test/fixtures/star30.arch", "93ffc93f0294e7eb2fed6e9db698f85e25e8f9f7a49d93a8de0d6028da05135b"], // new fixture, see header
  ["test/fixtures/storeys-eaves-overflow.arch", "e29b5e34735306051eeea8215d258873db2935ed3c7ebaf575a4b7af5cb89a6d"], // new fixture (PS2.77), see header
  ["test/fixtures/zones-levels.arch", "05693d9ec59a2c27dcf9c35c5b8d8d5a63969ee0931499b97305433324cb978f"], // re-measured for PS2.4, see header
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"], // re-measured for PS2.4, see header
  ["test/recovery-corpus/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["test/recovery-corpus/clinic.arch", "841d2f92464094900d7c44e9e3f0cad667135af05a27ad46ba9506284360025a"], // PS2.74: the frozen clinic gains W_ACCESSIBLE_WC_SIDE_WALL, see header
  ["test/recovery-corpus/materials.arch", "bbda743cf59fdd49e1295d036c024723d5be658f0e1791202e08148f48b69ff6"],
  ["test/recovery-corpus/parametric.arch", "2a6b29053ac201b452bde4204087f10b17648473e3080327d2486e0cba11d86b"],
  ["test/recovery-corpus/studio.arch", "e547313409b32843df1bc48897017b2d404b2f6a5316d9318b529362f96cb57d"], // PS2.11e, see header
  ["test/recovery-corpus/terrace-row.arch", "776d912f42b22e335c57392e9edb02c9207b20c53c6c6db0c118484a68cda4d0"],
  // Re-measured 2026-10-18 (PS0.7): a copy of `examples/themed.arch`, the same cause and value.
  ["test/recovery-corpus/themed.arch", "ad274a10c13b1aa035e3e32fed8b6aecc0b0d6a1b2e5112008a647f5fde638e3"], // PS2.11e, see header
  ["test/recovery-corpus/two-storey.arch", "db2cbde429ffc47cad0d358763626405d673525be3cb1797e88ed5492fc740e7"], // re-measured for S2 (#362): `W_STAIR_TOO_STEEP`'s hint reworded, nothing else; was 2102a710477b9a23e3eb5a99256840119629b128297515d9603ec459c800ff99
  ["eval/goldens/accessible-bath.arch", "d92fb8bf1dafde517a579409ff32602a06687a29149d3c2e7e1de69bd4cc4fce"],
  ["eval/goldens/accessible-flat.arch", "3809f58573d9685eb190389ae026bdbafa161dd57bdbf109a90048f4bb3e802a"],
  ["eval/goldens/against-wall-bath.arch", "731d8f1fc40ba19a5f431d54a643f236d70e4ae92aca19368cea2a38f29d734e"], // PS2.11e, see header
  ["eval/goldens/anchor-furniture.arch", "c825ed175012280d8d024156f13d0b5e7bd3d3fca4a8ffde1f8d298b200c897c"],
  ["eval/goldens/attach-openings.arch", "658dd5a6589283292b8269548c0f38d01e57503ed244e40cd1084add86c290c1"], // PS2.11e, see header
  ["eval/goldens/bungalow.arch", "4271ab6f36107a1e601f0e031955d1d06a1be07ceecd959ca5b857becdf7be86"],
  ["eval/goldens/compact-studio.arch", "36b588ea8e25c29f6be7523de08b31c41ec63fe4ab8bd1a40a93daca4885f784"], // PS2.11e, see header
  ["eval/goldens/core-and-shell.arch", "b84aa455bcdbe9aafcece0fe148b8b0e74bb0e80bc82341b0e08c76b582e7bfc"], // PS2.11e, see header
  ["eval/goldens/dims-auto-cottage.arch", "81802174915f42a6ccc439d4e39874269621418e877926a862edb47ff890fd15"], // PS2.11e, see header
  ["eval/goldens/galley-kitchen.arch", "34aeb2569136729162f1a17662cb84f988ce243a208e3cb9c83cdc7ab6989979"], // PS2.11e, see header
  ["eval/goldens/l-shaped-flat.arch", "a98fde0d72db97ad3033d0b02344a655b5a882fd330f4e756dfcc35860cd5931"],
  // Re-measured 2026-10-20 for PS2.19 (`describe()` only: "Open Office" reads `office`) and again for
  // PS2.18 (`lint()` only: the kitchenette's daylight warning declines); see header.
  ["eval/goldens/office.arch", "1a973564c08433ff368642c0bcba6a0e6d0429e15ab299a1a21cccb21cf3ef5d"],
  ["eval/goldens/open-plan-loft.arch", "63b2581c909426a3bc1cda32ae6e2f18ab6b55c054d15ab50cd8854139438440"],
  ["eval/goldens/reception-suite.arch", "a7e7e954b7892c3cbef6842a7d18591ba1d492ee9d61d42161b2e35232170756"],
  ["eval/goldens/relational-studio.arch", "e4eec5ae0421fb401d506e00aeb8caa6f00af6523a88975a5249840c60d0400b"],
  ["eval/goldens/scripting-units.arch", "4278fd060523d0683d10698e5b664ca08c18f1bdef0bc6c5e3502d40cb928396"],
  ["eval/goldens/sized-bedrooms.arch", "d89893bae1e7569300d69f5984e7ef04a959c0fa72081758a247d81d50f959c8"],
  ["eval/goldens/sized-kitchen-flat.arch", "c1426cda7baa416b544ca2fee61c9ca1fd11656e86294d0cf325e0c0c1934cf0"], // PS2.11e, see header
  ["eval/goldens/sized-office-mix.arch", "d129cf5e22d3311c115ef632f749fe5fc8c535d0b58c54ab209fcaec1cbad960"],
  ["eval/goldens/sized-wet-room.arch", "7c6a75b0fdb78471728925e3fb4057fdeee8e1c3ec213cf062b834c644dc7961"], // PS2.11e, see header
  ["eval/goldens/strip-attach-clean.arch", "de82e3e66dcaf656743890891a14e893306fc09e09dad8a72407288388557494"], // re-measured, see header
  ["eval/goldens/strip-corridor.arch", "3f4df475aef8e3fda40bb8371c7550c777eceb2add0639fff5c4a0f8f8a4fee7"],
  ["eval/goldens/three-bed-2bath.arch", "03d290c7c4f77c2508468701e8ef70f34179bd0d1dd553271b66945a209b404d"], // PS2.11e, see header
  ["eval/goldens/two-bath-flat.arch", "f080683ead3f7d3e4b32470f067a39c011ad9195703277374ba198c59f31ae0a"],
  ["eval/goldens/two-bed-hall.arch", "8dc7c690d9d6fb848e086db8882f2d6c6eb0b4f3f583a192985cc9cf94a2fad2"],
  [
    "eval/fidelity-plans/capped-wet-room.laundered.arch",
    "03b236fb694bde8aada86fb4c4bf9c737431704ace1cfa182b3cc7f85f7822ca", // PS2.29: message text and the new door-id hint of W_SWING_OBSTRUCTED, same codes, same spans
  ],
  [
    "eval/fidelity-plans/four-bed-cap.laundered.arch",
    "6846f91e3b6b2af062e5b38f8d727c58d88cb96d934de5c1756a54ca6a816ed7",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.faithful.arch",
    "6c80e1b1facf425095acf8ca109a43d0b31338aaf344f067c6a26bc12cfb0af5",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.laundered.arch",
    "144db7eb9193223fa001d32b7b3877afcf86cfe53419daa46d18fb9714cf3591",
  ],
  [
    "eval/fidelity-plans/over-programmed-flat.laundered.arch",
    "bd25f8cb69904cbd428c1a5beb94fac3c620a13b575af7258cda8a835850af74",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.faithful.arch",
    "b12281ae967fb6d73120d9b3d5a876479fec788367e94b8ca762807bc3f519bf",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.laundered.arch",
    "5d728d9eb59b4204bc828462cc3a79b299a79f9f26d5d2612acf11c3f4d9b88f",
  ],
  [
    "eval/fidelity-plans/wide-doorways.faithful.arch",
    "1293a84e10439aa745aa581f4f6b963be23343541b9b800d53091232dca721af",
  ],
  [
    "eval/fidelity-plans/wide-doorways.laundered.arch",
    "c078a19c5369d0c124f5101388a3ae6db3aa6fa6b5e52aee38c6a935dd19fd50",
  ],
  ["eval/faults/blocked-doorway.arch", "84a24569f8086d67be092825cdadae91c9ba24001902a55318da0cd9cc31458b"], // PS2.11e, see header
  ["eval/faults/combined.arch", "a6b4816b4c253235c5ea01927c60546416b36c07305cd2b9bf39f18519f28176"], // PS2.11e, see header
  ["eval/faults/furniture-through-wall.arch", "20190dd103c9d4eb57dc7a1a1847a96ed041cf5d8162119f49a305fc3869aa3e"],
  ["eval/faults/off-wall-door.arch", "b213f8bb418871df0e1e6a8f4d771f33ebb2f15a8fbbb6a89e9716796b172b38"],
  ["eval/faults/off-wall-opening.arch", "43fb130733db20b7d2cd72ed7997d9e6cc53de9f8f1ae208e6267975aaf8775c"],
  ["eval/faults/off-wall-window.arch", "49231dd8f88c327fffb9127b2e48bf7b0ac9f626f3f3b7e527e91637c9f6e336"],
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
