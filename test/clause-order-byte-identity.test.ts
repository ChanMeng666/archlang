/**
 * Order-free trailing clauses (`src/clause-order.ts`): the byte-identity law, the reordered forms,
 * the duplicate diagnostic `E_DUP_CLAUSE`, and a permutation property over the examples.
 *
 * ## The law
 *
 * A plan that parsed before parses to the same tree, so it draws, describes, lints and diagnoses
 * exactly as before. Each row is two digests (`test/helpers/clause-order-law.ts`): every storey's
 * SVG + `describe()` + `lint()` + `compile().diagnostics`, and the parse itself (the `PlanNode` as
 * JSON, key order included, which `arch ast --json` prints, plus the parse diagnostics). Both were
 * **measured on `main` at `3ca9556b`, before the first `src/` edit of this change**, by those helper
 * bodies (a scratch script imported them, as this test does). A deliberate off-by-one in the
 * `rotate` insertion point moved 36 of these 42 rows, so the law can fail. This file pins the
 * examples only; plans elsewhere in the repository are pinned by their own laws.
 *
 * Why the rows hold: a clause the old grammar would have read at its token is read exactly as
 * before, with no new condition, and any other clause is read only where its word could not begin
 * the next statement (no statement keyword, no `=` or `(` after it; `wall` by a lookahead for a
 * `wall` statement's `thickness` or `id=`). Every node is laid out after its clauses are read, in
 * the old order, so even its key order is unchanged. A moved row is a finding to explain, never a
 * re-pin.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { ID_AFTER_KIND_STATEMENTS, ORDER_FREE_STATEMENTS } from "../src/clause-order.js";
import { compile, describe, lint } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { makeNodeWorld } from "../src/cli/io.js";
import type { World } from "../src/world.js";
import {
  archFilesUnder,
  astDigest,
  type ClauseLawApi,
  PERMUTED,
  type PermuteApi,
  permuted,
  surfaceDigest,
} from "./helpers/clause-order-law.js";

/** The fewest statements of each kind one permutation must move over the examples (measured:
 *  furniture 290, room 237, door 206, window 126, opening 17, outdoor 13), so the property cannot
 *  pass by finding nothing to permute. */
const PERMUTE_FLOORS: Record<string, number> = {
  furniture: 250,
  room: 200,
  door: 180,
  window: 100,
  opening: 15,
  outdoor: 10,
};

const ROOT = resolvePath(".");
const API: ClauseLawApi = {
  compile,
  describe,
  lint,
  parse: (src) => parse(src),
  worldAt: (dir) => makeNodeWorld(dir),
};

