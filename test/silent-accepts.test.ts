/**
 * Silent accepts made audible (product-roadmap RM1.4 and RM1.4b, then AF10 step 2): six warnings, never errors,
 * for what the compiler used to take without a word.
 *
 * | code | trigger | fixture |
 * |---|---|---|
 * | `W_LENGTH_IN_METRES` | a room `size` with both sides under 100 mm, a wall thickness under 10 mm (U.2) | `test/silent-accepts/length-in-metres.arch` |
 * | `W_GRID_SNAPPED` | `grid` moved a written size, wall thickness or door `at (x,y)` (PS0.25, 6.10) | `test/silent-accepts/grid-snapped.arch` |
 * | `W_SET_VALUE_WORD` | a bare `set` word the kind does not read (PS0.16; an error at 2.0, RM-D6) | `test/silent-accepts/set-value-word.arch` |
 * | `W_UNKNOWN_FURNITURE` | an unlabelled furniture word near a catalogued kind (U.3) | `test/silent-accepts/unknown-furniture.arch` |
 * | `W_UNKNOWN_THEME` | `theme <name>` that names no known theme (RM1.4b) | `test/silent-accepts/unknown-theme.arch` |
 * | `W_AREA_AS_LENGTH` | a room side, wall point or thickness, or opening width that is a name times itself (AF10 step 2, first slice) | `test/silent-accepts/area-as-length.arch` (clean twin `area-as-length.clean.arch`) |
 *
 * The fixtures stand in a folder of their own, outside the corpus directories (`test/helpers/corpus.ts`),
 * so no corpus table gains a plan.
 *
 * ## The law: a plan that triggers none of them is byte-identical
 *
 * {@link BASELINE} is {@link allStoreysDigestWithDiagnostics} (every storey's SVG, `describe()`,
 * `lint()` and `compile().diagnostics`) over every `examples/*.arch` and `examples/lib/*.arch`,
 * with a World serving each folder's imports, **measured against `src/` at `b385685c`** (`main`
 * before the warnings) with that tree extracted by `git archive` and its own digest body and helpers
 * imported. All 40 rows are here. Five of the examples (`aquarium`, `gallery-l`, `garden-house`,
 * `hillside-villa`, `two-bed`) raised `W_GRID_SNAPPED` as they stood, true positives (`grid 100`
 * drew their 450 mm pieces at 500, their 150/250 mm walls at 200/300 and two doors at x=-2750 at
 * -2700); by the coordinator's ruling on #704 their sources now write the values the drawing
 * already used, every edit the same length, so each row is the digest of the ORIGINAL source at
 * `b385685c` and holds against the edited one. The whole-corpus sweep (every tracked `.arch` and
 * `arch` fence) in the PR found no plan that moved other than by the new codes.
 *
 * A digest moving is a finding to explain before it is a diff to re-measure.
 *
 * Re-measured for AL1 (the north arrow keeps off the dimension and axis bands): 22 digests, of the
 * 22 plans here whose arrow moved off a band. On each moved page exactly one SVG line moved, the
 * arrow's `<g>`, and where the body hashes the Scene, the added `chrome.north` with it; `describe()`,
 * `lint()`, the diagnostics and the steps did not move. Put `main`'s SVG back (`a9db286e`) and drop
 * `chrome.north`, and this body reproduces every old digest; the new ones are this body on the branch.
 *
 * Re-measured for SR.15 (a wrapped room name keeps the spaces its break removed, each run in a
 * `<tspan font-size="0" xml:space="preserve">` between its lines): the rows of plans that draw a
 * wrapped name moved, SVG only. Strip those separators from the branch's SVG and this body
 * reproduces every old digest (`test/byte-identity-baseline.ts`, § SR.15); `describe()`, `lint()`,
 * the diagnostics and the steps did not move.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, ERROR_CATALOG, lint } from "../src/index.js";
import type { ElementDef, ParseCtx, ResolveCtx } from "../src/index.js";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./helpers/byte-identity-digest.js";
import { examples, libNames, REPO_ROOT } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";
import { runArch } from "./helpers/cli.js";
import { EXIT } from "../src/cli/io.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const NEW_CODES = [
  "W_LENGTH_IN_METRES",
  "W_GRID_SNAPPED",
  "W_SET_VALUE_WORD",
  "W_UNKNOWN_FURNITURE",
  "W_UNKNOWN_THEME",
  "W_AREA_AS_LENGTH",
];

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");
const plan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;
/** The new codes a source raises through `compile()`, in order. */
const raised = (src: string, opts: Parameters<typeof compile>[1] = {}): string[] =>
  compile(src, { noCache: true, ...opts })
    .diagnostics.map((d) => d.code ?? "")
    .filter((c) => NEW_CODES.includes(c));
