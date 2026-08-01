/**
 * `#z=` share-codec lockstep gate — three implementations, one scheme.
 *
 * A playground permalink is `#z=<base64url(deflate-raw(utf8))>`, and THREE separate copies
 * of that codec exist in the repo:
 *
 *   1. `playground/src/share.ts`  — CANONICAL. The playground and the embed page read it.
 *   2. `scripts/gen-permalink.mjs` — the generator that mints the README's permalinks
 *      (Node `zlib`, because a script has no `CompressionStream` on old Node).
 *   3. the inline `playgroundUrl()` in `docs-site/.vitepress/theme/components/ArchLive.vue`
 *      — the docs widget's "Open in playground" button, duplicated so the docs site stays
 *      self-contained.
 *
 * Nothing tied them together: a scheme change in one copy (gzip instead of deflate-raw,
 * standard base64 instead of base64url, a stray `=` pad) would leave the other two minting
 * links the playground silently fails to decode — and the reader just sees an empty editor.
 *
 * WS-D may hoist the codec into one shared module; until then this test IS the weld. The
 * pinned hashes below were produced by `playground/src/share.ts` and must never drift: a
 * changed expectation means the SCHEME changed, which breaks every link ever shared.
 *
 * Deliberate non-law, verified while writing this: copies 1 and 3 use `CompressionStream`
 * (zlib's default level 6) while copy 2 asks for `{ level: 9 }`, so on LARGE sources the
 * three do not emit byte-identical payloads (`examples/museum.arch` differs). The contract
 * is decode-compatibility, so that is what the long-source case asserts; the small pinned
 * fixtures do agree byte-for-byte and are asserted as such.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bytesToB64url, encodeSrc, srcFromHash } from "../playground/src/share.js";

const ARCHLIVE = "docs-site/.vitepress/theme/components/ArchLive.vue";
const GEN_PERMALINK = "scripts/gen-permalink.mjs";
const PLAYGROUND = "https://playground.archlang.uk";

/**
 * Node 18 ships a global `CompressionStream` WITHOUT "deflate-raw" (added in 21.2), and
 * `encodeSrc` correctly falls back to the uncompressed `#src=` form there. CI runs the
 * suite on 18/20/22, so every compressed expectation is gated on the real capability —
 * exactly as `playground/test/share.test.ts` does.
 */