/** `[surface digest, parse digest, file]`, measured on `main` at `3ca9556b` (see the header). */
const BASELINE: [string, string, string][] = [
  [
    "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c",
    "dc7eee7fa846731b57e8be34bb4e0208ca2c1bbd594aad91fbd045b9ad6c01a6",
    "examples/accessible.arch",
  ],
  [
    "e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521",
    "295d276e58e73e06965138c13e787c33e01f4941de5b9b86a80cf21e39773ae7",
    "examples/aquarium.arch",
  ],
  [
    "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc",
    "d336cda91acc4449950dea987c79949b1283e67912aa6187448ee5c4c2275197",
    "examples/attached.arch",
  ],
  [
    "cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283",
    "37e4e7f995fba8c2b54e1761670ed57e081e7b8c71d3160e986464eb067d1c5f",
    "examples/bungalow.arch",
  ],
  [
    "809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6",
    "3418a51e7e362baa5e3c4db04201d2b58e5d16f47620bd4bcb16c2b0a87cf1d2",
    "examples/classroom-block.arch",
  ],
  [
    "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5",
    "c23e64a1e7cfcb3a4c83184fb3585b731dff2faa82e3b05af29c1d3881c82de3",
    "examples/clinic.arch",
  ],
  [
    "a6d2075bd43f6d46984d64a2ae8edd6e6c96f25ea4fae91f2984ad7bdd4a5b1f",
    "492b9b4b92658c91fa125ff4fb3d732c366eaf70d18d16417af3728cd8f9d201",
    "examples/corner-cafe.arch",
  ],
  [
    "50c9cc316efda2bf16183e877d4be16443df160c9c13fc2a0210d62945c4bd67",
    "d98a3db2d6b2b029300bc50a06e667e5d27b9b6184d0278ba9e88044cd186b83",
    "examples/courtyard-family.arch",
  ],
  [
    "e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce",
    "25a92395c7fa23a45a061ddd8a518ed4b75da1ed9f7efe943a7ca2e2d6b3a7e4",
    "examples/courtyard-house.arch",
  ],
  [
    "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a",
    "0242baf0a82d59d6310bccacff80d71952e5e751bae6ce0edd53eb77e8589c4b",
    "examples/furnished-flat.arch",
  ],
  [
    "0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2",
    "1f836a0a72557fb27fa676de33f2f610135ed17801c8aeea864cccc02dac834b",
    "examples/gallery-l.arch",
  ],
  [
    "55ad2593f768d91a282b6cde6e8a06f6ee5dbd5701fe1858aa8905431432767a",
    "c7dbe7c1132bb9291414972d245f55d5643bf8791d9b7eaf336827b43777ee49",
    "examples/garden-house.arch",
  ],
  [
    "f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0",
    "0b5dc494c902deae80b99ee963db3a559500c513971ebcd09f84568e0abf0e0e",
    "examples/garden-loft.arch",
  ],
  [
    "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8",
    "5358bb59844ac0ec76855f3df547cac866652423aa970318c98530551f0efb96",
    "examples/hexagon-pavilion.arch",
  ],
  [
    "36397208c3c6ea06f9bbc3efba156b33de2189455086852e290890f3c8784884",
    "db3a5d1e8d2cb7dc1728521dda5b403208ae09e7c80227a8a63c4deccdf725b8",
    "examples/hillside-villa.arch",
  ],
  [
    "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252",
    "2196fd3fe6635f6fe7d9fcbf3267bafd40db2489f65682ef508e9e10af982ed4",
    "examples/imports.arch",
  ],
  [
    "f4f0ed59cff4dd7b970fe069579044226fcb0e4f68f24a85845e648875ed17e5",
    "861d0bfad44daeb5aca964024702d0c5ecdb6e0de3c9ded952fa4ddb8f9e7704",
    "examples/knob-flat.arch",
  ],
  [
    "21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e",
    "d282238093b245e45aaa9532ec851a819efef14a1bc4bb16021c6c6cf65d04d3",
    "examples/laneway-house.arch",
  ],
  [
    "f57eaea084d2e6e62b85b8450ef96675e9f1466bea9aff24e2869f2d6f0c9804",
    "a5dba0f9a73e1af91a7d37d88bc1160d847ae0df2ff65c3824e233844a01df4b",
    "examples/lib/doors.arch",
  ],
  [
    "57d6c78e2eea8451a9b32a5828f3babb24b0251cc5c3b72675b431be22b3f310",
    "90da75f7516d05b2e9293192ca2d0844257df77cb2f174a634cc52e951493a56",
    "examples/lib/fixtures.arch",
  ],
  [
    "adf16d60e17d76d76f092f95fb24dab4b7ba5ebaa977ed32bcc3a8eaddc7e05b",
    "cbcf2f65be04d1d7e3b7abbfbcbad33bb0c64f4dc0d0126a5303c468f4d564ee",
    "examples/lib/furniture.arch",
  ],
  [
    "9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92",
    "2656d94df54442b0936f0506bd4764479a09beebbc51eb8a681877b6aa05a4a0",
    "examples/library.arch",
  ],
  [
    "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925",
    "b5bbeb04654ba6c882d13379eedf22a33d314ba2455909da3b840a93a787ceb9",
    "examples/materials.arch",
  ],
  [
    "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126",
    "581493cdcfee7476e66c720831b2606d0361cab972c16bde90bf2eda4d00cbe8",
    "examples/museum-wing.arch",
  ],
  [
    "1149f0993df1cd719dcffd1d8c5c43c4ea6176c9a43b47954b23b3950bcc6f4a",
    "5138c8eb05d19204ef65fa34ac995bd1e465d387b82a5bb77c9023a383fd5cd8",
    "examples/museum-wings.arch",
  ],
  [
    "3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4",
    "939b54bdc5befd94cca913bd37bfd2e8114b3b9a8d540296c06006cfe7b1c7f1",
    "examples/museum.arch",
  ],
  [
    "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120",
    "b4c2ad1db6b2f1dc99f8334cb8daddcc5a31cb3ca2452364b96a8b32ed8c6692",
    "examples/one-room.arch",
  ],
  [
    "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef",
    "1cb3caeffb5c87343c033a9e53ac46efd5a890c672b634fca9eacf4cedde5b60",
    "examples/parametric.arch",
  ],
  [
    "f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4",
    "7166b9fa609e198e936988b8d61fb098d5df8b69d4de68b4137af0295ae5b869",
    "examples/practice-office.arch",
  ],
  [
    "d99a898c06b322f203c7f9f3d34740be351b523712bb04fe7b0d846e85811084",
    "7e457015a044240cc328795c2f5ec96ba5fe77542d56dd38ef61224f52536a54",
    "examples/relational.arch",
  ],
  [
    "f0f4a5aa4758c3f9feb14449b6a9be0b7afd020fb925619c6d83e66f7cb95f2d",
    "32255022b18313851a2704790420742b9e587e2b2b9483884d621b57b9ef9921",
    "examples/remodel.arch",
  ],
  [
    "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798",
    "bc6256ca802a3ea17c2a1cb2b0f1e4f7b4bca01bb571cc5147831d7b4021448c",
    "examples/sheet-notes.arch",
  ],
  [
    "54adc1b89e5472644f55bc3f33f9aa6fd1576b39b324eb6afd8370d8e3cb796f",
    "03e2e2c2bab12a715ee987c378bb802f56e0aa03da9d1112e6a3244e041de0f5",
    "examples/showcase/garden-courtyard.arch",
  ],
  [
    "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553",
    "b148bf3fdd24b2c6be8e9035576005dcb5878e73cecbb7d884d8efc48e215859",
    "examples/studio.arch",
  ],
  [
    "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d",
    "3d73f2d0badd83e6b426bcd008e1fb6d73262934944765e578fbea5ddb4c72e5",
    "examples/terrace-row.arch",
  ],
  [
    "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf",
    "2f0d2f5cfc6554329a83ecb771ca74b3f5003b8e2a740a90afcd45acbe2a4ccb",
    "examples/themed.arch",
  ],
  [
    "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17",
    "f9d5547a931d3a9bb9dc4d00180cb1c71bd82c498e75415d4bcf11eb92d266de",
    "examples/tiny-house.arch",
  ],
  [
    "4ebf99f3ba158cc7652424c413c94f9f837f6afd24546d8bbac0f080bb281652",
    "355d36bd5d1cf39a9694d70ffba4532ec12f63cd25ae9132c5f4198ca071bd3a",
    "examples/townhouse.arch",
  ],
  [
    "a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5",
    "1d864acd2807f9551f1fea419578ebeadb11971a6865b5916d8e3ed75d8a0d7a",
    "examples/transit-hall.arch",
  ],
  [
    "a60a7362582085a80c577e970a5139fc01d12ec4600af7ad8f4ed8a4ede897aa",
    "9846048edccb900827a20a6de7d258f356688609aa11a1272d338b92c863eac8",
    "examples/turning-stair.arch",
  ],
  [
    "fe871cbb3d60c1594495e38b1ad0dc30ce3f71904c27b85fa60f276d3aa182bd",
    "a1f390c9f0acc2156992a615fbcba5d82d2abaaf561bb6aa949534ac5a2ea81d",
    "examples/two-bed.arch",
  ],
  [
    "9bad4f64cdc450219b6adac2c6de7a4790d0b48917ef88358b9c54c78b57a90f",
    "a2400915472bf50c8146ee82ad9e09b2cf4d64e2887565c5b33975f90c8abc4b",
    "examples/two-storey.arch",
  ],
];