/** The evaluation steps a source's resolution spends (the meter `E_STEP_LIMIT` reads). */
const stepsOf = (src: string): number => {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  return evaluationSteps(resolveAll(link(ast, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD));
};
const messages = (src: string, code: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.code === code)
    .map((d) => d.message);

suite("each warning fires on its fixture, through compile() and validate --strict", () => {
  const FIXTURES: [file: string, codes: string[]][] = [
    ["test/silent-accepts/length-in-metres.arch", ["W_LENGTH_IN_METRES", "W_LENGTH_IN_METRES"]],
    [
      "test/silent-accepts/grid-snapped.arch",
      ["W_GRID_SNAPPED", "W_GRID_SNAPPED", "W_GRID_SNAPPED", "W_GRID_SNAPPED", "W_GRID_SNAPPED"],
    ],
    ["test/silent-accepts/set-value-word.arch", ["W_SET_VALUE_WORD", "W_SET_VALUE_WORD"]],
    ["test/silent-accepts/unknown-furniture.arch", ["W_UNKNOWN_FURNITURE", "W_UNKNOWN_FURNITURE"]],
    ["test/silent-accepts/unknown-theme.arch", ["W_UNKNOWN_THEME"]],
    ["test/silent-accepts/area-as-length.arch", ["W_AREA_AS_LENGTH", "W_AREA_AS_LENGTH", "W_AREA_AS_LENGTH"]],
  ];

  it.each(FIXTURES)("%s raises its code, and only as a warning", (file, codes) => {
    const out = compile(read(file), { noCache: true });
    expect([...raised(read(file))].sort()).toEqual([...codes].sort());
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // A warning never blocks the drawing.
    expect(out.svg.startsWith("<svg")).toBe(true);
  });

  it("each code has a catalogue entry that `arch explain` serves", () => {
    for (const c of NEW_CODES) {
      const e = ERROR_CATALOG[c];
      expect(e?.severity, c).toBe("warning");
      expect(e?.example.length, c).toBeGreaterThan(0);
    }
  });

  it("validate --strict fails on a misspelt furniture word (U.3: the same path as W_ALIAS_MATCH)", async () => {
    const r = await runArch(["validate", "test/silent-accepts/unknown-furniture.arch", "--strict", "--json"]);
    expect(r.status).toBe(EXIT.USER);
    const j = JSON.parse(r.stdout) as { ok: boolean; diagnostics: { code: string }[] };
    expect(j.ok).toBe(false);
    expect(j.diagnostics.map((d) => d.code)).toContain("W_UNKNOWN_FURNITURE");
  });

  it("`arch explain` prints each new code", async () => {
    for (const c of NEW_CODES) {
      const r = await runArch(["explain", c]);
      expect(r.status, c).toBe(0);
      expect(r.stdout, c).toContain(c);
    }
  });
});

suite("W_LENGTH_IN_METRES (U.2)", () => {
  it("names the millimetre value it was read as, and the clause in millimetres", () => {
    const src = read("test/silent-accepts/length-in-metres.arch");
    const ds = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "W_LENGTH_IN_METRES");
    expect(ds.map((d) => d.message)).toEqual([
      'Wall "shell" thickness 0.2 is read as 0.2 mm: lengths are millimetres',
      'Room "main" size 4 x 3 is read as 4 mm x 3 mm: lengths are millimetres',
    ]);
    expect(ds.map((d) => d.hints)).toEqual([
      ["If you meant metres, write `thickness 200`."],
      ["If you meant metres, write `size 4000x3000`."],
    ]);
  });

  it("is quiet on millimetres, on one small side, and at the thresholds", () => {
    expect(raised(plan("  room at (0,0) size 4000x3000"))).toEqual([]);
    expect(raised(plan("  room at (0,0) size 4000x3"))).toEqual([]);
    expect(raised(plan("  room at (0,0) size 100x100"))).toEqual([]);
    expect(raised(plan("  wall exterior thickness 10 { (0,0) (4000,0) }"))).toEqual([]);
    expect(raised(plan("  room at (0,0) size 99x99"))).toEqual(["W_LENGTH_IN_METRES"]);
    expect(raised(plan("  walls from rooms exterior 0.25 partition 100\n  room at (0,0) size 4000x3000"))).toEqual([
      "W_LENGTH_IN_METRES",
    ]);
  });

  it("under a grid it is reported instead of the snap, and an error the size already raises stays", () => {
    const src = plan("  grid 100\n  room at (0,0) size 4x3");
    expect(raised(src)).toEqual(["W_LENGTH_IN_METRES"]);
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_ROOM_SIZE");
  });
});

