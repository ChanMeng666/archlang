/**
 * A catalogued footprint under every placement (card CO-2): `furniture wc in bath anchor right`
 * and `furniture wc at (x,y)` may leave `size` out, as `against` always could, and a kind with no
 * footprint is `E_FURN_SIZE` with a message that says so.
 *
 * ## The orientation rule
 *
 * The footprint is catalogued wall-relative, `along` × `depth`. `against` reads it as it reads a
 * written size (along × depth) and derives the turn, unchanged. `at` and `in` take a plan W×H, so
 * the default is the footprint at the piece's quarter-turn: back north at rotate 0 (`along`
 * across, `depth` down), its two sides swapped under a written `rotate 90|270`. Under
 * `in … anchor <a>`, for a kind whose facing means something and that is not turned by hand
 * (`rotate`/`facing` absent), when exactly one edge the anchor names has a wall behind it, the
 * back goes on that edge: the footprint is laid along it, and the derived turn follows from the
 * existing rule. Otherwise the rotate-0 footprint stands, and the existing derivation reads its
 * shape as it reads a written size (a corner walled on both edges backs onto the edge that
 * shape fits). `facing` settles after the position, so it reads the rotate-0 footprint, and a
 * turn onto the footprint's short side is the existing `E_FACING_TRANSPOSED`.
 *
 * Under a `grid` the footprint snaps as a written size does, and every placement reports it as one
 * is reported (`W_GRID_SNAPPED`, naming the "catalogued size"; `against` since CO.1). Under
 * `at`/`in` a side that snaps to 0 is `E_FURN_SIZE`. Under `against` it is not: it stays one
 * `W_GRID_SNAPPED` that names the side, because `against` snapped its footprint silently before
 * CO.1 and a plan that compiled then still compiles (RM-D56). A written `against` size that
 * snaps to 0 is `E_FURN_SIZE`, as it always was.
 *
 * ## The twin law
 *
 * Every default is one an author could have written. For every family and alias with a
 * footprint, under every form in {@link FORMS} (with and without a `grid`), the statement without
 * `size` compiles to the same SVG, `describe()` and `lint()` as its twin, the same statement with
 * the footprint the rule names written out as `size`. Two differences are allowed, and nothing
 * else: (1) byte spans, since the twin is longer by its `size` clause; (2) under a grid, the
 * default's `W_GRID_SNAPPED` says `catalogued size` where the twin's says `size`. The diagnostics
 * come in the same order, the snap note included. A footprint with a side that the grid takes to
 * 0 has no error-free twin, so it is checked on its own: under `at`/`in` the default is exactly
 * one `E_FURN_SIZE` that names the catalogued and the snapped size; under `against`, the one
 * exception, it is no error and exactly one `W_GRID_SNAPPED` that names the zeroed side.
 *
 * ## The law
 *
 * A plan that compiled before compiles identically: only a `size`-less `at`/`in` statement read
 * differently, and each of those was an error. Each row is `surfaceDigest`
 * (`test/helpers/clause-order-law.ts`): every storey's SVG + `describe()` + `lint()` +
 * `compile().diagnostics`. The rows were **measured on `main` at `60e2436c`, before the first
 * `src/` edit of this change**, by that helper body (a scratch script imported it, as this test
 * does). A deliberate plant (`against` taking the footprint transposed) moved rows here, so the
 * law can fail. A moved row is a finding to explain, never a re-pin.
 *
 * CO.1 made `against` report its snapped footprint, which seven examples relied on silently
 * (`courtyard-family`, `garden-house`, `hillside-villa`, `museum`, `remodel`, `two-bed`,
 * `showcase/garden-courtyard`). They now write the snapped size out, so they stay warning-free and
 * these rows reproduce unchanged: no row was re-pinned.
 */

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RFurniture } from "../src/ir.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint, orientationMatters } from "../src/fixtures-catalog.js";
import { archFilesUnder, type ClauseLawApi, surfaceDigest } from "./helpers/clause-order-law.js";