suite("clause order: the byte-identity law", () => {
  it("has one row for every .arch under examples/", () => {
    expect(BASELINE.map((r) => r[2])).toEqual(archFilesUnder(ROOT, "examples"));
  });
  for (const [surface, ast, file] of BASELINE) {
    it(`${file} parses, draws, describes and lints as before`, () => {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(astDigest(API, src)).toBe(ast);
      expect(surfaceDigest(API, src, join(ROOT, file))).toBe(surface);
    });
  }
});

/** One bedroom with walls, and `body` on the lines after it. */
const plan = (body: string): string =>
  `plan "p" {\n  walls from rooms exterior 200 partition 100\n  room id=bed at (0,0) size 4000x4000 label "Bed"\n  ${body}\n}\n`;
const parseErrors = (src: string): string[] =>
  parse(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
const summary = (src: string): string => JSON.stringify(describe(src));
const lintCodes = (src: string): (string | undefined)[] => lint(src).map((d) => d.code);

/** `[the old order, the same statement in other orders]`. */
const REORDERED: [string, string[]][] = [
  [
    'furniture bed at (500,500) size 1500x2000 label "Bed" rotate 90 clear front 600 in bed',
    [
      'furniture bed at (500,500) size 1500x2000 rotate 90 label "Bed" clear front 600 in bed',
      'furniture bed at (500,500) label "Bed" size 1500x2000 rotate 90 clear front 600 in bed',
      'furniture bed at (500,500) size 1500x2000 clear front 600 label "Bed" rotate 90 in bed',
      'furniture bed at (500,500) in bed clear front 600 rotate 90 label "Bed" size 1500x2000',
    ],
  ],
  [
    "furniture bed in bed centered size 1500x2000 rotate 90",
    ["furniture bed in bed centered rotate 90 size 1500x2000"],
  ],
  ["furniture id=b1 bed at (500,500) size 1500x2000", ["furniture bed id=b1 at (500,500) size 1500x2000"]],
  [
    'furniture sofa at (500,500) size 2000x900 label "Sofa" rotate 90 mirror',
    ['furniture sofa at (500,500) mirror label "Sofa" size 2000x900 rotate 90'],
  ],
  [
    'room id=k at (4000,0) size 3000x4000 label "Kitchen" uses kitchen floor tile',
    [
      'room id=k at (4000,0) floor tile label "Kitchen" uses kitchen size 3000x4000',
      'room id=k at (4000,0) uses kitchen size 3000x4000 floor tile label "Kitchen"',
    ],
  ],
  ['room id=k right-of bed gap 0 size 3000x4000 label "K"', ['room id=k right-of bed gap 0 label "K" size 3000x4000']],
  [
    "door on bed.right at 50% width 900 hinge left swing inward head 2100",
    ["door on bed.right at 50% swing inward hinge left head 2100 width 900"],
  ],
  [
    "door id=d1 sliding on bed.bottom at 50% width 1600 slide left",
    ["door sliding id=d1 on bed.bottom at 50% slide left width 1600"],
  ],
  ["door pocket on bed.left at 50% width 800 open 0.5", ["door pocket on bed.left at 50% open 0.5 width 800"]],
  [
    "window id=w1 casement on bed.top at 50% width 1200 hinge left sill 900 head 2100",
    ["window casement id=w1 on bed.top at 50% head 2100 sill 900 hinge left width 1200"],
  ],
  ["window at (2000,0) width 1200 wall exterior sill 900", ["window at (2000,0) sill 900 wall exterior width 1200"]],
  ["opening on bed.top at 25% width 900 head 2100", ["opening on bed.top at 25% head 2100 width 900"]],
  [
    'outdoor id=d1 deck at (0,4200) size 4000x2000 label "Deck"',
    ['outdoor deck id=d1 at (0,4200) label "Deck" size 4000x2000'],
  ],
  [
    'outdoor balcony at (0,-1500) size 4000x1500 label "Balcony" rail top',
    ['outdoor balcony at (0,-1500) rail top size 4000x1500 label "Balcony"'],
  ],
  [
    'strip right at (0,6000) gap 0 height 3000 { room id=s1 size 3000 label "A" uses living floor tile }',
    ['strip right at (0,6000) gap 0 height 3000 { room id=s1 floor tile uses living label "A" size 3000 }'],
  ],
  [
    "wall id=w9 exterior thickness 200 { (0,7000) (4000,7000) }",
    ["wall exterior id=w9 thickness 200 { (0,7000) (4000,7000) }"],
  ],
];

suite("clause order: the list the spec reads", () => {
  it("ORDER_FREE_STATEMENTS is exactly the statements that call readClauses in src/", () => {
    const called = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts"))
          for (const m of readFileSync(p, "utf8").matchAll(/readClauses\(\s*(?:this\.)?ctx,\s*"(\w+)"/g))
            called.add(m[1]!);
      }
    };
    walk(join(ROOT, "src"));
    expect([...called].sort()).toEqual([...ORDER_FREE_STATEMENTS].sort());
    // Every listed statement has a reordered form pinned below.
    for (const k of ORDER_FREE_STATEMENTS)
      expect(REORDERED.some(([, others]) => others.some((o) => o.includes(k)))).toBe(true);
  });

  it("ID_AFTER_KIND_STATEMENTS is exactly the statements that call idAfterKind, and rule 6 names them", () => {
    const called = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts"))
          for (const m of readFileSync(p, "utf8").matchAll(/idAfterKind\(\s*ctx,\s*"(\w+)"/g)) called.add(m[1]!);
      }
    };
    walk(join(ROOT, "src"));
    expect([...called].sort()).toEqual([...ID_AFTER_KIND_STATEMENTS].sort());
    const rule6 = readFileSync(join(ROOT, "spec.llm.md"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("6. "))!;
    for (const k of ID_AFTER_KIND_STATEMENTS) expect(rule6).toContain(`\`${k}\``);
    // And each one reads it there, cleanly.
    const forms: Record<(typeof ID_AFTER_KIND_STATEMENTS)[number], string> = {
      furniture: "furniture bed id=b1 at (500,500) size 1500x2000",
      door: "door pocket id=d1 on bed.left at 50% width 800",
      window: "window casement id=w1 on bed.top at 50% width 1200",
      outdoor: "outdoor deck id=o1 at (0,4200) size 4000x2000",
      wall: "wall exterior id=v1 thickness 200 { (0,7000) (4000,7000) }",
    };
    for (const k of ID_AFTER_KIND_STATEMENTS) {
      expect(parseErrors(plan(forms[k])), k).toEqual([]);
      const node = parse(plan(forms[k])).plan!.body.find((s) => s.kind === k);
      expect(node?.id, k).toMatch(/^[a-z]1$/);
    }
  });
});

