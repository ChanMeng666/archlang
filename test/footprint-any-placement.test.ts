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
 * Every default is therefore one an author could have written: each case below compiles to the
 * same SVG, `describe()` and `lint()` (byte spans aside) as the statement with that `size`
 * written out.
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
 */

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RFurniture } from "../src/ir.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { CANONICAL_FIXTURES } from "../src/elements/fixtures-glyphs.js";
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
  ["55ad2593f768d91a282b6cde6e8a06f6ee5dbd5701fe1858aa8905431432767a", "examples/garden-house.arch"],
  ["f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0", "examples/garden-loft.arch"],
  ["3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8", "examples/hexagon-pavilion.arch"],
  ["36397208c3c6ea06f9bbc3efba156b33de2189455086852e290890f3c8784884", "examples/hillside-villa.arch"],
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
  ["4ebf99f3ba158cc7652424c413c94f9f837f6afd24546d8bbac0f080bb281652", "examples/townhouse.arch"],
  ["a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5", "examples/transit-hall.arch"],
  ["a60a7362582085a80c577e970a5139fc01d12ec4600af7ad8f4ed8a4ede897aa", "examples/turning-stair.arch"],
  ["fe871cbb3d60c1594495e38b1ad0dc30ce3f71904c27b85fa60f276d3aa182bd", "examples/two-bed.arch"],
  ["9bad4f64cdc450219b6adac2c6de7a4790d0b48917ef88358b9c54c78b57a90f", "examples/two-storey.arch"],
];

/** A 10 m square room, walled on its four edges (`walled`) or standing alone. */
const plan = (statement: string, walled = true): string => `plan "P" {
  units mm
${walled ? "  wall id=w exterior thickness 200 { (0,0) (10000,0) (10000,10000) (0,10000) close }\n" : ""}  room id=r at (0,0) size 10000x10000 label "R"
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

const SIZED = CANONICAL_FIXTURES.filter((c) => defaultFootprint(c) !== null);

interface Form {
  /** The placement and any turn, written after the category. */
  placement: string;
  walled: boolean;
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
];

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
  });

  for (const f of FORMS) {
    it(`${f.placement}${f.walled ? "" : " (no walls)"}: no error, and the footprint the rule names`, () => {
      for (const c of SIZED) {
        const src = plan(`furniture ${c} ${f.placement}`, f.walled);
        expect(errors(src), c).toEqual([]);
        if (f.placement.startsWith("against")) continue; // its own resolved frame, pinned elsewhere
        const o = orientationMatters(c);
        const p = pieceOf(src);
        const [w, h] = f.size(defaultFootprint(c)!, o);
        expect([p.size.w, p.size.h], c).toEqual([w, h]);
        if (f.rotate) expect(p.rotate, c).toBe(f.rotate(o));
      }
    });

    it(`${f.placement}${f.walled ? "" : " (no walls)"}: the same surface as the size written out`, () => {
      for (const c of SIZED) {
        const o = orientationMatters(c);
        const bare = plan(`furniture ${c} ${f.placement}`, f.walled);
        const full = plan(written(c, f, o), f.walled);
        expect(errors(full), c).toEqual([]);
        expect(surface(bare), c).toBe(surface(full));
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
      for (const f of FORMS) {
        const ds = compile(plan(`furniture ${c} ${f.placement}`, f.walled), { noCache: true }).diagnostics;
        expect(
          ds.filter((d) => d.code === "E_FURN_SIZE"),
          `${c} ${f.placement}`,
        ).toEqual([]);
      }
  });
});