const ROOT = resolvePath(".");
const API: ClauseLawApi = {
  compile,
  describe,
  lint,
  parse: (src) => parse(src),
  worldAt: (dir) => makeNodeWorld(dir),
};

/** `[surface digest, file]`, measured on `main` at `60e2436c` (see the header). */
const BASELINE: [string, string][] = [
  ["5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c", "examples/accessible.arch"],
  ["e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521", "examples/aquarium.arch"],
  ["07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc", "examples/attached.arch"],
  ["cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283", "examples/bungalow.arch"],
  ["809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6", "examples/classroom-block.arch"],
  ["af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5", "examples/clinic.arch"],
  ["a6d2075bd43f6d46984d64a2ae8edd6e6c96f25ea4fae91f2984ad7bdd4a5b1f", "examples/corner-cafe.arch"],
  ["50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67", "examples/courtyard-family.arch"],
  ["e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce", "examples/courtyard-house.arch"],
  ["cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a", "examples/furnished-flat.arch"],
  ["0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2", "examples/gallery-l.arch"],
  ["72528a5f6784a5c5d9527299a5abb330423c747bafb17458716dc336cc9a3eb3", "examples/garden-house.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0", "examples/garden-loft.arch"],
  ["3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8", "examples/hexagon-pavilion.arch"],
  ["a297769a6679a3b1a5fff9f4146b0eb01a71ad80c35aca165ed82ec8c46a5755", "examples/hillside-villa.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252", "examples/imports.arch"],
  ["f4f0ed59cff4dd7b970fe069579044226fcb0e4f68f24a85845e648875ed17e5", "examples/knob-flat.arch"],
  ["21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e", "examples/laneway-house.arch"],
  ["f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804", "examples/lib/doors.arch"],
  ["57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310", "examples/lib/fixtures.arch"],
  ["adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b", "examples/lib/furniture.arch"],
  ["9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92", "examples/library.arch"],
  ["635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925", "examples/materials.arch"],
  ["546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126", "examples/museum-wing.arch"],
  ["1149f0993df1cd719dcffd1d8c5c43c4ea6176c9a43b47954b23b3950bcc6f4a", "examples/museum-wings.arch"],
  ["3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4", "examples/museum.arch"],
  ["8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120", "examples/one-room.arch"],
  ["402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef", "examples/parametric.arch"],
  ["f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4", "examples/practice-office.arch"],
  ["d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084", "examples/relational.arch"],
  ["f0f4a5aa4758c3f9feb14449b6a9be0b7afd020fb925619c6d83e66f7cb95f2d", "examples/remodel.arch"],
  ["602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798", "examples/sheet-notes.arch"],
  ["54adc1b89e5472644f55bc3f33f9aa6fd1576b39b324eb6afd8370d8e3cb796f", "examples/showcase/garden-courtyard.arch"],
  ["b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553", "examples/studio.arch"],
  ["6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d", "examples/terrace-row.arch"],
  ["edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf", "examples/themed.arch"],
  ["7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17", "examples/tiny-house.arch"],
  ["e3a0dd96778a4b6bca5c3a3363a7583a9508be5b87cedd65638f81b7670795a8", "examples/townhouse.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5", "examples/transit-hall.arch"],
  ["4d2fb9dcc6a44640a4d0e52d202df14909c73a5743799af8c25cb1f117dc87a8", "examples/turning-stair.arch"], // RM9.2, see ./byte-identity-baseline.ts
  ["fe871cbb3d60c1594495e38b1ad0dc30ce3f71904c27b85fa60f276d3aa182bd", "examples/two-bed.arch"],
  ["3b39a946ba68d2d386deb2ddf2ac70e647e841754137c64b076c6a74c43247b2", "examples/two-storey.arch"], // RM9.2, see ./byte-identity-baseline.ts
];

