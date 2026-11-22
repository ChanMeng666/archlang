/**
 * The `rendered` theme (visual-assets card V4; ADR 0023, the 2026-11-04 amendment).
 *
 * 1. **The byte-identity law.** Every shipped example and the inline rows of
 *    `test/helpers/rendered-theme-law.ts`, under the default and each of the four themes that existed before
 *    `rendered`, draw, describe, lint and diagnose exactly as they did. Each row is
 *    {@link themeLawDigest}, **measured against `src/` at `241fbfc3`** (`main` before the theme) by
 *    the law's own body, run with that tree's compiler and themes. A digest moving is a finding to
 *    explain before it is a diff to re-measure.
 * 2. **A theme draws only.** Under `rendered` — as a `CompileOptions.theme` and as the plan's own
 *    `theme rendered` — `describe()`, `lint()` and `compile().diagnostics` equal the default's.
 * 3. **The family→material table** covers every canonical family exactly, aliases resolve through
 *    their family, and the export from the package root is that table itself.
 * 4. **Tints are fills only.** Under `rendered`, every symbol draws the same nodes, geometry, pens
 *    and strokes as `rendered` with its tints removed; only a fill may differ, and only to the tint
 *    of the family's own material. The outline ink keeps at least 3:1 on every tint.
 * 5. **An author's one furniture colour wins** over the tints (`theme rendered { furniture … }`,
 *    `style furniture { fill … }`, a later `CompileOptions.theme` naming another base).
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

import { describe as suite, expect, it } from "vitest";
import * as core from "../src/index.js";
import { compile, describe, lint } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";
import {
  CANONICAL_FIXTURES,
  FIXTURE_CATEGORIES,
  FIXTURE_FAMILY_MATERIALS,
  FIXTURE_MATERIALS,
  type FixtureMaterial,
  canonicalFixture,
  fixtureGlyph,
  familyMaterials,
} from "../src/elements/fixtures-glyphs.js";
import { glyphCtx, parseHexColor, symbolInk } from "../src/elements/glyph-lib.js";
import type { SceneNode } from "../src/scene.js";
import { DEFAULT_THEME, mergeTheme, sanitizeTheme, THEMES, type Theme } from "../src/theme.js";
import type { World } from "../src/world.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";
import {
  LEGACY_THEMES,
  MEASURED_FAMILIES,
  perThemeDigests,
  type ThemeLawApi,
  themeLawDigest,
  themeLawRows,
} from "./helpers/rendered-theme-law.js";

const sceneOf = () =>
  compile(`plan "G" { units mm room id=r at (0,0) size 4000x3000 label "R" }`, { noCache: true }).scene!;

const API: ThemeLawApi = { compile, describe, lint, themes: THEMES };
const ROWS = themeLawRows(ROOT, CANONICAL_FIXTURES);
const worldOf = (dir: string | undefined): World | undefined => (dir ? makeNodeWorld(dir) : undefined);

/** Measured at `241fbfc3` (see the header): `[digest, row]`. */
const BASELINE: [string, string][] = [
  ["7c828f62cd3bd017b8bc90a11e58d40162283aef9b6e25c179aa5abf39c693ea", "examples/accessible.arch"],
  ["b1c818d2bd800a59fc502d82e7fc8e19074753661661d9eb75d9bf0036ec8efc", "examples/aquarium.arch"],
  ["4bca852d43826d6a19bb22d0bcaf20714c7392c7bf63457abc5d064ad14831aa", "examples/attached.arch"],
  ["660fc41f31aecceb73baec824e2525ba48a4f59109bf2b6698be05e6aa237a64", "examples/bungalow.arch"], // CV13 (was bbac7be3): example source edited (chairs added)
  ["c19f4ae4736baad22c126138049bfaf162db2b4f4e19b235eadc1802fed1506d", "examples/classroom-block.arch"],
  ["4e38607777c51dccb0a7969d96912f9540d9b6d1cb6cb90517ab261206aa727e", "examples/clinic.arch"],
  ["0ff8f3ad3f9c21cd6f3bab8441fc5f8dfaa34b14d2a528682df5c7c793fb8631", "examples/corner-cafe.arch"],
  ["281a83d22645de99fbc5849ba79a0734b5635cbbe301f8b2947d93ad8182d912", "examples/courtyard-family.arch"], // new example (RM8.5, the courtyard-family showcase)
  ["59ba7adeb9de4f1a6745c1ba7ee2ceaa2d252a7825a678406e2ccefd578960bb", "examples/courtyard-house.arch"], // CV13 (was 15c1cd92): example source edited (chairs added)
  ["fe32076533f5e888264999eaafb466ef70adcf4aae03b028b428d747781f51ac", "examples/furnished-flat.arch"],
  ["7c2d19e317d8182f97d3a3364aab6c61054dbcf154f356f792e07951fb4cc9e8", "examples/gallery-l.arch"],
  ["5b1833f6a5535ef4092199f884fb0fc5a53dc95cd18943778c7ce58d4c83b234", "examples/garden-house.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 5e8ad002)
  ["05a0e987ab75be9820173cb2c7703c44da82fe58bfc3fd104a9f17bc59115a24", "examples/garden-loft.arch"], // CV13 (was f878ff2a): example source edited (chairs added)
  ["a6f71310fb8481b85b333f52c30b9d599c71eb6dcb47f755b9f2b223edab24bf", "examples/hexagon-pavilion.arch"], // CV13 (was 2184afc6): example source edited (chairs added)
  ["a4e589c2d909117187f6853c30f95b2a5a8f34869dc6229f54386faf606ea00b", "examples/hillside-villa.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was c4da52d8)
  ["dcc2b4674edc4f74db43a3ad65d1402290786ff9fcf45c21447db95fafae5ac7", "examples/imports.arch"],
  ["54ef5cae9feda0abc8176f144ab34ae2d7977ce0200b7e50fc7c3a44613dfdf0", "examples/knob-flat.arch"], // new example (P4, the knobs example)
  ["c8fc6c4319c3acac47673c9373c563903944b6210fcf5db75ce9bdbdc4ffecf2", "examples/laneway-house.arch"], // CV13 (was 9216c7fc): example source edited (chairs added)
  ["e2c4c9a07d7b8b0fa4bab156cedaa472c5fcf87c364530df5d4b2309d8062c6a", "examples/library.arch"],
  ["e7c86098ac9d2a454e3f1eafd04e937edb957b4344e7875d9006266c673fbad8", "examples/materials.arch"],
  ["5012abb624b8e5dd911e089260dc277f165b0458c605abc4b9538d3492194d64", "examples/museum-wing.arch"],
  ["82e7a2f40d27d1a28d4a82a0abb5fefd06e463f3feb086b217c4957f30606974", "examples/museum-wings.arch"],
  ["baf86b8433ba15a4c17a01f5fb831096860892664bbce085bae10889b3248013", "examples/museum.arch"],
  ["1a39f73ad013b8ed14d64efd223c537b1ac7c2d3f766098dee2b937a103c0159", "examples/one-room.arch"],
  ["e3bb48ca1983e4b3acdb6afe98021316161ef67305b6e9f836ebc76929d4dfef", "examples/parametric.arch"],
  ["b20693583614568b73a8af6ddbb07dbd0ad83c9e9a180904a1aea1918a9303ab", "examples/practice-office.arch"],
  ["e69cb1312c57c389852ff8fb453dd9f39d056d78cdf43f27f1a0299eeea2f801", "examples/relational.arch"],
  ["00f7e303d12f8577fd6339d089005f70925c700b3a59e6ee0a728d7f9cc83af2", "examples/remodel.arch"], // SR.15 (was 50a972fd); CV13 (was a79c8cfd): example source edited (chairs added)
  ["9b7a2d165a06a1771a950cd1115dab082f3ee4463a825b25bb17b409eea3fdf7", "examples/sheet-notes.arch"],
  ["58bfb74a007d93f2eb59f479592e05c047a74d3174facfcc100ac68a4e05d227", "examples/studio.arch"],
  ["7aaf67c64e1cfaa57c27c35208fa0d4ab71ed283e3ecd962d1eefe78165c3541", "examples/terrace-row.arch"], // CV08 (was d311b42f): example source edited (sofa turned to face the room)
  ["fb713c6aa3be4a324d1f2256c817fa787f9a5373d47c7990f21c8eb0ee0956b2", "examples/themed.arch"],
  ["9691a3cc4ffbf7602ba945647cd2453376e39715c55dbd7f7a9934ef15186fc8", "examples/tiny-house.arch"],
  ["2202f2120f1f844f3700c836be0fb7ef43f91e18e6482d048d949d16618e2116", "examples/townhouse.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV13 (was 99d00adc): example source edited (chairs added); CV08 (was dbae02ed): example source edited (sofa turned to face the room); CV14: example source edited (stairwell void added) (was b20c150c)
  ["bd690a3b8e33326a36ef8361614e0f5704b778e0a93e68ced4d385d40ea6bf85", "examples/transit-hall.arch"],
  ["b8a1663c354d7e7867d052b0d1ba5e7c722284e10dd50bc5b1f944a69ae75dcc", "examples/turning-stair.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts; CV14: example source edited (stairwell void added) (was 2b978c23)
  ["a8f1f8b207085a8144988362d6dafa5c02d56862ccd7c47111c6376ee9e7f90d", "examples/two-bed.arch"], // CV13 (was caf049e3): example source edited (chairs added)
  ["48ac5c2d3b8d1b286aabd159c2d657379d384d22326569a740fdcaf349344a9b", "examples/two-storey.arch"], // RM1.3a, see ./byte-identity-baseline.ts; RM1.2a, see ./byte-identity-baseline.ts; RM9.2, see ./byte-identity-baseline.ts
  ["9bf244567364f85ea64f1aa4bc8ee19e63c1edc34ed5fe340ed116a54a8c0c84", "inline:every-family-1:50"],
  ["bf7b18dd8444e5103a8726224ce84ad92e0944ff80bd743620c1ae8695ff2463", "inline:every-family-unscaled"], // AL3b: one label placed again on its own floor, its report gone
  ["f710bc7958bde0aa45a0543fc9759e169a0a42e2fc122da01cb3fcc8e5f0ad27", "inline:style-furniture"],
  ["e9c2a013c6a38997b1cd572c7928e2225e64fa91fcb910963f75e6a2ed2de701", "inline:theme-override"],
  ["92ea18e1ca9fb80fbefac0afd13212c17bfcb84efb7977381adad1c8144064b5", "inline:uncatalogued"],
];

suite("rendered theme — byte-identity law over the earlier themes", () => {
  it("the themes the law sweeps are exactly the ones before `rendered`", () => {
    expect(Object.keys(THEMES)).toEqual([...LEGACY_THEMES, "rendered"]);
    for (const name of LEGACY_THEMES) expect(THEMES[name]!.materialTints, name).toBeUndefined();
    expect(DEFAULT_THEME.materialTints).toBeUndefined();
  });

  it("the every-family rows are measured over a family table at least as long as the one measured", () => {
    expect(CANONICAL_FIXTURES.length).toBeGreaterThanOrEqual(MEASURED_FAMILIES);
  });

  it("the table pins every row the law reads, in order", () => {
    expect(BASELINE.map(([, name]) => name)).toEqual(ROWS.map((r) => r.name));
  });

  // One case per row, so a red run names the plan; the message names the per-theme digests.
  for (const [want, name] of BASELINE) {
    it(`${name} is byte-identical under the default and every earlier theme`, () => {
      const row = ROWS.find((r) => r.name === name)!;
      const world = worldOf(row.dir);
      const got = themeLawDigest(API, row.src, world);
      expect(
        got,
        `per theme [default, ${LEGACY_THEMES.join(", ")}]: ${perThemeDigests(API, row.src, world).join(" ")}`,
      ).toBe(want);
    });
  }
});

/** `describe()`, `lint()` and `compile().diagnostics`, as JSON — the surfaces a theme must not reach. */
const semantic = (src: string, opts: Record<string, unknown>): string =>
  [
    JSON.stringify(describe(src, opts)),
    JSON.stringify(lint(src, opts)),
    JSON.stringify(compile(src, { noCache: true, ...opts }).diagnostics),
  ].join(" ");

/** The plan with `theme rendered` written into it, as its first statement. */
const withDirective = (src: string): string => src.replace(/^(plan "[^"]*" \{)$/m, "$1\n  theme rendered");

suite("rendered theme — a theme draws only", () => {
  for (const row of ROWS) {
    it(`${row.name}: describe(), lint() and diagnostics under rendered equal the default's`, () => {
      const w = row.dir ? { world: worldOf(row.dir) } : {};
      const plain = semantic(row.src, w);
      expect(semantic(row.src, { ...w, theme: THEMES.rendered })).toBe(plain);
      // The directive form, for the rows that carry no theme of their own. Inserting a line moves
      // every byte span below it, so the comparison is against the same edited source under an
      // untinted theme: `mono`, padded to the same length, so every span is where it was.
      if (!/^\s*theme\b/m.test(row.src) && /^plan "[^"]*" \{$/m.test(row.src)) {
        const edited = withDirective(row.src);
        const untinted = edited.replace("  theme rendered", "  theme mono    ");
        expect(semantic(edited, w)).toBe(semantic(untinted, w));
      }
    });
  }

  it("the rendered drawing does differ from the default (the theme is not a no-op)", () => {
    const flat = ROWS.find((r) => r.name === "examples/furnished-flat.arch")!;
    const tinted = compile(flat.src, { noCache: true, theme: THEMES.rendered }).svg;
    expect(tinted).not.toBe(compile(flat.src, { noCache: true }).svg);
    for (const m of ["wood", "fabric", "ceramic", "stone"] as const) {
      expect(tinted, m).toContain(`fill="${THEMES.rendered!.materialTints![m]}"`);
    }
  });
});

suite("rendered theme — the family→material table", () => {
  it("names a material for every canonical family, and nothing else", () => {
    expect(Object.keys(FIXTURE_FAMILY_MATERIALS).sort()).toEqual([...CANONICAL_FIXTURES].sort());
  });

  it("every alias resolves through its family; an uncatalogued word has none", () => {
    for (const word of FIXTURE_CATEGORIES) {
      expect(familyMaterials(word), word).toBe(FIXTURE_FAMILY_MATERIALS[canonicalFixture(word)!]);
    }
    expect(familyMaterials("tub")).toBe(FIXTURE_FAMILY_MATERIALS.bathtub);
    for (const w of ["widget", "__proto__", "constructor", "toString", ""])
      expect(familyMaterials(w), w).toBeUndefined();
  });

  it("every named material is in the closed vocabulary", () => {
    const vocab = new Set<string>(FIXTURE_MATERIALS);
    for (const [family, m] of Object.entries(FIXTURE_FAMILY_MATERIALS)) {
      expect(vocab.has(m.primary), `${family}.primary`).toBe(true);
      if (m.secondary !== undefined) expect(vocab.has(m.secondary), `${family}.secondary`).toBe(true);
    }
  });

  it("is exported from the package root as the table itself (additive)", () => {
    expect(core.FIXTURE_FAMILY_MATERIALS).toBe(FIXTURE_FAMILY_MATERIALS);
    expect(core.FIXTURE_MATERIALS).toBe(FIXTURE_MATERIALS);
    expect(core.familyMaterials).toBe(familyMaterials);
  });

  it("is frozen on a null prototype: no inherited key reads as a family, nothing can be edited", () => {
    expect(Object.getPrototypeOf(FIXTURE_FAMILY_MATERIALS)).toBeNull();
    expect(Object.isFrozen(FIXTURE_FAMILY_MATERIALS)).toBe(true);
    for (const m of Object.values(FIXTURE_FAMILY_MATERIALS)) expect(Object.isFrozen(m)).toBe(true);
    for (const k of ["constructor", "toString", "hasOwnProperty"]) {
      expect((FIXTURE_FAMILY_MATERIALS as Record<string, unknown>)[k], k).toBeUndefined();
    }
    expect(() => {
      (FIXTURE_FAMILY_MATERIALS as Record<string, unknown>).sofa = { primary: "glass" };
    }).toThrow();
  });

  it("`rendered` tints every material", () => {
    const tints = THEMES.rendered!.materialTints!;
    expect(Object.keys(tints).sort()).toEqual([...FIXTURE_MATERIALS].sort());
    for (const m of FIXTURE_MATERIALS) expect(parseHexColor(tints[m]!), m).not.toBeNull();
  });
});

const lum = (hex: string): number => {
  const [r, g, b] = parseHexColor(hex)!;
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

suite("rendered theme — fills only, and the line work still leads", () => {
  const rendered = mergeTheme(THEMES.rendered);
  const tints = rendered.materialTints!;
  const ink = symbolInk(rendered.furnitureStroke, rendered.wallStroke);

  it("the outline ink keeps at least 3:1 on every tint", () => {
    for (const m of FIXTURE_MATERIALS) {
      expect(contrast(ink, tints[m]!), `${ink} on ${m} ${tints[m]}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("a glyph surface without tints is the surface it always was, on every earlier theme", () => {
    const { sizes } = sceneOf();
    for (const t of [DEFAULT_THEME, ...LEGACY_THEMES.map((n) => mergeTheme(THEMES[n]))]) {
      for (const c of CANONICAL_FIXTURES) {
        const g = glyphCtx(t, sizes, familyMaterials(c));
        expect(g.body).toBe(t.furnitureFill);
        expect(g.basin).toBe(t.opening);
        for (const m of FIXTURE_MATERIALS) {
          expect(g.fillFor(m)).toBe(t.furnitureFill);
          expect(g.fillFor(m, "none")).toBe("none");
        }
      }
    }
  });

  /** Families that stay unfilled under every theme. The overhead pieces drawn as an outline
   *  (upper cabinet, pergola, range hood, wall AC, wall art) are dashed above the cut plane
   *  (ADR 0023 d4), so a tint would hide the piece below; the gazebo and the greenhouse are
   *  outlines, after the pergola, because the furniture standing in them is drawn as its own
   *  pieces and an opaque deck or glass would hide it or not by source order; the rug is an
   *  underlay that would hide what the furniture pass draws before it and the datum axes on the
   *  pass below (see the rug case in the next suite). Listed in family order. */
  const UNFILLED: string[] = [
    "upper_cabinet",
    "rug",
    "pergola",
    "range_hood",
    "wall_ac",
    "gazebo",
    "greenhouse",
    "wall_art",
  ];

  /** Every node with its fill blanked, so two drawings can be compared for all but their fills. */
  const shape = (nodes: SceneNode[]): string =>
    JSON.stringify(nodes.map((n) => ({ ...n, paint: { ...n.paint, fill: undefined } })));

  it("each family draws the same nodes with tints as without; a fill changes only to its own material's tint", () => {
    const { sizes } = sceneOf();
    const untinted: Theme = { ...rendered };
    delete untinted.materialTints;
    const bare: string[] = [];
    for (const c of CANONICAL_FIXTURES) {
      const fp = defaultFootprint(c);
      const r = { x: 0, y: 0, w: fp?.along ?? 1000, h: fp?.depth ?? 600 };
      const a = fixtureGlyph(c, r, rendered, sizes)!;
      const b = fixtureGlyph(c, r, untinted, sizes)!;
      expect(shape(a), c).toBe(shape(b));
      const m = familyMaterials(c)!;
      const allowed = new Set([tints[m.primary], ...(m.secondary ? [tints[m.secondary]] : [])]);
      let tinted = 0;
      a.forEach((n, i) => {
        const before = b[i]!.paint.fill;
        if (n.paint.fill === before) return;
        tinted++;
        expect(allowed.has(n.paint.fill), `${c} node ${i}: ${before} → ${n.paint.fill}`).toBe(true);
      });
      if (tinted === 0) bare.push(c);
    }
    // Every family shows its material somewhere — no symbol is left untinted by accident — except
    // the ones drawn as an outline over what stands beneath them, which a fill would hide.
    expect(bare).toEqual(UNFILLED);
  });

  it("each part takes the material it is made of (bunk bed, crib, shower, appliances, tyres)", () => {
    const { sizes } = sceneOf();
    const fills = (c: string): (string | undefined)[] => {
      const fp = defaultFootprint(c);
      return fixtureGlyph(c, { x: 0, y: 0, w: fp?.along ?? 1000, h: fp?.depth ?? 600 }, rendered, sizes)!.map(
        (n) => n.paint.fill,
      );
    };
    const blank = rendered.opening;
    // Bunk bed: frame and headboard wood, the mattress linen, the pillow white, the ladder wood.
    expect(fills("bunk_bed").slice(0, 4)).toEqual([tints.wood, tints.wood, tints.linen, blank]);
    expect(fills("bunk_bed")).toContain(tints.wood);
    // Crib: frame wood, mattress linen, blanket linen, its turned-down band white.
    expect(fills("crib").slice(0, 4)).toEqual([tints.wood, tints.linen, tints.linen, blank]);
    // Shower: tray and tray floor both ceramic; its glass is the screen, which the plan does not fill.
    expect(fills("shower").slice(0, 2)).toEqual([tints.ceramic, tints.ceramic]);
    expect(fills("shower")).not.toContain(tints.glass);
    // An appliance's control strip is white, never the door glass; a treadmill's console likewise.
    for (const c of ["washer", "dryer", "dishwasher"]) expect(fills(c), c).toContain(blank);
    expect(fills("dryer")).not.toContain(tints.glass);
    expect(fills("treadmill")).toContain(blank);
    // Tyres are rubber; the frame or body metal.
    for (const c of ["bicycle", "motorcycle"]) expect(fills(c).slice(0, 2), c).toEqual([tints.rubber, tints.rubber]);
    expect(fills("sandpit")).toContain(tints.soil);
  });

  it("a non-object `materialTints` (null from an untyped caller) is no tints, never a throw", () => {
    const src = `plan "N" {\n  units mm\n  room id=r at (0,0) size 4000x3000\n  furniture sofa at (300,300) size 2200x900 in r\n}\n`;
    for (const bad of [null, "wood", 7]) {
      const theme = { ...THEMES.rendered, materialTints: bad } as unknown as Partial<Theme>;
      const out = compile(src, { noCache: true, theme });
      expect(
        out.diagnostics.filter((d) => d.severity === "error"),
        String(bad),
      ).toEqual([]);
      const sofa = out.scene!.nodes.find((n) => n.layer === "furniture")!;
      expect(sofa.paint.fill, String(bad)).toBe(THEMES.rendered!.furnitureFill);
      expect("materialTints" in sanitizeTheme(mergeTheme(theme))).toBe(false);
    }
    // A glyph surface handed a raw null table directly reads it as none too.
    const g = glyphCtx(
      { ...rendered, materialTints: null } as unknown as Theme,
      sceneOf().sizes,
      familyMaterials("sofa"),
    );
    expect(g.body).toBe(rendered.furnitureFill);
    expect(g.basin).toBe(rendered.opening);
  });

  it("the tints are escaped like every theme colour", () => {
    const t = sanitizeTheme(mergeTheme({ materialTints: { wood: '#fff"/><x' } }));
    expect(t.materialTints!.wood).toBe("#fff&quot;/&gt;&lt;x");
    // A theme without tints gets no key at all.
    expect("materialTints" in sanitizeTheme(mergeTheme(THEMES.presentation))).toBe(false);
  });
});

suite("rendered theme — the rug hides nothing", () => {
  /** The probe from review: a column written BEFORE the rug, both on the furniture pass. */
  const PROBE = `plan "R" {
  units mm
  theme rendered
  axes {
    x at 4200
  }
  room id=r at (0,0) size 8000x6000
  column at (4000,3000) size 400x400
  furniture rug at (2500,2000) size 3000x2000 in r
  furniture sofa at (500,500) size 2200x900 in r
}
`;
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxOf = (n: SceneNode): Box | null => {
    const p = n.prim;
    const pts =
      p.t === "polygon"
        ? p.pts
        : p.t === "path"
          ? p.loops.flatMap((l) => [l.start, ...l.edges.map((e) => e.to)])
          : p.t === "circle"
            ? [
                { x: p.center.x - p.r, y: p.center.y - p.r },
                { x: p.center.x + p.r, y: p.center.y + p.r },
              ]
            : null;
    if (!pts || pts.length === 0) return null;
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const covers = (b: Box, x: number, y: number): boolean => b.x0 <= x && x <= b.x1 && b.y0 <= y && y <= b.y1;

  it("draws the column, and no filled node drawn after it covers it", () => {
    const scene = compile(PROBE, { noCache: true }).scene!;
    expect(compile(PROBE, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const furn = scene.nodes.filter((n) => n.layer === "furniture");
    const col = furn.findIndex((n) => {
      const b = boxOf(n);
      return b !== null && n.paint.fill !== "none" && covers(b, 4200, 3200) && b.x1 - b.x0 <= 400.0001;
    });
    expect(col, "the column is drawn").toBeGreaterThanOrEqual(0);
    for (const n of furn.slice(col + 1)) {
      const b = boxOf(n);
      if (b === null || n.paint.fill === undefined || n.paint.fill === "none") continue;
      expect(covers(b, 4200, 3200), `a ${n.prim.t} filled ${n.paint.fill} covers the column`).toBe(false);
    }
  });

  it("leaves the datum axis on the pass below visible through the rug: no furniture fill covers it", () => {
    const scene = compile(PROBE, { noCache: true }).scene!;
    expect(scene.nodes.some((n) => n.layer === "axes")).toBe(true);
    // The axis runs along x = 4200 through the rug at y = 2500; nothing filled on the furniture
    // pass may cover that point (the column stands at y 3000–3400, clear of it).
    for (const n of scene.nodes.filter((m) => m.layer === "furniture")) {
      const b = boxOf(n);
      if (b === null || n.paint.fill === undefined || n.paint.fill === "none") continue;
      expect(covers(b, 4200, 2500), `a ${n.prim.t} filled ${n.paint.fill} covers the axis`).toBe(false);
    }
  });
});

suite("rendered theme — an author's furniture colour wins", () => {
  const plan = (head: string): string =>
    `plan "A" {\n  units mm\n${head}\n  room id=r at (0,0) size 5000x4000\n  furniture sofa at (300,300) size 2200x900 in r\n}\n`;
  const sofaOutlineFill = (src: string, opts: Record<string, unknown> = {}): string | undefined =>
    compile(src, { noCache: true, ...opts }).scene!.nodes.find((n) => n.layer === "furniture")!.paint.fill;
  const fabric = THEMES.rendered!.materialTints!.fabric;

  it("`theme rendered` tints the sofa fabric", () => {
    expect(sofaOutlineFill(plan("  theme rendered"))).toBe(fabric);
  });

  it("`theme rendered { furniture … }` replaces the tints with that colour", () => {
    expect(sofaOutlineFill(plan('  theme rendered { furniture: "#123456" }'))).toBe("#123456");
  });

  it("`style furniture { fill … }` replaces them too", () => {
    expect(sofaOutlineFill(plan('  theme rendered\n  style furniture { fill: "#abcdef" }'))).toBe("#abcdef");
  });

  it("a later CompileOptions.theme naming another base drops them; one that leaves the fill keeps them", () => {
    expect(sofaOutlineFill(plan("  theme rendered"), { theme: THEMES.presentation })).toBe(
      THEMES.presentation!.furnitureFill,
    );
    expect(sofaOutlineFill(plan("  theme rendered"), { theme: { wallStroke: "#000000" } })).toBe(fabric);
    expect(sofaOutlineFill(plan(""), { theme: THEMES.rendered })).toBe(fabric);
  });
});

// Kept for the type: a material key outside the vocabulary must not type-check as one.
// @ts-expect-error — "marble" is not a FixtureMaterial.
const _notAMaterial: FixtureMaterial = "marble";
void _notAMaterial;
