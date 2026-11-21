/**
 * Silent accepts made audible (product-roadmap RM1.4 and RM1.4b): five warnings, never errors, for
 * what the compiler used to take without a word.
 *
 * | code | trigger | fixture |
 * |---|---|---|
 * | `W_LENGTH_IN_METRES` | a room `size` with both sides under 100 mm, a wall thickness under 10 mm (U.2) | `test/silent-accepts/length-in-metres.arch` |
 * | `W_GRID_SNAPPED` | `grid` moved a written size, wall thickness or door `at (x,y)` (PS0.25, 6.10) | `test/silent-accepts/grid-snapped.arch` |
 * | `W_SET_VALUE_WORD` | a bare `set` word the kind does not read (PS0.16; an error at 2.0, RM-D6) | `test/silent-accepts/set-value-word.arch` |
 * | `W_UNKNOWN_FURNITURE` | an unlabelled furniture word near a catalogued kind (U.3) | `test/silent-accepts/unknown-furniture.arch` |
 * | `W_UNKNOWN_THEME` | `theme <name>` that names no known theme (RM1.4b) | `test/silent-accepts/unknown-theme.arch` |
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

const API: CompilerApi = { compile, describe: describePlan, lint };
const NEW_CODES = [
  "W_LENGTH_IN_METRES",
  "W_GRID_SNAPPED",
  "W_SET_VALUE_WORD",
  "W_UNKNOWN_FURNITURE",
  "W_UNKNOWN_THEME",
];

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");
const plan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;
/** The new codes a source raises through `compile()`, in order. */
const raised = (src: string, opts: Parameters<typeof compile>[1] = {}): string[] =>
  compile(src, { noCache: true, ...opts })
    .diagnostics.map((d) => d.code ?? "")
    .filter((c) => NEW_CODES.includes(c));
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
  ["examples/bungalow.arch", "f30ba91cde2b7911fd26ccda178be371a4069fc2f1d195b3576f4e61f1cbc341"], // CV13 (was 074d5531): example source edited (chairs added)
  ["examples/classroom-block.arch", "cca7c3dfef6593e826303c88878fbfb5537bded8a6bb9323696ae4b446ac046a"],
  ["examples/clinic.arch", "b31aad2c2f0c0d1b7e63498f8844570f16c700846d533288de7e43bf5ad56e63"],
  ["examples/corner-cafe.arch", "d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5"],
  ["examples/courtyard-family.arch", "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67"], // new example (RM8.5, the courtyard-family showcase)
  ["examples/courtyard-house.arch", "f4882dcb19c0d7c25586ccfb3c9a97d2e424448c7383c697eb8bb390ca567ed9"], // CV13 (was 0f6dddac): example source edited (chairs added)
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e"], // RM1.4: partitions written 200
  ["examples/garden-house.arch", "72528a5f6784a5c5d9527299a5abb330423c747bafb17458716dc336cc9a3eb3"], // RM1.4: four pieces on the grid; RM9.2, see ./byte-identity-baseline.ts
  ["examples/garden-loft.arch", "944b60b10ed318d3e50b6daaf1245d55699fe7f862603bcd82c051b20b08b69c"], // CV13 (was e0ce8a5f): example source edited (chairs added)
  ["examples/hexagon-pavilion.arch", "ab0f8253509ddb47b660687d4523121e6f7800819f5c138aa1f5bfc4fe45b73d"], // CV13 (was 3078765c): example source edited (chairs added)
  ["examples/hillside-villa.arch", "123f2af228faf039c29d9861b60cfff3574b3cd04bc0057d5549cd02e67066fb"], // RM1.4: 17 values on the grid; RM9.2, see ./byte-identity-baseline.ts
  ["examples/imports.arch", "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252"],
  ["examples/knob-flat.arch", "578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586"],
  ["examples/laneway-house.arch", "5731f1557597e400ef50dd7c406dba16eb2edbbb0b4f4f4378ef919878939dee"], // CV13 (was 958934b4): example source edited (chairs added)
  ["examples/library.arch", "acbc3325a38dea3132c2e6898df4c40ac2df5e85684fab1531409ba397e3b506"],
  ["examples/materials.arch", "b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d"],
  ["examples/museum-wing.arch", "add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7"],
  ["examples/museum-wings.arch", "4acccb8ead0234e18186574c23a4c795d32c6a8f819fc67a983cebea337b8b29"],
  ["examples/museum.arch", "bf1d425c9bf21d6ddb3e4757f53a1820f186cca67c3300c0a6ce8eb6b4e73713"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989"],
  ["examples/practice-office.arch", "f655cd0dfaa4ec152a2effa51cd2a3fb6254d46c8fb7e29529cbd3c7b78491cb"],
  ["examples/relational.arch", "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084"],
  ["examples/remodel.arch", "3a768da0e8f3cb1987160a5eccd2df84ff504a170c2abe98f4c217ba9927718f"], // CV13 (was f0f4a5aa): example source edited (chairs added)
  ["examples/sheet-notes.arch", "708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d"],
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "34e3c63ec71734c63d3013e0203110cf933372bce5850b65141471292015c07a"], // RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3657648f): example source edited (chairs added)
  ["examples/transit-hall.arch", "649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be"],
  ["examples/turning-stair.arch", "4d2fb9dcc6a44640a4d0e52d202df14909c73a5743799af8c25cb1f117dc87a8"], // RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["examples/two-bed.arch", "9ac81631454efe33a25dd4c041a7439705c6377353b6e68039913906d87189d0"], // RM1.4: sofa and basin on the grid; CV13 (was fe871cbb): example source edited (chairs added)
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