/** A 10 m square room, walled on its four edges (`walled`) or standing alone, on an optional grid. */
const plan = (statement: string, walled = true, grid?: number): string => `plan "P" {
  units mm
${grid ? `  grid ${grid}\n` : ""}${walled ? "  wall id=w exterior thickness 200 { (0,0) (10000,0) (10000,10000) (0,10000) close }\n" : ""}  room id=r at (0,0) size 10000x10000 label "R"
  ${statement}
}`;

const errors = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);

const pieceOf = (src: string): RFurniture =>
  resolve(parse(src).plan!).ir.elements.find((e): e is RFurniture => e.kind === "furniture")!;

/**
 * The whole surface of one plan: the drawing, `describe()` and `lint()`, without byte spans. The
 * two statements compared differ in length by the `size` clause, so every span after it moves.
 */
const surface = (src: string): string =>
  JSON.stringify([compile(src, { noCache: true }).svg, describe(src), lint(src)], (k, v) =>
    k === "span" ? undefined : v,
  );

/** The one wording the twin law allows to differ: a default's snap note names its source. */
const asTwin = (surfaceText: string): string => surfaceText.replaceAll('\\" catalogued size ', '\\" size ');

/** Every family and every alias with a footprint (an alias has its own catalogue row). */
const SIZED = FIXTURE_CATEGORIES.filter((c) => defaultFootprint(c) !== null);

/** `grid g` snapping, as the resolver does it (`ctx.snap`). */
const snapped = (v: number, g: number | undefined): number => (g ? Math.round(v / g) * g : v);

interface Form {
  /** The placement and any turn, written after the category. */
  placement: string;
  walled: boolean;
  /** A `grid` the plan sets; absent = none. */
  grid?: number;
  /** The plan size (or, for `against`, along × depth) the rule names, from the footprint. */
  size(fp: { along: number; depth: number }, oriented: boolean): [number, number];
  /** The quarter-turn the piece resolves to; `undefined` = none. */
  rotate?(oriented: boolean): number | undefined;
}

const ALONG = (fp: { along: number; depth: number }): [number, number] => [fp.along, fp.depth];
const ACROSS = (fp: { along: number; depth: number }): [number, number] => [fp.depth, fp.along];

/** Every placement form, with the footprint the orientation rule names for it. */
const FORMS: Form[] = [
  { placement: "at (2000,2000)", walled: true, size: ALONG, rotate: () => undefined },
  { placement: "at (2000,2000) rotate 90", walled: true, size: ACROSS, rotate: () => 90 },
  { placement: "at (2000,2000) rotate 180", walled: true, size: ALONG, rotate: () => 180 },
  { placement: "in r centered", walled: true, size: ALONG, rotate: () => undefined },
  { placement: "in r centered rotate 270", walled: true, size: ACROSS, rotate: () => 270 },
  { placement: "in r anchor top", walled: true, size: ALONG, rotate: () => undefined },
  {
    placement: "in r anchor left",
    walled: true,
    size: (fp, o) => (o ? ACROSS(fp) : ALONG(fp)),
    rotate: (o) => (o ? 270 : undefined),
  },
  {
    placement: "in r anchor right flush",
    walled: true,
    size: (fp, o) => (o ? ACROSS(fp) : ALONG(fp)),
    rotate: (o) => (o ? 90 : undefined),
  },
  { placement: "in r anchor left", walled: false, size: ALONG, rotate: () => undefined },
  { placement: "in r anchor left rotate 90", walled: false, size: ACROSS, rotate: () => 90 },
  // A corner walled on both edges: the rotate-0 footprint, and the existing derivation reads its shape.
  { placement: "in r anchor bottom-right", walled: true, size: ALONG },
  { placement: "against wall w segment 0 offset 3000 in r", walled: true, size: ALONG },
  { placement: "against r.left offset 3000", walled: true, size: ALONG },
  // Under a grid. 100 moves many footprints and zeroes none; 300 zeroes ten, which have no twin.
  { placement: "at (2000,2000)", walled: true, grid: 100, size: ALONG, rotate: () => undefined },
  { placement: "at (2000,2000) rotate 90", walled: true, grid: 300, size: ACROSS, rotate: () => 90 },
  { placement: "in r centered", walled: true, grid: 300, size: ALONG, rotate: () => undefined },
  {
    placement: "in r anchor right flush",
    walled: true,
    grid: 300,
    size: (fp, o) => (o ? ACROSS(fp) : ALONG(fp)),
    rotate: (o) => (o ? 90 : undefined),
  },
  { placement: "in r anchor left", walled: false, grid: 100, size: ALONG, rotate: () => undefined },
  // `against` under a grid (CO.1): 200 moves many footprints and zeroes a side of some (a mirror's 50 mm depth).
  { placement: "against wall w segment 0 offset 3000 in r", walled: true, grid: 200, size: ALONG },
  { placement: "against r.left offset 3000", walled: true, grid: 100, size: ALONG },
];

