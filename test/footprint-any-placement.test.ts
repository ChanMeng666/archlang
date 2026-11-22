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
  ["a5253e454b307c87f22f8e47e6f785db8bb880885b8d47561f2d808d1016e918", "examples/aquarium.arch"],
  ["07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc", "examples/attached.arch"],
  ["0dd331e28b8f4e20c3b359c8e819ed738290295cc83934c1a38808d2fd83dc13", "examples/bungalow.arch"], // CV13 (was 074d5531): example source edited (chairs added)
  ["4d558795c0b345b3a9a1e5454bc476125983a63dee7d3227c0d3afe09b7ed3bd", "examples/classroom-block.arch"],
  ["6a8b78ce84d10bea939f48f431d16e127cb95b982f473d33072889e110ff4788", "examples/clinic.arch"],
  ["d669e11a11740a841311fe359a3d5bc650343ba1f16e827bc4d869dc65206bd5", "examples/corner-cafe.arch"],
  ["50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67", "examples/courtyard-family.arch"],
  ["3ce3c72f6915ece00f2eca8d9321651aca7c2644b95cc423f10397395fc9ab12", "examples/courtyard-house.arch"], // CV13 (was 0f6dddac): example source edited (chairs added)
  ["cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a", "examples/furnished-flat.arch"],
  ["f3d86da1d7aed260f386efa6ca98b440c89ee7b2b84b0d0937401c72d7bb113e", "examples/gallery-l.arch"],
  ["5b0ec567a174809bd4d5a7c62907b611741e3537577e9552026d400c28cedcd6", "examples/garden-house.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 72528a5f)
  ["2814a29269f878cd596372eafe0fdf8c1d1bc9f0c478b33f1cae2906b6db8d8d", "examples/garden-loft.arch"], // CV13 (was e0ce8a5f): example source edited (chairs added)
  ["752b391b72fa247a99b979b8e1f4fc6f7a6783316cd29ad0bea4447245b0e311", "examples/hexagon-pavilion.arch"], // CV13 (was 3078765c): example source edited (chairs added)
  ["846971b81c64739f79f3d185160d4323d6db273cc77cafb5a933387c0e9b5f3b", "examples/hillside-villa.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 123f2af2)
  ["3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252", "examples/imports.arch"],
  ["578ec7551025df65b704f453b7af3493bf4abcfb19737fdece206e4c85fd2586", "examples/knob-flat.arch"],
  ["21f4d5bc82e2e8d46536bd2dc5623b05ea76e937db31c7d4ed482a4c5e3118bc", "examples/laneway-house.arch"], // CV13 (was 958934b4): example source edited (chairs added)
  ["f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804", "examples/lib/doors.arch"],
  ["57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310", "examples/lib/fixtures.arch"],
  ["adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b", "examples/lib/furniture.arch"],
  ["aa107b1b311d1545f228eaac173cc95a396a6acd86fdeb6db58de4ba3617f7b7", "examples/library.arch"],
  ["b3d629675b1a43d4d1113f10b38e732d0b826fdb2b019fcf14ac4b166abd435d", "examples/materials.arch"],
  ["add9b13a425ec75dd2b88c4eba087465228822c37321b3d1952db6f0795ef6c7", "examples/museum-wing.arch"],
  ["4acccb8ead0234e18186574c23a4c795d32c6a8f819fc67a983cebea337b8b29", "examples/museum-wings.arch"],
  ["bf1d425c9bf21d6ddb3e4757f53a1820f186cca67c3300c0a6ce8eb6b4e73713", "examples/museum.arch"],
  ["8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120", "examples/one-room.arch"],
  ["7cceeb1be4622a8b84e1625a124d31f44fdfc15cd5362c4f4f25fa67f5560989", "examples/parametric.arch"],
  ["bf127fd8266fe3d85e9f25712ac69c02bd42370c7027cf1a01baeafe1d3aa36c", "examples/practice-office.arch"],
  ["d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084", "examples/relational.arch"],
  ["b7fc3b7f11be692ffdc3125d66d01e9c70cb9ade93ab673f4bb4ddaebd0e085c", "examples/remodel.arch"], // SR.15 (was 5fd914bb); CV13 (was f0f4a5aa): example source edited (chairs added)
  ["708332c1a3f4cf35989718277b996af6f718d2e5fb8bd3d2912d8f87f7d61a2a", "examples/sheet-notes.arch"],
  ["f71aacc239a5bc518ea19e16c2152c3be59239bf96f73ae5248fa80fa23e3c75", "examples/showcase/garden-courtyard.arch"], // CV13 (was 54adc1b8): example source edited (chairs added)
  ["b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553", "examples/studio.arch"],
  ["3e8d6696f955b554411c7379e3a8bc9ce5cbf83a9521930129f18915bca585d0", "examples/terrace-row.arch"], // CV08 (was 6667da00): example source edited (sofa turned to face the room)
  ["edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf", "examples/themed.arch"],
  ["7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17", "examples/tiny-house.arch"],
  ["42be4e4d302a36d2a95f93fe215539d45739f5f21c9dbca3a96089b8f6c18afd", "examples/townhouse.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV13 (was 3657648f): example source edited (chairs added); CV08 (was 3395a3eb): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was e51de067)
  ["649e39d370d434467bee6f23ad8c7fc0bef578d44081f18d96ec82ed2532c5be", "examples/transit-hall.arch"],
  ["4278a96ba7b215a43f121d04bd47fd94c94ab0c145cb7f7a2a7aba5201e2c6a2", "examples/turning-stair.arch"], // RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 4d2fb9dc)
  ["6393e0321cc48a44fbf17b7aa6008d89dcfbbcceea13418c4045875c5ffdf6c0", "examples/two-bed.arch"], // CV13 (was fe871cbb): example source edited (chairs added)
  ["92a71843b7de0b87acb1ef3ea1b859d1c0bedbe4ef35025f3524ecea1d674aa8", "examples/two-storey.arch"], // RM9.2, see ./byte-identity-baseline.ts
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