suite("W_GRID_SNAPPED (PS0.25, 6.10)", () => {
  it("gives every written value before and after the snap (PS0.25's two 2750 mm rooms)", () => {
    expect(messages(read("test/silent-accepts/grid-snapped.arch"), "W_GRID_SNAPPED")).toEqual([
      'Room "a" size 2750 x 3000 was snapped to 2800 x 3000 by `grid 100`',
      'Room "b" size 2750 x 3000 was snapped to 2800 x 3000 by `grid 100`',
      'Door "d_front" at (1250, 0) was snapped to (1300, 0) by `grid 100`',
      'Furniture "chair_1" size 450 x 450 was snapped to 500 x 500 by `grid 100`',
      "`walls from rooms` exterior 250 was snapped to 300 by `grid 100`",
    ]);
  });

  it("6.10: a door written at 20550 lands at 20600, and the warning says so", () => {
    const src = plan(
      "  grid 100\n  wall id=w exterior thickness 200 { (0,0) (30000,0) }\n  door at (20550,0) width 900 wall w",
    );
    expect(messages(src, "W_GRID_SNAPPED")).toEqual([
      'Door "door_1" at (20550, 0) was snapped to (20600, 0) by `grid 100`',
    ]);
  });

  it("points at the value as written, a `let` name included, not at the whole statement", () => {
    const lines = [
      "  wall id=w exterior thickness 250 { (0,0) (30000,0) }",
      "  room id=r at (0,0) size 2750x3000",
      "  furniture chair at (500,500) size D x D",
      "  door at (20550, 0) width 900 wall w",
    ];
    const written = (body: string[]): string[] => {
      const src = plan(["  grid 100", "  let D = 450", ...body].join("\n"));
      return compile(src, { noCache: true })
        .diagnostics.filter((d) => d.code === "W_GRID_SNAPPED")
        .map((d) => src.slice(d.span!.start, d.span!.end));
    };
    // The order is the resolver's, as for every resolve-time diagnostic: element kinds in registry
    // order (`BUILTIN_DEFS`: wall, room, door, …, furniture), source order within a kind
    // (`test/resolve-order-byte-identity.test.ts` pins it). So the door's comes before the
    // furniture's although it is written after, and the four lines written in reverse give the
    // same order. Sorting these alone by offset would set them apart from the other resolve-time
    // diagnostics they are emitted among.
    const order = ["250", "2750x3000", "(20550, 0)", "D x D"];
    expect(written(lines)).toEqual(order);
    expect(written([...lines].reverse())).toEqual(order);
  });

  it("quotes the written value faithfully: 2749.9999 is not printed as 2750", () => {
    const src = plan("  grid 100\n  room id=r at (0,0) size 2749.9999x3000");
    expect(messages(src, "W_GRID_SNAPPED")).toEqual([
      'Room "r" size 2749.9999 x 3000 was snapped to 2700 x 3000 by `grid 100`',
    ]);
  });

  it("ranks last in validate's next (tier info): below every lint finding, and next only when alone", async () => {
    type Out = { diagnostics: { code: string }[]; next: { tier: string; code: string } | null };
    const run = async (src: string): Promise<Out> =>
      JSON.parse((await runArch(["validate", "-", "--json"], { input: src })).stdout) as Out;
    // A room with no door or window raises lint findings: the first is next, not the snap.
    const busy = await run(plan('  grid 100\n  room id=r at (0,0) size 2750x3000 label "Living"'));
    const lintCodes = busy.diagnostics.map((d) => d.code).filter((c) => c !== "W_GRID_SNAPPED");
    expect(busy.diagnostics[0]!.code).toBe("W_GRID_SNAPPED");
    expect(lintCodes.length).toBeGreaterThan(0);
    expect(busy.next!.code).not.toBe("W_GRID_SNAPPED");
    expect(busy.next!.tier).not.toBe("info");
    // Alone, it is next, in the info tier.
    const { nextDiagnostic } = await import("../src/next.js");
    const d = compile(plan("  grid 100\n  room id=r at (0,0) size 2750x3000"), { noCache: true }).diagnostics;
    expect(nextDiagnostic({ diagnostics: d, lint: [] })).toMatchObject({ tier: "info", code: "W_GRID_SNAPPED" });
  });

  it("is quiet when every value is on the grid, and with no grid at all", () => {
    const onGrid = read("test/silent-accepts/grid-snapped.arch")
      .replace(/2750x3000/g, "2800x3000")
      .replace("exterior 250", "exterior 300")
      .replace("size 450x450", "size 500x500")
      .replace("at (1250,0)", "at (1300,0)");
    expect(raised(onGrid)).toEqual([]);
    expect(raised(read("test/silent-accepts/grid-snapped.arch").replace("  grid 100\n", ""))).toEqual([]);
  });

  it("changes nothing that is drawn: the snapped plan draws as its on-grid twin", () => {
    const snapped = read("test/silent-accepts/grid-snapped.arch");
    const twin = snapped
      .replace(/2750x3000/g, "2800x3000")
      .replace("exterior 250", "exterior 300")
      .replace("size 450x450", "size 500x500")
      .replace("at (1250,0)", "at (1300,0)");
    expect(compile(snapped, { noCache: true }).svg).toBe(compile(twin, { noCache: true }).svg);
  });
});