const formName = (f: Form): string =>
  `${f.placement}${f.walled ? "" : " (no walls)"}${f.grid ? ` on grid ${f.grid}` : ""}`;

/** Does the grid take a side of this footprint (as the form lays it) to 0? */
const zeroed = (c: string, f: Form): boolean =>
  f.size(defaultFootprint(c)!, orientationMatters(c)).some((v) => snapped(v, f.grid) <= 0);

/** `furniture <c> <placement>` with the size the rule names written out, before any turn clause. */
const written = (c: string, f: Form, oriented: boolean): string => {
  const [w, h] = f.size(defaultFootprint(c)!, oriented);
  const turn = /\s(rotate \d+)$/.exec(f.placement);
  const place = turn ? f.placement.slice(0, turn.index) : f.placement;
  return `furniture ${c} ${place} size ${w}x${h}${turn ? ` ${turn[1]}` : ""}`;
};

suite("the law: every example compiles as it did", () => {
  it("the table covers every example", () => {
    expect(BASELINE.map((r) => r[1])).toEqual(archFilesUnder(ROOT, "examples"));
  });
  for (const [digest, file] of BASELINE) {
    it(file, () => {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(surfaceDigest(API, src, join(ROOT, file))).toBe(digest);
    });
  }
});

suite("every family with a footprint, under every placement, without a size", () => {
  it("the families are real (so a green run cannot be vacuous)", () => {
    expect(SIZED.length).toBeGreaterThan(70);
    expect(SIZED.some((c) => orientationMatters(c))).toBe(true);
    expect(SIZED.some((c) => !orientationMatters(c))).toBe(true);
    // Aliases are in, and a grid row reaches a zeroed footprint (each grid row checks a moved one).
    expect(SIZED).toContain("toilet");
    const grid = FORMS.filter((f) => f.grid);
    expect(grid.some((f) => SIZED.some((c) => zeroed(c, f)))).toBe(true);
    const againstGrid = grid.filter((f) => f.placement.startsWith("against"));
    expect(againstGrid.some((f) => SIZED.some((c) => zeroed(c, f)))).toBe(true);
  });

  for (const f of FORMS) {
    it(`${formName(f)}: no error, and the footprint the rule names`, () => {
      for (const c of SIZED) {
        if (zeroed(c, f)) continue; // the zero rows below
        const src = plan(`furniture ${c} ${f.placement}`, f.walled, f.grid);
        expect(errors(src), c).toEqual([]);
        if (f.placement.startsWith("against")) continue; // its own resolved frame, pinned elsewhere
        const o = orientationMatters(c);
        const p = pieceOf(src);
        const [w, h] = f.size(defaultFootprint(c)!, o);
        expect([p.size.w, p.size.h], c).toEqual([snapped(w, f.grid), snapped(h, f.grid)]);
        if (f.rotate) expect(p.rotate, c).toBe(f.rotate(o));
      }
    });

    it(`${formName(f)}: the same surface as the size written out`, () => {
      let moved = 0;
      for (const c of SIZED) {
        if (zeroed(c, f)) continue;
        const o = orientationMatters(c);
        const bare = plan(`furniture ${c} ${f.placement}`, f.walled, f.grid);
        const full = plan(written(c, f, o), f.walled, f.grid);
        expect(errors(full), c).toEqual([]);
        const b = surface(bare);
        if (b.includes('\\" catalogued size ')) moved++;
        expect(asTwin(b), c).toBe(surface(full));
      }
      // On a grid the note really is reached (so the allowed wording is not vacuous); off one, never.
      if (f.grid) expect(moved).toBeGreaterThan(0);
      else expect(moved).toBe(0);
    });

    if (f.grid && !f.placement.startsWith("against"))
      it(`${formName(f)}: a footprint the grid takes to 0 is one E_FURN_SIZE`, () => {
        const hit = SIZED.filter((c) => zeroed(c, f));
        for (const c of hit) {
          const [w, h] = f.size(defaultFootprint(c)!, orientationMatters(c));
          const ds = compile(plan(`furniture ${c} ${f.placement}`, f.walled, f.grid), {
            noCache: true,
          }).diagnostics.filter((d) => d.severity === "error");
          expect(
            ds.map((d) => `${d.code}: ${d.message}`),
            c,
          ).toEqual([
            `E_FURN_SIZE: Furniture "${c}_1" has no positive size: its catalogued ${w}x${h} snaps to ` +
              `${snapped(w, f.grid)}x${snapped(h, f.grid)} on \`grid ${f.grid}\``,
          ]);
        }
      });

    if (f.grid && f.placement.startsWith("against"))
      it(`${formName(f)}: a footprint the grid takes to 0 is no error, one W_GRID_SNAPPED naming the side`, () => {
        const hit = SIZED.filter((c) => zeroed(c, f));
        if (f.grid === 200) expect(hit).toContain("mirror"); // the row's reason to exist
        for (const c of hit) {
          const [w, h] = f.size(defaultFootprint(c)!, orientationMatters(c));
          const [sw, sh] = [snapped(w, f.grid), snapped(h, f.grid)];
          const side = sh <= 0 ? "depth" : "along";
          const ds = compile(plan(`furniture ${c} ${f.placement}`, f.walled, f.grid), { noCache: true }).diagnostics;
          expect(
            ds.filter((d) => d.severity === "error"),
            c,
          ).toEqual([]);
          expect(
            ds.filter((d) => d.code === "W_GRID_SNAPPED").map((d) => d.message),
            c,
          ).toEqual([
            `Furniture "${c}_1" catalogued size ${w} x ${h} was snapped to ${sw} x ${sh} by \`grid ${f.grid}\`: ` +
              `its ${side} ${side === "depth" ? h : w} snaps to 0`,
          ]);
          // A written size that snaps to 0 under `against` is still the error it always was.
          const twin = compile(plan(written(c, f, orientationMatters(c)), f.walled, f.grid), { noCache: true });
          expect(
            twin.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
            c,
          ).toEqual(["E_FURN_SIZE"]);
        }
      });
  }
});

