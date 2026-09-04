/**
 * The byte-identity law for the **vertical datum layer** (v1.35).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon`, `arc`, `roof` and `void` each have one; this is the
 * heights' — and it is the widest of them, because heights touch more of the compiler than
 * any of those did.
 *
 * ## Why it covers all THIRTY examples, and every storey of each
 *
 * The earlier laws pin four hand-picked plans. That was right for `roof`/`void`, which are
 * new elements nothing else could reach. It is not right here. This change adds a required
 * field to `RWall`, appends four to `Opening`, puts a number on every resolved door,
 * window and cased opening, threads a new value through `ResolveExtras` (and therefore
 * through the resolve MEMO's key), and adds a gated block to `describe()` and to Plan JSON.
 * There is no shipped plan it does not touch, so the corpus is every shipped plan.
 *
 * And every STOREY of each, which the other laws do not do: `compile().svg` is the GROUND
 * floor alone — an upper storey reaches a caller through `pages[]` — so a digest taken over
 * `svg` would leave `townhouse`'s levels 2 and 3 unmeasured, on exactly the feature whose
 * elevation rule is per-storey. {@link allStoreysDigestWith} joins every page.
 *
 * ## Where the numbers came from
 *
 * They were measured **before a single line of `src/` changed**, on `f4548db` (the tree
 * `v1.34.0` shipped), by a script that imported these very digest bodies from
 * `test/byte-identity-digest.ts` — never a lookalike. That is the lesson
 * `test/roof-void-byte-identity.test.ts` records: its first attempt measured its baseline
 * with a scratch script whose payload separator differed by one character, and reported
 * four "failures" over artifacts that were in fact byte-identical.
 *
 * The measurement is cross-checked against a law that already existed: `studio`,
 * `gallery-l`, `laneway-house` and `aquarium`'s SEMANTIC digests below are, character for
 * character, the four in `roof-void-byte-identity.test.ts`'s `SEMANTIC_BASELINE`. Two
 * independently-written callers of one shared body agreeing on four values is what says
 * the body is the sanctioned one.
 *
 * ## If one of these moves
 *
 * It is a finding to explain, never a value to re-bless. The claim this file makes is not
 * "the drawings did not change" — it is **"a plan that writes no `height`, `sill` or `head`
 * is untouched in all three of its agent-facing surfaces"**, and every one of these thirty
 * plans writes none. A moved digest means the datum leaked into a plan that never asked
 * for it: the most likely culprits, in order, are `describe()`'s gate
 * (`ResolvedPlan._heightsAuthored`), the `Opening` fields reaching a serialized surface,
 * and the resolve memo's `extrasKey` colliding two storeys.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./byte-identity-digest.js";

/** SHA-256 over every storey's SVG + `describe()` + `lint()`, measured on `f4548db`. */
const BASELINE: [string, string][] = [
  ["accessible", "5602b128c5e8df74a5d3d85b1eb5d1b8778c4dfa03eafd39c62cade55d472d4f"],
  ["aquarium", "fdffa445acbbf0f9c10f30a021cc1ecc26733d9b00d3155e1014caca5a9676b1"],
  ["attached", "c8a219486b2c76c2ba3ecb8649b29ce77a6fd732e03da5e14013a386c6e701b9"],
  ["bungalow", "7dacd03e5c79772836ad273f9542c1272f881df27d8afd0dadef5ef558f8f3b2"],
  ["clinic", "28fd1cb7e889a199d5e014df771848567612f1e0a93a9355524a871961a11b43"],
  ["courtyard-house", "4e487e68dda210d7433cbb9b7f6fcff47d80bbd8156bb4c6bcd4bab8107a7ba2"],
  ["furnished-flat", "6bca2fc18883e3dd6278cc03e0aa7a334ad6c26e67563c578344a77731a0ec05"],
  ["gallery-l", "f9c63bb070331c349628fa8a58c6dd1f16fadbede3b7f07b287f560f7a81c840"],
  ["garden-house", "2d9d6637b6d52802d9c03b09ddd33feaa35c565edf95f8d65e31a8ad15db7677"],
  ["garden-loft", "0273b238de6d7c0ad84f3d517febcec01338ebe9033fcfb9cbe06c8307389350"],
  ["hexagon-pavilion", "1b2ad44c3346bdc4fc6d11c322d0fa7b075cb8fc17d87345f27046415255a32f"],
  ["hillside-villa", "1dc54bab9264586e27ef73e3b6e9121a2b05ebab3c219f47128e34f0115c02b5"],
  ["imports", "65f847d3309cfb25274bf45d07b854c703061a666627cdab56984e8ed5b1bab4"],
  ["laneway-house", "401f5a9e255e5748a2eda400569ad352ae856e1ad5c9f51b62895e30bfd5ad1f"],
  ["library", "c6cc5c95ab3d19aed79ccd37f0102ff42083c7542ce2ad2ed9fbc3507a825b7b"],
  ["materials", "9768adc292f64dc26ce2d11f193191344ecfdf09d271fa884a3caf7afe264e97"],
  ["museum-wing", "fa89497eceb8e2dc56faeb5b5b9ff29f91c5b21db68cc7895307870f5cce1eba"],
  ["museum-wings", "af09b101883586725bb0282948711b5aeb9767fa74d7fb9ea2a760fdf95c0dc7"],
  ["museum", "0b72cfb610d73c4292ca45af47dc73f5adb19b552573d9a306d5c420ba54b7a6"],
  ["one-room", "1a310fb617bfe42e9749d66bddac7b9eb417b843f2525c558f66e6ecb1177b33"],
  ["parametric", "2227a10cba690442987dc6dc9f7aa9af393a613432b6a7ea30d67d93eb736e82"],
  ["relational", "e6e1f0a6fb9589b3a6eaaa6491bd97620567d6fbdb35d162f25720e9da940b07"],
  ["studio", "90951a2517e141dfe28f0e12462fd29cefba5460c900304e435ef53e7f3c0f3f"],
  ["terrace-row", "e05e70108e6b0529a8028cf5dea768357c7c6ca1603c54acfa0630694e002d7a"],
  ["themed", "55e8723dd35cc3ec24b73a7bbf8052bea24f1fdaddd6d90012cffb81d7d00057"],
  ["tiny-house", "a2e03e5262814a5566deb23fedcfe493b053d98ae49026336c75f3cb1ec104b5"],
  ["townhouse", "f3cccd631ffbfa4afbce7bba5cbd71e012fd33a0b28905e4b6d6eeb15c127ddd"],
  ["transit-hall", "2a8e7db037018704eee58b3f3312d8625a57c0a4563ab2a2d3abc1e78245bbfc"],
  ["two-bed", "dec746240dcc800c866a0dc928b451c83caa143f456adc704baa72d724ef6520"],
  ["two-storey", "0cb36d51c57dce8e31c883f5b100a6f6758e51f61f4b40325ca68f3b05e2cdec"],
];