suite("W_SET_VALUE_WORD (PS0.16)", () => {
  it("gives the value taken as text", () => {
    expect(messages(read("test/silent-accepts/set-value-word.arch"), "W_SET_VALUE_WORD")).toEqual([
      '`set door(width: W)` takes `W` as the text "W", not as a value, and `set door` reads no word for `width`, so the rule does nothing',
      '`set door(swing: inward)` takes `inward` as the text "inward", which `swing` does not read, so the rule does nothing',
    ]);
  });

  it("is quiet on the words a door reads, on a quoted string and on an expression", () => {
    expect(raised(plan("  set door(hinge: right, swing: out)"))).toEqual([]);
    expect(raised(plan('  set room(label: "X")'))).toEqual([]);
    expect(raised(plan("  let W = 900\n  set door(width: W + 0)"))).toEqual([]);
  });

  // RM1.4 review round 2 (S1): every built-in declares `setWords`, `{}` when its resolver reads no
  // bare word from `ctx.defaults` (only the door's reads any), so these are reported again.
  it.each([
    "set window(width: W)",
    "set opening(width: W)",
    "set wall(material: brick)",
    "set window(kind: casement)",
    "set furniture(colour: red)",
  ])("warns on a built-in kind that reads no bare word: %s", (stmt) => {
    expect(raised(plan(`  ${stmt}`))).toEqual(["W_SET_VALUE_WORD"]);
  });

  it("a word the door reads is quiet and changes the drawing; a word the window does not read warns and changes nothing", () => {
    const body = [
      "  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
      '  room id=r at (0,0) size 6000x4000 label "Living" uses living',
      "  door at (1000,4000) width 900 wall w",
      "  window at (3000,0) width 1500 wall w",
    ].join("\n");
    const svg = (src: string): string => compile(src, { noCache: true }).svg;
    const reads = plan(`  set door(hinge: right)\n${body}`);
    const unread = plan(`  set window(kind: fixed)\n${body}`);
    expect(raised(reads)).toEqual([]);
    expect(svg(reads)).not.toBe(svg(plan(body)));
    expect(raised(unread)).toEqual(["W_SET_VALUE_WORD"]);
    expect(svg(unread)).toBe(svg(plan(body)));
  });

  it("every built-in element declares setWords (only a plugin kind is exempt)", () => {
    expect(BUILTIN_DEFS.filter((d) => d.setWords === undefined).map((d) => d.kind)).toEqual([]);
  });

  it("names the word a key reads when the written one is it in another case (hinge: Left)", () => {
    const d = compile(plan("  set door(hinge: Left)"), { noCache: true }).diagnostics.find(
      (x) => x.code === "W_SET_VALUE_WORD",
    )!;
    expect(d.hints![0]).toBe("Write `set door(hinge: left)`: words match exactly.");
  });

  it("is quiet on a plugin kind that declares no setWords, whatever word it reads (RM1.4 review M1)", () => {
    let seen: unknown;
    type At = Parameters<ResolveCtx["evalPt"]>[0];
    const marker: ElementDef = {
      kind: "marker",
      keyword: "marker",
      parse(ctx: ParseCtx) {
        const kw = ctx.eatKeyword("marker");
        const at = ctx.parsePoint();
        return { kind: "marker", id: "", at, line: kw.line } as never;
      },
      idPrefix: () => "marker",
      resolve(node, ctx: ResolveCtx) {
        seen = ctx.defaults?.get("species");
        const at = ctx.evalPt((node as unknown as { at: At }).at);
        return { kind: "marker", id: ctx.id, at } as never;
      },
      bounds: (r) => {
        const { at } = r as unknown as { at: { x: number; y: number } };
        return [at, at];
      },
      render: () => [],
    };
    const r = compile(plan("  set marker(species: oak)\n  marker (100,100)"), { plugins: [marker], noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.diagnostics.map((d) => d.code)).not.toContain("W_SET_VALUE_WORD");
    expect(seen).toEqual({ t: "str", v: "oak" });
  });
});

suite("W_UNKNOWN_FURNITURE (U.3)", () => {
  it("names the nearest catalogued kind, and stays quiet on a labelled custom piece", () => {
    expect(messages(read("test/silent-accepts/unknown-furniture.arch"), "W_UNKNOWN_FURNITURE")).toEqual([
      'Furniture "grand_pianno_1" is a "grand_pianno", which is not a catalogued kind, so it draws as a blank rectangle — did you mean "grand_piano"?',
      'Furniture "WC_2" is a "WC", which is not a catalogued kind, so it draws as a blank rectangle — did you mean "wc"?',
    ]);
  });

  it("is quiet on a catalogued word and on a word near no kind", () => {
    expect(raised(plan("  furniture grand_piano at (0,0) size 1500x1500"))).toEqual([]);
    expect(raised(plan("  furniture zzqqxxkk at (0,0) size 1500x1500"))).toEqual([]);
  });

  /** The kind a lone unlabelled piece of `word` is said to mean, or null when nothing is raised. */
  const meant = (word: string): string | null => {
    const d = compile(plan(`  furniture ${word} at (0,0) size 600x600`), { noCache: true }).diagnostics.find(
      (x) => x.code === "W_UNKNOWN_FURNITURE",
    );
    return d ? /did you mean "([^"]+)"/.exec(d.message)![1]! : null;
  };

  it("a slip is still named: a dropped, doubled or added letter, or another case", () => {
    expect(meant("grand_pianno")).toBe("grand_piano");
    expect(meant("WC")).toBe("wc");
    expect(meant("bath_tub")).toBe("bathtub");
    expect(meant("tables")).toBe("table");
  });

  // RM1.4 review M2: each is an ordinary word one or two letters from a kind (`cart`/`car`,
  // `rack`/`rock`, `ladder`/`larder`, `stand`/`island`), so the limit is relative to its length:
  // a word of four letters or fewer is reported only as a kind in another case.
  it.each([
    "fan",
    "harp",
    "bar",
    "cart",
    "box",
    "mat",
    "vat",
    "safe",
    "tank",
    "cask",
    "drum",
    "rack",
    "bust",
    "urn",
    "kiln",
    "stand",
    "ladder",
  ])("an ordinary word is not a slip: %s", (word) => {
    expect(meant(word)).toBeNull();
  });

  it("`arch lint --strict` fails on it as it does on W_ALIAS_MATCH (a lint rule)", async () => {
    // The studio lints clean, so each one-word edit leaves its finding the only one: the exit is
    // that finding's alone (the edits are the same length, a word and its padding).
    const run = async (src: string): Promise<{ codes: string[]; status: number | null }> => {
      const r = await runArch(["lint", "-", "--strict", "--json"], { input: src });
      const codes = (JSON.parse(r.stdout) as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
      return { codes, status: r.status };
    };
    const studio = read("examples/studio.arch");
    const alias = studio.replace('label "Bath"             uses bath', 'label "Powder"                     ');
    const piece = studio.replace("furniture fridge       at", "furniture fridges      at");
    expect(alias).not.toBe(studio);
    expect(piece).not.toBe(studio);
    expect(await run(studio)).toEqual({ codes: [], status: EXIT.OK });
    expect(await run(alias)).toEqual({ codes: ["W_ALIAS_MATCH"], status: EXIT.USER });
    expect(await run(piece)).toEqual({ codes: ["W_UNKNOWN_FURNITURE"], status: EXIT.USER });
  });
});