suite("the orientation rule, on a WC (400 along x 700 deep)", () => {
  const wc = (statement: string, walled = true) => pieceOf(plan(`furniture wc ${statement}`, walled));
  const turn = (p: RFurniture) => ({ w: p.size.w, h: p.size.h, rotate: p.rotate ?? 0 });

  it("`at` is the footprint back north at rotate 0, turned by a written `rotate`", () => {
    expect(turn(wc("at (1000,1000)"))).toEqual({ w: 400, h: 700, rotate: 0 });
    expect(turn(wc("at (1000,1000) rotate 90"))).toEqual({ w: 700, h: 400, rotate: 90 });
    expect(turn(wc("at (1000,1000) rotate 270"))).toEqual({ w: 700, h: 400, rotate: 270 });
    expect(turn(wc("at (1000,1000) rotate 180"))).toEqual({ w: 400, h: 700, rotate: 180 });
  });

  it("`in … anchor <edge>` puts the back on the one walled edge the anchor names", () => {
    expect(turn(wc("in r anchor top"))).toEqual({ w: 400, h: 700, rotate: 0 });
    expect(turn(wc("in r anchor right"))).toEqual({ w: 700, h: 400, rotate: 90 });
    expect(turn(wc("in r anchor bottom"))).toEqual({ w: 400, h: 700, rotate: 180 });
    expect(turn(wc("in r anchor left"))).toEqual({ w: 700, h: 400, rotate: 270 });
    // The back really is on that wall: no back-to-room warning.
    const src = plan("furniture wc in r anchor right flush");
    expect(lint(src).map((d) => d.code)).not.toContain("W_FIXTURE_BACK_TO_ROOM");
  });

  it("with no walled edge, or a written turn, the rotate-0 footprint stands, turned by that turn", () => {
    expect(turn(wc("in r anchor right", false))).toEqual({ w: 400, h: 700, rotate: 0 });
    expect(turn(wc("in r anchor right rotate 270"))).toEqual({ w: 700, h: 400, rotate: 270 });
    expect(turn(wc("in r centered"))).toEqual({ w: 400, h: 700, rotate: 0 });
  });

  it("a corner walled on both edges keeps the rotate-0 footprint and backs onto the edge it fits", () => {
    expect(turn(wc("in r anchor top-right"))).toEqual({ w: 400, h: 700, rotate: 0 });
    expect(turn(wc("in r anchor bottom-left"))).toEqual({ w: 400, h: 700, rotate: 180 });
  });

  it("a rectilinear ring room takes the same rule", () => {
    const src = `plan "P" {
  units mm
  room id=r polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "L"
  walls from rooms exterior 200 partition 100
  furniture wc in r anchor left
}`;
    expect(errors(src)).toEqual([]);
    expect(turn(pieceOf(src))).toEqual({ w: 700, h: 400, rotate: 270 });
  });

  it("`facing` reads the rotate-0 footprint; a turn onto its short side is E_FACING_TRANSPOSED", () => {
    const src = (target: string) =>
      plan(`furniture id=t table at (${target}) size 800x800\n  furniture wc at (4800,4650) facing t`, false);
    expect(errors(src("4600,7000"))).toEqual([]); // the front (south) points at it: no turn
    const east = errors(src("8000,4600"));
    expect(east).toHaveLength(1);
    expect(east[0]).toMatch(/^E_FACING_TRANSPOSED: .*write `size 700x400`$/);
  });
});