suite("clause order: the reordered forms", () => {
  for (const [old, others] of REORDERED) {
    it(`reads the old order cleanly: ${old}`, () => {
      expect(parseErrors(plan(old))).toEqual([]);
    });
    for (const other of others) {
      it(`${other} is ${old}`, () => {
        const src = plan(other);
        expect(parseErrors(src)).toEqual([]);
        expect(summary(src)).toBe(summary(plan(old)));
        expect(lintCodes(src)).toEqual(lintCodes(plan(old)));
      });
    }
  }

  it("records a door's `slide` insertion point after the clauses that came before `slide`", () => {
    const door = (body: string) => {
      const src = plan(body);
      const node = parse(src).plan!.body.find((s) => s.kind === "door") as { slideSpan?: { start: number } };
      return src.slice(0, node.slideSpan!.start);
    };
    expect(door("door pocket on bed.left at 50% open 0.5 width 800").endsWith("width 800")).toBe(true);
    expect(door("door pocket on bed.left at 50% width 800 open 0.5").endsWith("width 800")).toBe(true);
  });

  it("records a furniture's `rotate` insertion point after its placement, `size` and `label`", () => {
    const at = (body: string) => {
      const src = plan(body);
      const node = parse(src).plan!.body.find((s) => s.kind === "furniture") as { rotateSpan?: { start: number } };
      return src.slice(0, node.rotateSpan!.start);
    };
    expect(at('furniture bed at (500,500) size 1500x2000 label "Bed" in bed').endsWith('"Bed"')).toBe(true);
    expect(
      at('furniture bed at (500,500) in bed label "Bed" clear front 600 size 1500x2000').endsWith("1500x2000"),
    ).toBe(true);
  });
});