/**
 * The SUMMARY half — `describe()` + `lint()` with the drawing removed.
 *
 * It is blind to the picture, which is what makes it the sharper of the two here: a
 * datum layer has no business moving a drawing, so if this pair ever disagrees — the
 * whole-surface digest moving while this one holds — the change is in the SVG and this
 * file's own claim is what is wrong.
 *
 * The four values shared with `roof-void-byte-identity.test.ts` are the cross-check
 * described in the header.
 */
const SEMANTIC_BASELINE: [string, string][] = [
  ["accessible", "68484c56bb156de1e79654600b428779227547e5a44d46653217b34ab0364c9e"],
  ["aquarium", "45f491a88fa4d1f259d61005220264b0d217e245f482786c842300aa92e1cc6e"],
  ["attached", "ccfcf88d1703b8793fe062dffe347511426f45ed1ece2152f1ecb78ccf15e17f"],
  ["bungalow", "242307d21b82d129acb6317df03702d2044f0c8e05f9a78374c9de9a9f01f4fd"],
  ["clinic", "68f5145df6c36c66cd8d5411f79df440a3f31c97af6d6b98d1ca194a92d67c6d"],
  ["courtyard-house", "c25fbe81bcf795157ed5367f2b27edd34376ebc8f3714beeb21c1d279c265692"],
  ["furnished-flat", "9ec505138f1d6d817a55e45aef46c0145639f68d577cacf7214dc2b06cfb0dc9"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["garden-house", "320b6d0aa637b941ccfd7705df4cd77ef76e8994e3ec07e04ecbb595014a2174"],
  ["garden-loft", "fcfd3d6eff4014d553670aa6fbbbffb0cc07e42b8ac9a9664f374a3a6f75a20e"],
  ["hexagon-pavilion", "da4ae66c401e5ce77b0a35a9cb4d75ae3af19a31d49be76608923454584ffbdf"],
  ["hillside-villa", "8c370e19d3ea495689e0059b5b60823feeb179c3d1b02df9900be1f61879f635"],
  ["imports", "25899f6f578488bbdfe9929a743ff2b64f85ba1e318f06b542865b5d7d4d8136"],
  ["laneway-house", "bde186c2290e5aa19ea60c3ec9e8ad7cfa3f5237e7d2a0a80cdca393fa3ab85a"],
  ["library", "e1daef38bb73cd65cd723bf45d52f407a3a0412759cf34dd37cc6cb0d5503d39"],
  ["materials", "648012dc07c11a37974ff86dd38f5bcf65da3d6acf00b88cfd7c6beeef4c9459"],
  ["museum-wing", "38e455e3ebe53d0d71344ace3e82aae2ad837014319fbac114e997fe202a9943"],
  ["museum-wings", "80926b17ced4ee7f7e138ed7307a9205958088a99cf086c8e87f9686c2dd21b0"],
  ["museum", "8d1e029b936bcbbbfb2007a1fb8b0ea681d2b54e563f3c916093955944258fa3"],
  ["one-room", "f0649bfd821eff989cc1beed233ad722eb4f2d3c3284ac4a8f74d5ea07ef306f"],
  ["parametric", "b6249826e5bf7896b601daaa354fb8cdd2e2cf65785778a0267869c530d3e03e"],
  ["relational", "1011260beda141af5f99716609f12d5a9a6be8a81466ed14760e6924025c0ad4"],
  ["studio", "7ed53b6e0925e21fe4c4fad7351ce7e80635818395fc79cf661ba095db8129b3"],
  ["terrace-row", "d7ab0659605d4b76c4388c63a7255e26c0f85ed072ede197f29dd8e194f01cc4"],
  ["themed", "3644012b9d972af8e0314ce0a210073cc0315127d38a5f6b35220b00c883aff8"],
  ["tiny-house", "89f05cd969e28765d7c775022eed2a746c786e182b276f1ba5e8cd6f691c589c"],
  ["townhouse", "a3a867c4803762ba8debd5fe4a72a34914ea3bcaaffa3fca129fedbfa9c0a6aa"],
  ["transit-hall", "96513787744653538698e672aee582972d517c2787b446312c4dd8c6b0d084a7"],
  ["two-bed", "c8e5a430665c6ea875a94225dc062a534bebf776c28b3ffbdb0a614d3e71ff79"],
  ["two-storey", "494341efa9edaa35f76d17b293023a87b9b1e68567d87b2e4445ebf9b6579f93"],
];

const API: CompilerApi = { compile, describe: describePlan, lint };
const EXAMPLES = resolvePath("examples");

/** A World that reads the examples directory, so the two plans that `import` are covered
 *  by the law rather than quietly skipped — a gate is only as strong as its corpus. */
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

const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");
const worldOfExamples = worldFor(EXAMPLES);

suite("height byte-identity — a plan that writes no height is unchanged everywhere", () => {
  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on v1.34.0 — every storey`, () => {
      expect(allStoreysDigestWith(API, srcOf(name), { world: worldOfExamples })).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`${name}.arch's SUMMARY (describe + lint, no drawing) is unchanged`, () => {
      expect(semanticDigestWith(API, srcOf(name), { world: worldOfExamples })).toBe(sha);
    });
  }

  it("covers every shipped example — the corpus cannot silently shrink", () => {
    const shipped = readdirSync(EXAMPLES)
      .filter((f) => f.endsWith(".arch"))
      .map((f) => f.replace(/\.arch$/, ""))
      .sort();
    expect(BASELINE.map(([n]) => n).sort()).toEqual(shipped);
    expect(SEMANTIC_BASELINE.map(([n]) => n).sort()).toEqual(shipped);
  });

  it("and every one of them really does write no height clause", () => {
    // The law is vacuous for any plan that DOES use the new syntax, so the premise is
    // asserted rather than assumed. A word-boundary scan, not a substring one: `height`
    // appears inside `strip … height <mm>` (a plan extent, not a vertical) in several of
    // these, so the check is that no plan uses the three VERTICAL spellings — the plan
    // setting, the `level`/`wall` clause and the two opening clauses.
    const offenders = BASELINE.map(([n]) => n).filter((n) => {
      const src = srcOf(n);
      return (
        /^\s*height\s/m.test(src) || // the plan-level setting
        /\bthickness\s+\S+\s+height\b/.test(src) || // a wall clause
        /\blevel\s+-?\d+(\s+"[^"]*")?\s+height\b/.test(src) || // a level clause
        /\b(sill|head)\s+\d/.test(src)
      );
    });
    expect(offenders, "these shipped examples use the height syntax, so the law is vacuous for them").toEqual([]);
  });
});

/** The other half of the claim: the datum is really THERE, it just is not reported. */
suite("height byte-identity — the datum exists even when the summary hides it", () => {
  it("every wall of a silent plan resolved to the 3000 default", async () => {
    const { resolve: resolvePlan } = await import("../src/ir.js");
    const { parse } = await import("../src/parser.js");
    const { ir } = resolvePlan(parse(srcOf("studio")).plan!);
    expect(ir.storeyHeight).toBe(3000);
    expect(ir.elevation).toBe(0);
    expect(ir._heightsAuthored).toBe(false);
    expect(ir.walls.map((w) => w.height)).toEqual(ir.walls.map(() => 3000));
    // …and none of it reaches the summary, which is the whole point.
    expect(describePlan(srcOf("studio")).heights).toBeUndefined();
  });
});