suite("a kind with no footprint: the message says why", () => {
  const PLACEMENTS = [
    "at (2000,2000)",
    "in r centered",
    "in r anchor top",
    "against wall w segment 0 in r",
    "against r.top",
  ];

  it("a catalogued kind with no footprint names its kind", () => {
    expect(defaultFootprint("sofa")).toBeNull();
    for (const p of PLACEMENTS) {
      const ds = compile(plan(`furniture sofa ${p}`), { noCache: true }).diagnostics.filter(
        (d) => d.code === "E_FURN_SIZE",
      );
      expect(ds, p).toHaveLength(1);
      expect(ds[0]!.message, p).toBe(
        'Furniture "sofa_1" needs a `size WxH`: a sofa has no catalogued footprint to default to',
      );
      expect(ds[0]!.hints?.[0], p).toMatch(/under any placement/);
    }
  });

  it("an uncatalogued word says it is not catalogued", () => {
    const ds = compile(plan("furniture hammock at (2000,2000)"), { noCache: true }).diagnostics.filter(
      (d) => d.code === "E_FURN_SIZE",
    );
    expect(ds.map((d) => d.message)).toEqual([
      'Furniture "hammock_1" needs a `size WxH`: "hammock" is not a catalogued fixture, so it has no footprint to default to',
    ]);
  });

  it("never claims a missing footprint for a kind that has one, under any placement", () => {
    for (const c of SIZED)
      for (const f of FORMS.filter((x) => !x.grid)) {
        const ds = compile(plan(`furniture ${c} ${f.placement}`, f.walled), { noCache: true }).diagnostics;
        expect(
          ds.filter((d) => d.code === "E_FURN_SIZE"),
          `${c} ${f.placement}`,
        ).toEqual([]);
      }
  });
});
