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
 */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "7d17249d81b43f1ff5b17c6b1219750bbdd695599f31e66fb298be9facc7c169"],
  ["examples/aquarium.arch", "cd69652d35d177efcacfbb73fe1d8b5b05a78702aac0d48305120a8d29efaf61"],
  ["examples/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["examples/bungalow.arch", "b841a0cee3ddba6e29c5ca17fb0f22a382d9409f3b0cd2c3f1ad6c6848e2dbde"],
  ["examples/clinic.arch", "f97b4e5d19662e220c8b95752d14ff5d1cf111525ed7c6b86feacecb0f8c8cb8"],
  ["examples/courtyard-house.arch", "c143144408b02775b6343eee9dbda3420a7947df651195bed024768620715335"],
  ["examples/furnished-flat.arch", "12473e1ca6aaacf6adea0da3c46565d93a14a8396700eed2f8d70dd90d73957a"],
  ["examples/gallery-l.arch", "0f52fc12ee4cf93c8d7c106be8a5a49c8b78c3a66cd9afabd00149d57f47802c"],
  ["examples/garden-house.arch", "36d99115620aed5aa6731f66a03187824e029fe54f33cb8a2e9c7bfe721764c9"],
  ["examples/garden-loft.arch", "1fbeaf41b1f1b981f274a1501ed870bb6b3ebc2ec377bd15e588e78cbd07ab7b"],
  ["examples/hexagon-pavilion.arch", "293447ab543aa86945af475e440ff85cddb8070f3330d6887e94f5e344d4c216"],
  // Re-measured for the facade-probe fix (level 2's `dims auto` chains only): the same row,
  // with the same digest body, as `./while-byte-identity-baseline.ts`, whose header has the reason.
  ["examples/hillside-villa.arch", "233b1b68ac50ff026ca0299f4083191dfdc557556f99ca6b78483d9ba515a4ad"],
  ["examples/imports.arch", "dbbdb95881775e34e5abecc72a52bc72160af81a5883ddced18bbf3d7f1a7f2c"],
  ["examples/laneway-house.arch", "2315eb23382b52aa784930c332c00083b7d9931c4620a46b8b710c75e4c1195e"],
  ["examples/library.arch", "5c4913bdc5e2960d6cac2203cdb775ed56179c232550efe893a1dfab492d3215"],
  ["examples/materials.arch", "115a724fe9b7036c5d8e1ae2d7fc087126df41d9adbe390a97cbb80354b83c64"],
  ["examples/museum-wing.arch", "860439d86b4b406c7af8d184a078c6461580b219c70227e3aabeda9b25cde862"],
  ["examples/museum-wings.arch", "da045e501bf580920bed1c764766dda64cfb8cab8de1218d292dcbd4852d2ef7"],
  ["examples/museum.arch", "ecdc2f529a170001d711f2b7656f987004cefadea1cbaae972c31c6c7dc911f3"],
  ["examples/one-room.arch", "050d5beb84aff06312d933a3b16de45f4b98cac0aa2d25efba6ed0234f45e4ca"],
  ["examples/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["examples/relational.arch", "78396bc038b0198f2ed2952cc6169d0c810ffeb4149d04ba3203aa397a16cabd"],
  ["examples/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["examples/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["examples/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["examples/tiny-house.arch", "af84b98168791a856d4b2787106534b2def58541ad554405d6d890c576444106"],
  ["examples/townhouse.arch", "9b1298ecccc1a1a0010e8f533982b298ab25ae8dff257e56ddd2e1056a7f47c5"],
  ["examples/transit-hall.arch", "7dd542eb7bb1110e5b15ac375653f2a015826dc292ecbb1eb62063bf5a444c7a"],
  ["examples/two-bed.arch", "595276f8bf7cf2b3531acf5f6f89808b33653e3ec99c4d30e5ca9b81d5f8bd1f"],
  ["examples/two-storey.arch", "40db64f06de76a95b038de66acc9ddd996020a2c84c48e5d6e1670ac8c247adb"],
  ["examples/lib/doors.arch", "5ae00707fc962b042e0e7e8d824a15a6bf7c7b4889bfb721632c667f7614396d"],
  ["examples/lib/fixtures.arch", "71bb04c18469e802cf1c04e05e2f2685a76912a18ce2052a9eba2b233b4a974c"],
  ["examples/lib/furniture.arch", "ca0855ab5f5f529305941fb64427d316c1c048fe9a2809d0c5ef00eabedc88ed"],
  ["test/fixtures/axes-grid.arch", "6f1e4a5a6c27df9deeb26885d5d97da5b574d8e644acd0fa6fc588c11f610695"],
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "a0aa011cfb507ce20b4945afdc748d71b196d54a016269c539fee59223519f15"],
  ["test/fixtures/diff-b.arch", "e3824c83ed8db86eda56328ef12cf598ad200cceee01ff63c7400bd13ef8cfb9"],
  ["test/fixtures/diff-circ-a.arch", "84d413c8733e5dae6fe6adf57a9ecea3ced920501be76a4175f225ea2e8a9974"],
  ["test/fixtures/diff-circ-b.arch", "c22679ed9da2f1386e64c665245bb8a4555ffb5e7f38010e5d4252c858a8f2f9"],
  ["test/fixtures/schedule-sheet.arch", "3f66597531afcf2d8be6c4a297121aa309f08887fc369ca5f322fa12b95433e5"],
  ["test/fixtures/zones-levels.arch", "2ee9feeb3f6ca7c09e51eee71ffb78272b3b09be7ccdccbf87a38a4ee1234cae"],
  ["test/fixtures/zones-wings.arch", "9375f1e04051120bf1d5734fe7a99a7dd828926d08993da28ec5b3d02a20591c"],
  ["test/recovery-corpus/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["test/recovery-corpus/clinic.arch", "f97b4e5d19662e220c8b95752d14ff5d1cf111525ed7c6b86feacecb0f8c8cb8"],
  ["test/recovery-corpus/materials.arch", "115a724fe9b7036c5d8e1ae2d7fc087126df41d9adbe390a97cbb80354b83c64"],
  ["test/recovery-corpus/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["test/recovery-corpus/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["test/recovery-corpus/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["test/recovery-corpus/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["test/recovery-corpus/two-storey.arch", "40db64f06de76a95b038de66acc9ddd996020a2c84c48e5d6e1670ac8c247adb"],
  ["eval/goldens/accessible-bath.arch", "8a06dc1f092eb641d7b14895561328a74330d5a07337d1f3082259652b434649"],
  ["eval/goldens/accessible-flat.arch", "6a3e3cd076e055fa83f56c38f17eb16f417e799a58250c90b9111dda52613281"],
  ["eval/goldens/against-wall-bath.arch", "e50dada1bbdf60e384d778e9d14af5df21d7ba52e3bac27ae00888ca2180de1e"],
  ["eval/goldens/anchor-furniture.arch", "97dedd43834ce64c58a58e1150c77efcf99c8099ae1b3e67a9810add92a3107d"],
  ["eval/goldens/attach-openings.arch", "a71997936ccd603733d51d8d40127e8d839f56352b9d287b19761ddc4d6f69ff"],
  ["eval/goldens/bungalow.arch", "8a78708cb2e3a68c804503f21636760a10f5f2340ade7c466504bce97cb0a75e"],
  ["eval/goldens/compact-studio.arch", "cf52c97f1d5f7d7c4828cab6b822c751be4cb23593b74b2ade0cbcbfe3f78f5e"],
  ["eval/goldens/core-and-shell.arch", "40b00cd8da00864d73b04b6eff3c5e0d753680f189a96a6cdd7c2c4cf4dd9cb3"],
  ["eval/goldens/dims-auto-cottage.arch", "5948ff7eef4ac6ddb90dcc8f411133ca2c58d656e302dcf3a573843618364556"],
  ["eval/goldens/galley-kitchen.arch", "b190809df967d7008c95e68134df884f1d95426299a87e6da36b9d7eb92ac183"],
  ["eval/goldens/l-shaped-flat.arch", "a87ad704ec87c54f4f2a769f2c98ec037c4a48f9927c06616644b7df3972ce9c"],
  ["eval/goldens/office.arch", "ca092efa461b06eafd3fe564c4181954c7d7caec3437ebe75d43148916c9d3de"],
  ["eval/goldens/open-plan-loft.arch", "7748783a6670f951810ea8d023e02fe1c322c66823eb7c8054b8c17bea6d0b40"],
  ["eval/goldens/reception-suite.arch", "d892d4ab7a71b448cf054c71faa9b64ec5c08323e398bac22837d253f4900540"],
  ["eval/goldens/relational-studio.arch", "cfcf525c809c750fefe98d1a61b8d74c812e973032568b8d355f9680c370f72d"],
  ["eval/goldens/scripting-units.arch", "1be140a2007206ebbcf26c2c827a16700de809d1ca027a3a67ab284cd7ec21d4"],
  ["eval/goldens/sized-bedrooms.arch", "67bd3800febc6ad5991317bcd9fe0c0744acb70ee80c27e8a4b96cad61c6e293"],
  ["eval/goldens/sized-kitchen-flat.arch", "c0f81334c48dd897c3faf62669b2e22047391df9058c14901457c11022dfb7cb"],
  ["eval/goldens/sized-office-mix.arch", "c049ed201afa25af8495bc704489ed0b3fb7f10213a778c78a2c62aafd610385"],
  ["eval/goldens/sized-wet-room.arch", "f977bf5849035621b9fabebc46a859581ffc564d6e43862662e2933e03778870"],
  ["eval/goldens/strip-attach-clean.arch", "90ec59f876aea6ca2cd1db41eaac638a54f0f2da4b57dcd3e6c2ac3ca9eef549"],
  ["eval/goldens/strip-corridor.arch", "952b90cc7e2f66db3ece1fa383032457ded46a74e8a7c3ad0e709d176f80aef1"],
  ["eval/goldens/three-bed-2bath.arch", "c433244610d18871277c1ee659cde25a7a9b91a1d29dbb9902c6894031d39d78"],
  ["eval/goldens/two-bath-flat.arch", "87afccf4cf0338d2b61f0e9d97024cbca84d89c986fb809fd0b47c4ae8299e69"],
  ["eval/goldens/two-bed-hall.arch", "d28a5b164c15cf277aa020a82dd93d6e0bfa01851048eb75e040d0182d285dc5"],
  [
    "eval/fidelity-plans/capped-wet-room.laundered.arch",
    "13f306ba9dd2912b7bce5ffcdf71946a3af8fe27d5e98e1206e4c989389cbceb",
  ],
  [
    "eval/fidelity-plans/four-bed-cap.laundered.arch",
    "c35f1bd3308dcadbdc8d2f5be657f0e9770a2baf02fc96acd513139952fa2a14",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.faithful.arch",
    "590ade3a659fa03f5ae682e3b9e8d80e1a64054ead7f0236dd77f246d606b486",
  ],
  [
    "eval/fidelity-plans/min-bedroom-flat.laundered.arch",
    "21265d4380b6c8746393a54aaa0d08c0ec404c5f1eddf1efadbbe5986dcd2c31",
  ],
  [
    "eval/fidelity-plans/over-programmed-flat.laundered.arch",
    "5e31cac66e4b11da558747166c4ede37ba3c9bb2c7d187fd59413de69babc9eb",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.faithful.arch",
    "e1b52ba5db539264989d0e6823089547f5bc090fc168d7a908246f2d80d0bb36",
  ],
  [
    "eval/fidelity-plans/two-bed-min-area.laundered.arch",
    "fff47a0ec9f8a8ed509132be3d46959eae80b2364f7cef2f0d9f5685c755d011",
  ],
  [
    "eval/fidelity-plans/wide-doorways.faithful.arch",
    "1bdc549f425a786a0cf0f3649178bab9aacc216001e2944005ad62419cb8fe84",
  ],
  [
    "eval/fidelity-plans/wide-doorways.laundered.arch",
    "192e258da46d5321cd065074be863a6b048df7a5550c2fdb0adaeb2823fe32ed",
  ],
  ["eval/faults/blocked-doorway.arch", "63f8d3830c9a0842409d7354ea44389e89fa4e1ddfb71e51f551d1c296ef3092"],
  ["eval/faults/combined.arch", "7f51d2ddae2283191f52a932f9a4683ab2fe2ae51f73b4720c4fc54a2acba260"],
  ["eval/faults/furniture-through-wall.arch", "68d97c719daa26e04c0c9c839f130e75c3856c61de882c3d3ef9e5338e7d227c"],
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