suite("W_UNKNOWN_THEME (RM1.4b)", () => {
  const src = read("test/silent-accepts/unknown-theme.arch");

  it("hints at the nearest known name, read from THEMES", () => {
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_UNKNOWN_THEME")!;
    expect(d.message).toBe(
      'Unknown theme "Rendered": it selects nothing, so the plan is drawn in the default theme — did you mean "rendered"?',
    );
    expect(src.slice(d.span!.start, d.span!.end)).toBe("Rendered");
  });

  it("does not draw the mis-cased name as the known theme", () => {
    const plain = src.replace("  theme Rendered\n", "");
    const known = src.replace("theme Rendered", "theme rendered");
    expect(compile(src, { noCache: true }).svg).toBe(compile(plain, { noCache: true }).svg);
    expect(compile(src, { noCache: true }).svg).not.toBe(compile(known, { noCache: true }).svg);
    expect(raised(known)).toEqual([]);
  });

  it("the CLI's validate, lint and compile report it against THEMES, so validate --strict fails", async () => {
    const file = "test/silent-accepts/unknown-theme.arch";
    const codes = (stdout: string): string[] =>
      (JSON.parse(stdout) as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
    const v = await runArch(["validate", file, "--strict", "--json"]);
    expect(v.status).toBe(EXIT.USER);
    expect(codes(v.stdout)).toContain("W_UNKNOWN_THEME");
    const l = await runArch(["lint", file, "--json"]);
    expect(codes(l.stdout)[0]).toBe("W_UNKNOWN_THEME");
    const c = await runArch(["compile", file, "--json"]);
    expect(codes(c.stdout)).toEqual(["W_UNKNOWN_THEME"]);
    // A built-in name: nothing new on any of the three.
    const known = await runArch(["validate", "-", "--json"], {
      input: src.replace("theme Rendered", "theme rendered"),
    });
    expect(codes(known.stdout)).not.toContain("W_UNKNOWN_THEME");
  });

  it("the library's describe() and lint() do not raise it (a host may register the name at compile)", () => {
    expect(describePlan(src).diagnostics.map((d) => d.code)).not.toContain("W_UNKNOWN_THEME");
    expect(lint(src).map((d) => d.code)).not.toContain("W_UNKNOWN_THEME");
  });

  it("is quiet on a theme the call registers", () => {
    const own = src.replace("theme Rendered", "theme brand");
    expect(raised(own)).toEqual(["W_UNKNOWN_THEME"]);
    expect(raised(own, { themes: [{ kind: "theme", name: "brand", theme: { bg: "#ffffff" } }] })).toEqual([]);
  });
});

suite("W_AREA_AS_LENGTH (AF10 step 2, first slice)", () => {
  it("names the square, the binding it squares and the length it was read as; the hint names the element", () => {
    const src = read("test/silent-accepts/area-as-length.arch");
    const ds = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "W_AREA_AS_LENGTH");
    const wall =
      "`A` is `W` times itself, an area if `W` is a length, but a wall's point reads it as a length of 16000000 mm";
    expect(ds.map((d) => d.message)).toEqual([
      wall,
      wall,
      "`A` is `W` times itself, an area if `W` is a length, but a room's size reads it as a length of 16000000 mm",
    ]);
    const wallHint = 'Wall "shell": write the length itself (`W`). Lengths are millimetres and are never converted.';
    expect(ds.map((d) => d.hints)).toEqual([
      [wallHint],
      [wallHint],
      [
        'Room "main": write the length itself (`W`), or, for a room of that area, `size W x W`. Lengths are millimetres and are never converted.',
      ],
    ]);
    // Each points at the name as written, not at the statement.
    expect(ds.map((d) => src.slice(d.span!.start, d.span!.end))).toEqual(["A", "A", "A"]);
  });

  it("its clean twin raises none of the new codes and no error", () => {
    const clean = read("test/silent-accepts/area-as-length.clean.arch");
    expect(raised(clean)).toEqual([]);
    expect(compile(clean, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("fires on the square however it reaches the length, and on every length clause it reads", () => {
    const at = (body: string): string[] =>
      raised(plan(["  let W = 4m", "  let A = W*W", "  let B = A", body].join("\n")));
    expect(at("  room at (0,0) size W*W x 3000")).toEqual(["W_AREA_AS_LENGTH"]);
    expect(at("  room at (0,0) size B x B")).toEqual(["W_AREA_AS_LENGTH", "W_AREA_AS_LENGTH"]);
    expect(at("  wall exterior thickness A { (0,0) (4000,0) }")).toEqual(["W_AREA_AS_LENGTH"]);
    expect(at("  walls from rooms exterior A partition 100\n  room at (0,0) size 4000x3000")).toEqual([
      "W_AREA_AS_LENGTH",
    ]);
    const host = "  wall id=w exterior thickness 200 { (0,0) (20000000,0) }";
    for (const kind of ["door", "window", "opening"]) {
      const src = plan(["  let W = 4m", host, `  ${kind} at (10000000,0) width W*W wall w`].join("\n"));
      expect(raised(src), kind).toEqual(["W_AREA_AS_LENGTH"]);
    }
    // A parameter bound to a square is a square.
    expect(at("  component c(s) { room at (0,0) size s x 3000 }\n  c(A)")).toEqual(["W_AREA_AS_LENGTH"]);
  });

  it("reads no threshold, and is quiet once arithmetic or a call makes a new value", () => {
    const at = (body: string): string[] =>
      raised(plan(["  let W = 4m", "  let D = 3m", "  let A = W*W", body].join("\n")));
    // A small square is still a square: no size is read.
    expect(raised(plan("  let k = 40\n  room at (0,0) size k*k x 3000"))).toEqual(["W_AREA_AS_LENGTH"]);
    expect(at("  room at (0,0) size A / W x 3000")).toEqual([]);
    expect(at("  room at (0,0) size sqrt(W*W + D*D) x 3000")).toEqual([]);
    expect(at("  room at (0,0) size W*D x 3000")).toEqual([]);
    expect(at("  room at (0,0) size A + 0 x 3000")).toEqual([]);
    expect(at("  room at (0,0) size W x W")).toEqual([]);
    // A square of 0 has no size to mislead, and a zero size is its element's own error.
    const zero = compile(plan("  let Z = 0\n  room at (0,0) size Z*Z x 3000"), { noCache: true }).diagnostics;
    expect(zero.map((d) => d.code)).toContain("E_ROOM_SIZE");
    expect(zero.map((d) => d.code)).not.toContain("W_AREA_AS_LENGTH");
  });

  it("never names a binding that means something else where the length reads it", () => {
    const at = (body: string): string[] => raised(plan(["  let W = 4m", "  let sq(x) = x*x", body].join("\n")));
    // A function's parameter: `x` is unbound (or another value) at the call site, so nothing is named.
    expect(at("  room at (0,0) size sq(W) x 3000")).toEqual([]);
    expect(at("  let S = sq(W)\n  room at (0,0) size S x 3000")).toEqual([]);
    expect(at("  let x = 5000\n  let S = sq(W)\n  room at (0,0) size S x 3000")).toEqual([]);
    // ...but where the parameter's name IS the binding it squared, the name is true and it is reported.
    const same = plan("  let x = 4m\n  let sq(x) = x*x\n  let S = sq(x)\n  room at (0,0) size S x 3000");
    expect(messages(same, "W_AREA_AS_LENGTH")).toEqual([
      "`S` is `x` times itself, an area if `x` is a length, but a room's size reads it as a length of 16000000 mm",
    ]);
    // The hint names `x` too, and its square room parses (`size x x x` is 4000 x 4000).
    const hints = compile(same, { noCache: true }).diagnostics.filter((d) => d.code === "W_AREA_AS_LENGTH");
    expect(hints.map((d) => d.hints)).toEqual([
      [
        'Room "room_1": write the length itself (`x`), or, for a room of that area, `size x x x`. Lengths are millimetres and are never converted.',
      ],
    ]);
    // A component parameter `W` shadows the outer `W` that `A` squared: not named, not reported.
    const shadow = "  let A = W*W\n  component c(W) { room at (0,0) size A x 3000 }";
    expect(at(`${shadow}\n  c(5000)`)).toEqual([]);
    // Passed the outer `W` itself, the parameter is the same binding, and the name is true.
    expect(at(`${shadow}\n  c(W)`)).toEqual(["W_AREA_AS_LENGTH"]);
    // A nested `let` of the name, or a reassignment after the square, makes `W` another value.
    expect(at("  let A = W*W\n  if true {\n    let W = 3000\n    room at (0,0) size A x W\n  }")).toEqual([]);
    expect(at("  let A = W*W\n  W = 3m\n  room at (0,0) size A x 3000")).toEqual([]);
  });

  suite("through an import (the module fallback)", () => {
    // The fixtures' folder, named by a fixture's path (the opaque-literal guard reads this file).
    const world = worldFor(dirname(join(REPO_ROOT, "test/silent-accepts/area-as-length.arch")));
    const viaImport = (body: string): string[] => raised(plan(body), { world });
    it("a module `let A = W*W` read in a component body, nothing shadowing `W`, is reported (P2c)", () => {
      expect(viaImport('  import "area-as-length-mod2.arch": e\n  e(0)')).toEqual(["W_AREA_AS_LENGTH"]);
    });
    it("a component parameter `W` shadowing the module's `W` is the name compared: quiet (P2a)", () => {
      expect(viaImport('  import "area-as-length-mod2.arch": c\n  c(3000)')).toEqual([]);
    });
    it("a root `let W` shadowing the module's `W` is the name compared: quiet (P2b)", () => {
      expect(viaImport('  let W = 9000\n  import "area-as-length-mod2.arch": e\n  e(0)')).toEqual([]);
    });
    it("`size W*W` in an imported body, `W` the module's, is reported (P1b)", () => {
      expect(viaImport('  import "area-as-length-mod1.arch": d\n  d(0,0)')).toEqual(["W_AREA_AS_LENGTH"]);
    });
    it("carve-out: a body `let A = W*W` from the module's `W` is NOT reported yet (P1a; a fix flips this)", () => {
      // Reading `W` from the module here would need a non-evaluating peek at the cached module env
      // (`moduleFallback`, `src/ir/expand.ts`); stated in the catalogue's cause text and CHANGELOG.
      expect(viaImport('  import "area-as-length-mod1.arch": c\n  c(0,0)')).toEqual([]);
    });
  });

  it("an unknown name is its own error, with no square reported beside it", () => {
    const codes = compile(plan("  room at (0,0) size Q*Q x 3000"), { noCache: true }).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("W_AREA_AS_LENGTH");
    expect(codes).toContain("E_UNKNOWN_REF");
  });

  it("costs no step: a plan that squares a name and raises no warning spends the steps it did before", () => {
    // Each count is `evaluationSteps` of the plan **measured against `src/` at `490f2e36`** (`main`
    // before the warning), that tree extracted and handed this same body; the branch measures the same.
    const STEPS: [plan: string, steps: number][] = [
      [
        "  let W = 4000\n  let D = 3000\n  for i in 0..3 {\n    for j in 0..4 {\n      let d = sqrt(W*W + D*D)\n    }\n  }\n  room id=a at (0,0) size W x D",
        397,
      ],
      ["  let W = 4m\n  let sq(x) = x*x\n  let S = sq(W)\n  room id=a at (0,0) size S x 3000", 69],
      ["  let W = 4m\n  let A = W*W\n  component c(W) {\n    room at (0,0) size A x 3000\n  }\n  c(5000)", 56],
    ];
    for (const [body, steps] of STEPS) {
      const src = `plan "P" {\n  units mm\n${body}\n}\n`;
      expect(raised(src), body).toEqual([]);
      expect(stepsOf(src), body).toBe(steps);
    }
  });
});

suite("U.4: a furniture label is data, carried by describe()", () => {
  it("a drawn symbol's label reaches describe().furniture[].label", () => {
    const d = describePlan(
      plan('  room id=r at (0,0) size 4000x3000\n  furniture bed at (500,500) size 1500x2000 label "Guest bed" in r'),
    );
    expect(d.furniture.map((f) => f.label)).toEqual(["Guest bed"]);
  });
});

/**
 * Measured at `b385685c` (see the header), every example. The five rows marked RM1.4 are the digests
 * of their sources as they were then; the sources now write the snapped values, and the rows hold.
 */
const BASELINE: [string, string][] = [
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "eee3dc30bd94b5f31c7189f719ff38e09d6f56a3d5484f443432591f8f1e737e"], // RM1.4: benches written 1200x500
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "0dd331e28b8f4e20c3b359c8e819ed738290295cc83934c1a38808d2fd83dc13"], // CV13 (was 074d5531): example source edited (chairs added)
  ["examples/classroom-block.arch", "4d558795c0b345b3a9a1e5454bc476125983a63dee7d3227c0d3afe09b7ed3bd"],
  ["examples/clinic.arch", "6a8b78ce84d10bea939f48f431d16e127cb95b982f473d33072889e110ff4788"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"],
  ["examples/courtyard-family.arch", "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67"], // new example (RM8.5, the courtyard-family showcase)
  ["examples/courtyard-house.arch", "3ce3c72f6915ece00f2eca8d9321651aca7c2644b95cc423f10397395fc9ab12"], // CV13 (was 0f6dddac): example source edited (chairs added)
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e"], // RM1.4: partitions written 200
  ["examples/garden-house.arch", "5b0ec567a174809bd4d5a7c62907b611741e3537577e9552026d400c28cedcd6"], // RM1.4: four pieces on the grid; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 72528a5f)
  ["examples/garden-loft.arch", "2814a29269f878cd596372eafe0fdf8c1d1bc9f0c478b33f1cae2906b6db8d8d"], // CV13 (was e0ce8a5f): example source edited (chairs added)
  ["examples/hexagon-pavilion.arch", "847694c47f21e1660d3a4bbd70469d8fac354b2d255070478c59fe1aa83a613a"], // CV13 (was 3078765c): example source edited (chairs added)
  ["examples/hillside-villa.arch", "bde21bc8c7ea02b91b55d17623eac370428f9aef0f2c16f0fb8f7fd00ae369ce"], // RM1.4: 17 values on the grid; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 123f2af2)
  ["examples/imports.arch", "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252"],
  ["examples/knob-flat.arch", "578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586"],
  ["examples/laneway-house.arch", "21f4d5bc82e2e8d46536bd2dc5623b05ea76e937db31c7d4ed482a4c5e3118bc"], // CV13 (was 958934b4): example source edited (chairs added)
  ["examples/library.arch", "a004eb834300480a37f5a520671a570fb3e07f7bff061ba7e510e779fa912466"],
  ["examples/materials.arch", "b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d"],
  ["examples/museum-wing.arch", "add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7"],
  ["examples/museum-wings.arch", "4acccb8ead0234e18186574c23a4c795d32c6a8f819fc67a983cebea337b8b29"],
  ["examples/museum.arch", "bf1d425c9bf21d6ddb3e4757f53a1820f186cca67c3300c0a6ce8eb6b4e73713"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989"],
  ["examples/practice-office.arch", "bf127fd8266fe3d85e9f25712ac69c02bd42370c7027cf1a01baeafe1d3aa36c"],
  ["examples/relational.arch", "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084"],
  ["examples/remodel.arch", "b7fc3b7f11be692ffdc3125d66d01e9c70cb9ade93ab673f4bb4ddaebd0e085c"], // SR.15 (was 5fd914bb); CV13 (was f0f4a5aa): example source edited (chairs added)
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "3e8d6696f955b554411c7379e3a8bc9ce5cbf83a9521930129f18915bca585d0"], // CV08 (was 6667da00): example source edited (sofa turned to face the room)
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "42be4e4d302a36d2a95f93fe215539d45739f5f21c9dbca3a96089b8f6c18afd"], // RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3657648f): example source edited (chairs added); CV08 (was 3395a3eb): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was e51de067)
  ["examples/transit-hall.arch", "649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be"],
  ["examples/turning-stair.arch", "4278a96ba7b215a43f121d04bd47fd94c94ab0c145cb7f7a2a7aba5201e2c6a2"], // RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 4d2fb9dc)
  ["examples/two-bed.arch", "6393e0321cc48a44fbf17b7aa6008d89dcfbbcceea13418c4045875c5ffdf6c0"], // RM1.4: sofa and basin on the grid; CV13 (was fe871cbb): example source edited (chairs added)
  ["examples/two-storey.arch", "92a71843b7de0b87acb1ef3ea1b859d1c0bedbe4ef35025f3524ecea1d674aa8"], // RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/lib/doors.arch", "f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804"],
  ["examples/lib/fixtures.arch", "57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310"],
  ["examples/lib/furniture.arch", "adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b"],
];

suite("the byte-identity law over the examples", () => {
  it.each(BASELINE)("%s: the payload is the one measured before the warnings", (path, digest) => {
    const src = read(path);
    const world = worldFor(dirname(join(REPO_ROOT, path)));
    expect(raised(src, { world })).toEqual([]);
    expect(allStoreysDigestWithDiagnostics(API, src, { world })).toBe(digest);
  });

  it("covers every example", () => {
    const listed = BASELINE.map((r) => r[0]).sort();
    const all = [...examples(), ...libNames().map((f) => `examples/lib/${f}`)].sort();
    expect(listed).toEqual(all);
  });
});
