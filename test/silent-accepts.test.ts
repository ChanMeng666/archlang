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
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, ERROR_CATALOG, lint } from "../src/index.js";
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
  ["examples/aquarium.arch", "e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521"], // RM1.4: benches written 1200x500
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283"],
  ["examples/classroom-block.arch", "809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6"],
  ["examples/clinic.arch", "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5"],
  ["examples/corner-cafe.arch", "a6d2075bd43f6d46984d64a2ae8edd6e6c96f25ea4fae91f2984ad7bdd4a5b1f"],
  ["examples/courtyard-house.arch", "e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce"],
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"],
  ["examples/gallery-l.arch", "0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2"], // RM1.4: partitions written 200
  ["examples/garden-house.arch", "55ad2593f768d91a282b6cde6e8a06f6ee5dbd5701fe1858aa8905431432767a"], // RM1.4: four pieces on the grid
  ["examples/garden-loft.arch", "f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0"],
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/hillside-villa.arch", "36397208c3c6ea06f9bbc3efba156b33de2189455086852e290890f3c8784884"], // RM1.4: 17 values on the grid
  ["examples/imports.arch", "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252"],
  ["examples/knob-flat.arch", "f4f0ed59cff4dd7b970fe069579044226fcb0e4f68f24a85845e648875ed17e5"],
  ["examples/laneway-house.arch", "21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e"],
  ["examples/library.arch", "9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92"],
  ["examples/materials.arch", "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/museum-wings.arch", "1149f0993df1cd719dcffd1d8c5c43c4ea6176c9a43b47954b23b3950bcc6f4a"],
  ["examples/museum.arch", "3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4"],
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef"],
  ["examples/practice-office.arch", "f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4"],
  ["examples/relational.arch", "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084"],
  ["examples/remodel.arch", "f0f4a5aa4758c3f9feb14449b6a9be0b7afd020fb925619c6d83e66f7cb95f2d"],
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"],
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"],
  ["examples/terrace-row.arch", "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d"],
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"],
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"],
  ["examples/townhouse.arch", "4ebf99f3ba158cc7652424c413c94f9f837f6afd24546d8bbac0f080bb281652"],
  ["examples/transit-hall.arch", "a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5"],
  ["examples/turning-stair.arch", "7a197ff651fd6ee9e785088ecefd9147d15e29cfd098013624ffbd8698c4dd56"],
  ["examples/two-bed.arch", "fe871cbb3d60c1594495e38b1ad0dc30ce3f71904c27b85fa60f276d3aa182bd"], // RM1.4: sofa and basin on the grid
  ["examples/two-storey.arch", "03f9dd06253ad4bda8937efbc428093b671524340dbdc3254061061d20f67c24"],
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