/** `[statement, the duplicate clause's text, the first one's text]`: the duplicate is the LAST occurrence. */
const DUPLICATES: [string, string, string][] = [
  ['furniture bed at (500,500) size 1500x2000 label "Bed" size 1600x2000', "size 1600x2000", "size 1500x2000"],
  ["furniture bed at (500,500) size 1500x2000 rotate 90 clear front 600 rotate 180", "rotate 180", "rotate 90"],
  ['furniture sofa at (500,500) size 2000x900 mirror label "S" mirror', "mirror", "mirror"],
  ["furniture id=b0 bed id=b1 at (500,500) size 1500x2000", "id=b1", "id=b0"],
  ["furniture bed in bed centered size 1500x2000 in bed", "in bed", "in bed"],
  ['room id=k at (4000,0) size 3000x4000 label "A" uses kitchen label "B"', 'label "B"', 'label "A"'],
  ["room id=k at (4000,0) size 3000x4000 floor tile uses kitchen floor stone", "floor stone", "floor tile"],
  ["room id=k at (4000,0) size 3000x4000 size 3000x5000", "size 3000x5000", "size 3000x4000"],
  ["door on bed.right at 50% width 900 hinge left swing inward hinge right", "hinge right", "hinge left"],
  ["window on bed.top at 50% width 1200 sill 900 head 2100 sill 800", "sill 800", "sill 900"],
  ["opening on bed.top at 25% width 900 width 1000", "width 1000", "width 900"],
  ['outdoor balcony at (0,-1500) size 4000x1500 rail top label "B" rail left', "rail left", "rail top"],
  ['strip right at (0,6000) gap 0 height 3000 { room size 3000 label "A" size 4000 }', "size 4000", "size 3000"],
  ["door at (2000,0) width 900 wall exterior hinge left wall partition", "wall partition", "wall exterior"],
  // A second `id=`, around or after the kind word, on every statement that takes one there.
  ["furniture bed id=p0 id=p1 at (500,500) size 1500x2000", "id=p1", "id=p0"],
  ["door id=d0 pocket id=d1 on bed.left at 50% width 800", "id=d1", "id=d0"],
  ["window id=w0 casement id=w1 on bed.top at 50% width 1200", "id=w1", "id=w0"],
  ["outdoor id=o0 deck id=o1 at (0,4200) size 4000x2000", "id=o1", "id=o0"],
  ["wall id=v0 exterior id=v1 thickness 200 { (0,7000) (4000,7000) }", "id=v1", "id=v0"],
];