const HAS_DEFLATE_RAW = (() => {
  if (typeof CompressionStream === "undefined") return false;
  try {
    new CompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
})();

/**
 * Pinned scheme fixtures. `z` is the compressed payload `share.ts` emits for `source`;
 * `raw` is the legacy uncompressed payload (base64url of the UTF-8 bytes) it falls back to.
 * Both were produced BY `playground/src/share.ts` — regenerate them only for a deliberate,
 * link-breaking scheme change, never to green this suite.
 */
const FIXTURES: ReadonlyArray<{ name: string; source: string; z: string; raw: string }> = [
  {
    name: "short ASCII",
    source: 'plan "Shed" {\n  units mm\n  wall (0,0) (4000,0) (4000,3000) (0,3000) close\n}\n',
    z: "K8hJzFNQCs5ITVFSqOZSUCjNyywpVsjN5VJQKE_MyVHQMNAx0FTQMDEwQGIYGxiA2DBGck5-cSpXLRcA",
    raw: "cGxhbiAiU2hlZCIgewogIHVuaXRzIG1tCiAgd2FsbCAoMCwwKSAoNDAwMCwwKSAoNDAwMCwzMDAwKSAoMCwzMDAwKSBjbG9zZQp9Cg",
  },
  {
    name: "unicode content",
    source: 'plan "Ünïcode ✓" {\n  units mm\n  room at (0,0) size 4000x3000 label "客厅 · Salón ✓"\n}\n',
    z: "K8hJzFNQOjwn7_D65PyUVIVHcyYrKVRzKSiU5mWWFCvk5nIpKBTl5-cqJJYoaBjoGGgqFGdWpSqYGBgYVBgbGBgo5CQmpeYoKD1dt-hpX6vCoe0KwYk5hzfngQ3iquUCAA",
    raw: "cGxhbiAiw5xuw69jb2RlIOKckyIgewogIHVuaXRzIG1tCiAgcm9vbSBhdCAoMCwwKSBzaXplIDQwMDB4MzAwMCBsYWJlbCAi5a6i5Y6FIMK3IFNhbMOzbiDinJMiCn0K",
  },
  {
    name: "a multi-line plan",
    source: [
      'plan "Codec Fixture" {',
      "  units mm",
      "  grid 50",
      "  wall (0,0) (6000,0) (6000,4000) (0,4000) close thickness 200",
      '  room id=r_main at (0,0) size 6000x4000 label "Main"',
      "  door on wall_1 at 50% width 900 hinge left",
      "  window on wall_2 at 40% width 1200",
      '  furniture sofa in r_main anchor top-left inset 300 size 2000x900 label "Sofa"',
      "}",
      "",
    ].join("\n"),
    z: "TY_BSgNBEETv8xXFghBBobMmQg6eArl58gPCuDObbTLbHWZm2aD479LGRG91qHr9-pS8oNlqiB12fK5Tjg0-HTAJ14JxdMAhc8CaHDD7lLCgB7rH4pnoX1gRWb6GLmmJqAN3R4mloCWbZ9URHF7yfvQs8PWXVfgjwjBnWyP595jQvHqWxgFBNUPl5_h-aas13WHmUAdsiDCwHCJS7KsZsgSdb_XW6qtbfXnx6KcsbK-iaO_BgquRdINmVD09Gg8sJVY8EV0UW1Pc_Bm-ae8b9-W-AQ",
    raw: "cGxhbiAiQ29kZWMgRml4dHVyZSIgewogIHVuaXRzIG1tCiAgZ3JpZCA1MAogIHdhbGwgKDAsMCkgKDYwMDAsMCkgKDYwMDAsNDAwMCkgKDAsNDAwMCkgY2xvc2UgdGhpY2tuZXNzIDIwMAogIHJvb20gaWQ9cl9tYWluIGF0ICgwLDApIHNpemUgNjAwMHg0MDAwIGxhYmVsICJNYWluIgogIGRvb3Igb24gd2FsbF8xIGF0IDUwJSB3aWR0aCA5MDAgaGluZ2UgbGVmdAogIHdpbmRvdyBvbiB3YWxsXzIgYXQgNDAlIHdpZHRoIDEyMDAKICBmdXJuaXR1cmUgc29mYSBpbiByX21haW4gYW5jaG9yIHRvcC1sZWZ0IGluc2V0IDMwMCBzaXplIDIwMDB4OTAwIGxhYmVsICJTb2ZhIgp9Cg",
  },
];

/** The payload `share.ts` produces on THIS Node — compressed when it can, legacy otherwise. */
const expectedHash = (f: (typeof FIXTURES)[number]): string => (HAS_DEFLATE_RAW ? `#z=${f.z}` : `#src=${f.raw}`);

const tmp = mkdtempSync(join(tmpdir(), "arch-share-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Run `scripts/gen-permalink.mjs` on `source` and return the URL it prints. */
function genPermalink(source: string, file = "fixture.arch"): { url: string; status: number; stderr: string } {
  const path = join(tmp, file);
  writeFileSync(path, source, "utf8");
  const r = spawnSync(process.execPath, [GEN_PERMALINK, path], { encoding: "utf8" });
  return { url: (r.stdout ?? "").trim(), status: r.status ?? -1, stderr: r.stderr ?? "" };
}

/**
 * The docs widget's inline codec, lifted out of the .vue and run for real.
 *
 * The body is extracted by content anchor (`async function playgroundUrl`) and evaluated
 * with `source` injected as the ref it closes over, so this is a BEHAVIOURAL comparison:
 * any edit that changes what the button links to goes red, while reformatting it does not.
 */
function archLiveCodec(): (src: string) => Promise<string> {
  const vue = readFileSync(ARCHLIVE, "utf8");
  const start = vue.indexOf("async function playgroundUrl");
  expect(
    start,
    `${ARCHLIVE} no longer defines \`async function playgroundUrl\` — that function IS the docs ` +
      `site's copy of the \`#z=\` share codec and this gate's anchor.`,
  ).toBeGreaterThan(-1);
  const open = vue.indexOf("{", vue.indexOf(")", start));
  const end = vue.indexOf("\n}", open);
  expect(end, `${ARCHLIVE}: \`playgroundUrl\` is unterminated.`).toBeGreaterThan(open);
  const body = vue.slice(open + 1, end);
  expect(body, `${ARCHLIVE}'s \`playgroundUrl\` no longer speaks the \`#z=\` scheme.`).toContain("#z=");
  // Only the (typed) signature is TypeScript; the body is plain JS, so it evaluates as-is.
  const run = new Function("source", `return (async () => {${body}})();`) as (s: { value: string }) => Promise<string>;
  return (src: string) => run({ value: src });
}

describe("the #z= share scheme is pinned (playground/src/share.ts is canonical)", () => {
  it.each(FIXTURES)("$name encodes to its pinned hash", async (f) => {
    expect(
      await encodeSrc(f.source),
      `playground/src/share.ts changed what it emits for a pinned fixture. The \`#z=\` payload is a ` +
        `PUBLIC, permanent format: every permalink ever shared (incl. README.md's) decodes through it. ` +
        `Only update these fixtures for a deliberate scheme change.`,
    ).toBe(expectedHash(f));
  });

  it.each(FIXTURES)("$name round-trips back to the exact source", async (f) => {
    expect(await srcFromHash(`#z=${f.z}`)).toBe(f.source);
    expect(await srcFromHash(`#src=${f.raw}`)).toBe(f.source);
  });

  it("payloads stay URL-safe (base64url, no padding)", () => {
    for (const f of FIXTURES) {
      expect(f.z).not.toMatch(/[+/=]/);
      expect(f.raw).not.toMatch(/[+/=]/);
      expect(bytesToB64url(new TextEncoder().encode(f.source))).toBe(f.raw);
    }
  });
});

describe(`${GEN_PERMALINK} mints hashes in the canonical scheme`, () => {
  it("prints a playground URL carrying a #z= hash", () => {
    const { url, status } = genPermalink(FIXTURES[0]!.source);
    expect(status).toBe(0);
    expect(url.startsWith(`${PLAYGROUND}/#z=`)).toBe(true);
  });

  it("exits 2 with a usage line when given no file", () => {
    const r = spawnSync(process.execPath, [GEN_PERMALINK], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  it.each(FIXTURES)("$name gets the same payload as share.ts", (f) => {
    const { url } = genPermalink(f.source);
    expect(
      url.slice(`${PLAYGROUND}/#`.length),
      `${GEN_PERMALINK} and playground/src/share.ts disagree on the \`#z=\` payload for a pinned ` +
        `fixture. The generator mints the README's permalinks and the playground decodes them, so ` +
        `the two must speak one scheme — fix whichever copy moved.`,
    ).toBe(`z=${f.z}`);
  });

  it("a long real example round-trips through the playground's own decoder", async () => {
    // Not a byte-equality case ON PURPOSE: the generator asks zlib for level 9 while
    // `CompressionStream` uses the default level 6, so large sources compress to different
    // (equally valid) payloads. Decode-compatibility is the contract.
    const source = readFileSync("examples/studio.arch", "utf8");
    const { url } = genPermalink(source, "studio.arch");
    const hash = url.slice(url.indexOf("#"));
    expect(await srcFromHash(hash)).toBe(source);
  });
});

describe(`${ARCHLIVE}'s inline codec matches the canonical one`, () => {
  const encode = archLiveCodec();

  it.each(FIXTURES)("$name links to the same hash share.ts would produce", async (f) => {
    expect(
      await encode(f.source),
      `The docs widget's inline \`playgroundUrl()\` no longer agrees with playground/src/share.ts. ` +
        `Its "Open in playground" button would mint a link the playground cannot read. Re-sync the ` +
        `copy in ${ARCHLIVE} (WS-D may replace both with one shared module).`,
    ).toBe(`${PLAYGROUND}/${expectedHash(f)}`);
  });

  it("a long real example agrees with the playground's decoder", async () => {
    const source = readFileSync("examples/studio.arch", "utf8");
    expect(await srcFromHash((await encode(source)).replace(`${PLAYGROUND}/`, ""))).toBe(source);
  });
});