suite("clause order: a clause written twice is E_DUP_CLAUSE", () => {
  for (const [stmt, dup, first] of DUPLICATES) {
    it(stmt, () => {
      const src = plan(stmt);
      const out = compile(src);
      const dups = out.diagnostics.filter((d) => d.code === "E_DUP_CLAUSE");
      expect(dups).toHaveLength(1);
      const d = dups[0]!;
      expect(d.severity).toBe("error");
      expect(src.slice(d.span!.start, d.span!.end)).toBe(dup);
      expect(d.span!.start).toBe(src.lastIndexOf(dup));
      const rel = d.relatedSpans![0]!.span;
      expect(src.slice(rel.start, rel.end)).toBe(first);
      expect(rel.start).toBe(src.indexOf(first));
      // Reported, not thrown: the statement still parses, with its first value.
      expect(out.diagnostics.filter((x) => x.code === "E_PARSE")).toEqual([]);
    });
  }

  it("keeps the first value", () => {
    const node = parse(plan(DUPLICATES[0]![0])).plan!.body.find((s) => s.kind === "furniture") as {
      size: { w: { value: number } };
    };
    expect(node.size.w.value).toBe(1500);
  });
});

suite("clause order: a word that begins a statement stays one", () => {
  const kinds = (src: string): string[] => parse(src).plan!.body.map((s) => s.kind);

  it("`size = …` after a furniture line is an assignment, not a second `size`", () => {
    const src = plan('let size = 1\n  furniture bed at (500,500) size 1500x2000 label "B"\n  size = 3');
    expect(kinds(src).slice(-2)).toEqual(["furniture", "assign"]);
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("`rotate(…)` out of the old order is a component call, as it always was", () => {
    const src = plan("furniture bed at (500,500) size 1500x2000 clear front 600\n  rotate(1)");
    expect(kinds(src).slice(-2)).toEqual(["furniture", "instance"]);
    const node = parse(src).plan!.body.find((s) => s.kind === "furniture") as { rotate?: unknown };
    expect(node.rotate).toBeUndefined();
  });

  it("`rotate (90)` in the old order is still the clause", () => {
    const node = parse(plan("furniture bed at (500,500) size 1500x2000 rotate (90)")).plan!.body.find(
      (s) => s.kind === "furniture",
    ) as { rotate?: unknown };
    expect(node.rotate).toBeDefined();
  });

  it("a `wall` statement after an opening placed `at (x,y)` stays a wall", () => {
    const walls = [
      "wall exterior thickness 200 { (0,7000) (4000,7000) }",
      "wall id=w9 exterior thickness 200 { (0,7000) (4000,7000) }",
      // `id=` after the category (card CO-1): `wall <cat> id=` is a wall statement, never a clause.
      "wall exterior id=w9 thickness 200 { (0,7000) (4000,7000) }",
    ];
    const openings: [string, string][] = [
      ["door", "door at (2000,0) width 900 hinge left"],
      ["window", "window at (2000,0) width 1200 sill 900"],
      ["opening", "opening at (2000,0) width 900 head 2100"],
    ];
    for (const [kind, opening] of openings) {
      for (const wall of walls) {
        const src = plan(`${opening}\n  ${wall}`);
        expect(kinds(src).slice(-2), `${opening} / ${wall}`).toEqual([kind, "wall"]);
        expect(parseErrors(src), `${opening} / ${wall}`).toEqual([]);
        const node = parse(src).plan!.body.find((s) => s.kind === kind) as { wall?: string };
        expect(node.wall).toBeUndefined();
      }
    }
  });

  it("a clause word called as a component gets a hint saying why", () => {
    const src = plan("furniture bed at (500,500) size 1500x2000 clear front 600\n  rotate (90)");
    const d = compile(src).diagnostics.find((x) => x.code === "E_UNKNOWN_COMPONENT");
    expect(d?.hints?.[0]).toContain("`rotate` is also a clause word");
    // A name that is no clause word keeps the hint it had (none, with no component to suggest).
    const other = compile(plan("wombat(1)")).diagnostics.find((x) => x.code === "E_UNKNOWN_COMPONENT");
    expect(other?.hints).toBeUndefined();
  });
});

suite("clause order: a clause a statement cannot leave out is refused on that statement", () => {
  /** `[statement, the statement's name in the message]`: each followed by a second, sound statement. */
  const MISSING: [string, string][] = [
    ['room id=a at (4000,0) label "A"', 'Room "a"'],
    ["door id=d on bed.left at 50% hinge left", 'Door "d"'],
    ["window on bed.top at 50% sill 900", "This window"],
    ["opening on bed.top at 25% head 2100", "This opening"],
    ['outdoor deck at (0,4200) label "Deck"', "This outdoor"],
  ];
  for (const [stmt, name] of MISSING) {
    it(stmt, () => {
      const src = plan(`${stmt}\n  room id=c at (0,9000) size 1000x1000`);
      const errs = parse(src).diagnostics.filter((d) => d.code === "E_PARSE");
      expect(errs).toHaveLength(1);
      // Spanned on the statement that lacks the clause, never on the next statement's token.
      expect(src.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toBe(stmt);
      expect(errs[0]!.message.startsWith(name)).toBe(true);
      // And the next statement still parses.
      expect(parse(src).plan!.body.some((s) => s.kind === "room" && s.id === "c")).toBe(true);
    });
  }

  it("a strip room with no size", () => {
    const src = plan('strip right at (0,6000) gap 0 height 3000 { room id=s label "A" }');
    const errs = parse(src).diagnostics.filter((d) => d.code === "E_PARSE");
    expect(errs).toHaveLength(1);
    expect(src.slice(errs[0]!.span!.start, errs[0]!.span!.end)).toBe('room id=s label "A"');
    expect(errs[0]!.message.startsWith('Room "s"')).toBe(true);
  });
});

// —— The permutation property over the examples ——————————————————————————————————————

const PERMUTE_API: PermuteApi = { lex, parse: (src) => parse(src) };
/** Every storey's SVG, then `describe()`: the drawing and the summary a permutation must not move. */
const drawnAndDescribed = (src: string, world: World): string => {
  const out = compile(src, { noCache: true, world });
  const svgs = out.pages ? out.pages.map((p) => p.svg) : [out.svg];
  return [...svgs, JSON.stringify(describe(src, { world }))].join(" ");
};

suite("clause order: permuting the clauses of every statement that reads them in any order, in examples/", () => {
  const ORDERS: [string, (p: string[]) => string[]][] = [
    ["reversed", (p) => [...p].reverse()],
    ["rotated by one", (p) => [...p.slice(1), p[0]!]],
  ];
  for (const file of archFilesUnder(ROOT, "examples")) {
    it(`${file}: every storey's SVG and describe() are unchanged`, () => {
      const src = readFileSync(join(ROOT, file), "utf8");
      const world = makeNodeWorld(dirname(join(ROOT, file)));
      const before = drawnAndDescribed(src, world);
      for (const [name, order] of ORDERS) {
        const p = permuted(PERMUTE_API, src, order);
        if (Object.keys(p.count).length === 0) continue;
        expect(p.src, name).not.toBe(src);
        expect(p.src.length, name).toBe(src.length);
        expect(parseErrors(p.src), name).toEqual([]);
        expect(drawnAndDescribed(p.src, world), name).toBe(before);
      }
    });
  }

  it("moves a real number of statements, of every kind", () => {
    const total: Record<string, number> = {};
    for (const file of archFilesUnder(ROOT, "examples")) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const [k, n] of Object.entries(permuted(PERMUTE_API, src, (p) => [...p].reverse()).count))
        total[k] = (total[k] ?? 0) + n;
    }
    expect(Object.keys(PERMUTED).sort()).toEqual([...ORDER_FREE_STATEMENTS].sort());
    for (const [k, floor] of Object.entries(PERMUTE_FLOORS)) expect(total[k] ?? 0, k).toBeGreaterThanOrEqual(floor);
  });
});
