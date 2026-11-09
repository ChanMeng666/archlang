/**
 * `#z=` share-codec lockstep gate — three encoders, one decoder, one scheme.
 *
 * A playground permalink is `#z=<base64url(deflate-raw(utf8))>`. The browser-safe DECODE side
 * is one module, the core's `@chanmeng666/archlang/share` (`src/share.ts`, re-exporting
 * `src/cli/share-codec.web.mjs`): base64url, the bounded inflaters, the edit flag. The
 * playground page, its short-link Worker, the hosted MCP Worker and the docs widget all import
 * it, so it needs no pin against itself. What is still duplicated, and pinned here:
 *
 *   1. `playground/src/share.ts` `encodeSrc` — CANONICAL encoder (`CompressionStream`). The
 *      playground and the embed page mint with it.
 *   2. `src/cli/share-codec.mjs` — the one Node encoder (`zlib`, because Node 18's
 *      `CompressionStream` has no deflate-raw) and the one sync Node decoder. `scripts/gen-permalink.mjs`
 *      mints the README's permalinks with it, and `archlang link` and the MCP `link` tool hand
 *      it to users (`test/cli-link.test.ts`).
 *   3. the inline `playgroundUrl()` in `docs-site/.vitepress/theme/components/ArchLive.vue`
 *      — the docs widget's "Open in playground" button: its own `CompressionStream` call, with
 *      base64url and the edit flag from the share subpath.
 *
 * Encoders stay one per implementation ON PURPOSE: deflate output is the implementation's (zlib
 * level 9 vs `CompressionStream`'s default), so one shared encoder could not serve Node and the
 * browser alike. A scheme change in one of them (gzip instead of deflate-raw, standard base64
 * instead of base64url, a stray `=` pad) would mint links the playground silently fails to
 * decode, and the reader just sees an empty editor; this test IS the weld.
 *
 * The pinned hashes below were produced by `playground/src/share.ts` and must never drift: a
 * changed expectation means the SCHEME changed, which breaks every link ever shared. When the
 * decode side was hoisted into the share subpath, the base64url copies it replaced were deleted
 * (the playground's pair, the short-link Worker's decode loop, the docs widget's encode loops)
 * and no pinned hash moved: deleting a copy may remove a pin, it never changes one.
 * "Every link still decodes" is asserted over the whole corpus below, through the subpath and
 * through the Node decoder.
 *
 * Deliberate non-law, verified while writing this: copies 1 and 3 use `CompressionStream`
 * (zlib's default level 6) while copy 2 asks for `{ level: 9 }`, so on LARGE sources the
 * three do not emit byte-identical payloads (`examples/museum.arch` differs). The contract
 * is decode-compatibility, so that is what the long-source case asserts; the small pinned
 * fixtures do agree byte-for-byte and are asserted as such.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  b64urlToBytes,
  bytesToB64url,
  encodeSrc,
  hasEditFlag,
  LINK_INFLATE_CAP_BYTES,
  readHash,
  setEditFlag,
  srcFromHash,
} from "../playground/src/share.js";
import { decodePayload } from "../playground/worker/share-core.js";
import { decodePlanHash, encodePlanHash } from "../src/cli/share-codec.mjs";
import {
  decodePlanHashWeb,
  fromBase64Url,
  inflateCapped,
  PLAYGROUND_EDIT_FLAG,
  PlanHashTooLarge,
  SOURCE_CAP_BYTES,
  toBase64Url,
} from "../src/share.js";

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
 * with `source` injected as the ref it closes over, and `toBase64Url`/`PLAYGROUND_EDIT_FLAG`
 * as the share subpath's own exports (what the component imports), so this is a BEHAVIOURAL
 * comparison: any edit that changes what the button links to goes red, while reformatting it
 * does not.
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
  expect(vue, `${ARCHLIVE} no longer imports the share subpath the body calls into.`).toContain(
    'import { PLAYGROUND_EDIT_FLAG, toBase64Url } from "archlang/share";',
  );
  const run = new Function("source", "toBase64Url", "PLAYGROUND_EDIT_FLAG", `return (async () => {${body}})();`) as (
    s: { value: string },
    b64: typeof toBase64Url,
    flag: typeof PLAYGROUND_EDIT_FLAG,
  ) => Promise<string>;
  return (src: string) => run({ value: src }, toBase64Url, PLAYGROUND_EDIT_FLAG);
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
    // The pinned `#z=` payload is deflate-raw data whatever Node runs the test, so
    // decode it via node:zlib unconditionally; `srcFromHash` itself can only speak
    // deflate-raw where the Web stream supports it (Node >= 21.2), so that
    // cross-check is capability-gated. The legacy `#src=` path works everywhere.
    expect(new TextDecoder().decode(inflateRawSync(b64urlToBytes(f.z)))).toBe(f.source);
    if (HAS_DEFLATE_RAW) expect(await srcFromHash(`#z=${f.z}`)).toBe(f.source);
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
    // The generator always mints `#z=` (node:zlib), so prove decode-compatibility
    // via zlib on every Node, and through `srcFromHash` where the Web stream can.
    expect(new TextDecoder().decode(inflateRawSync(b64urlToBytes(hash.slice("#z=".length))))).toBe(source);
    if (HAS_DEFLATE_RAW) expect(await srcFromHash(hash)).toBe(source);
  });
});

describe(`${ARCHLIVE}'s inline codec matches the canonical one`, () => {
  const encode = archLiveCodec();

  it.each(FIXTURES)("$name links to the same hash share.ts would produce, opening the editor", async (f) => {
    // The plan token is share.ts's byte for byte; `&edit` after it opens the playground in edit
    // mode (a code pane's "Open in playground" is a request to change the plan).
    expect(
      await encode(f.source),
      `The docs widget's inline \`playgroundUrl()\` no longer agrees with playground/src/share.ts. ` +
        `Its "Open in playground" button would mint a link the playground cannot read. Re-sync the ` +
        `copy in ${ARCHLIVE} (its deflate step is its own; base64url and the flag are the share subpath's).`,
    ).toBe(`${PLAYGROUND}/${setEditFlag(expectedHash(f), true)}`);
  });

  it("a long real example agrees with the playground's decoder", async () => {
    const source = readFileSync("examples/studio.arch", "utf8");
    const hash = (await encode(source)).replace(`${PLAYGROUND}/`, "");
    // The token still parses with the flag after it, and the flag reads as edit mode.
    expect(await srcFromHash(hash)).toBe(source);
    expect(hasEditFlag(hash)).toBe(true);
  });
});

/** Every top-level example, read from disk rather than listed. */
const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => [f, readFileSync(join("examples", f), "utf8")] as const);

/**
 * Every encoder that mints a `#z=` link, as the payload after `#z=`: the Node one (zlib level 9:
 * `archlang link`, the README generator), the playground's `encodeSrc` and the docs widget's
 * `playgroundUrl()` (both `CompressionStream` at its default level, so a long plan's payload
 * differs from Node's byte for byte; the contract is that every reader gets the same source).
 */
const ENCODERS: ReadonlyArray<readonly [string, (source: string) => Promise<string>]> = [
  ["the Node encoder", async (s) => encodePlanHash(s)],
  ["playground encodeSrc", async (s) => (await encodeSrc(s)).replace(/^#z=/, "")],
  [
    "the docs widget",
    async (s) => {
      const url = await archLiveCodec()(s);
      return url.slice(url.indexOf("#z=") + "#z=".length).replace(/&.*$/, "");
    },
  ],
];

/** `source` read back through every reader the share subpath serves, each as its consumer calls it. */
async function everyReader(payload: string): Promise<Record<string, unknown>> {
  const raw = await inflateCapped(fromBase64Url(payload), SOURCE_CAP_BYTES);
  return {
    "decodePlanHash (Node)": decodePlanHash(payload),
    "decodePlanHashWeb (MCP Worker)": await decodePlanHashWeb(payload, { maxBytes: SOURCE_CAP_BYTES }),
    inflateCapped: typeof raw === "string" ? raw : new TextDecoder().decode(raw),
    "decodePayload (short-link Worker)": await decodePayload(payload),
    "readHash (playground)": await readHash(`#z=${payload}`),
    "srcFromHash + &edit (playground)": await srcFromHash(`#z=${payload}&${PLAYGROUND_EDIT_FLAG}`),
  };
}
const expectedReads = (source: string): Record<string, unknown> => ({
  "decodePlanHash (Node)": source,
  "decodePlanHashWeb (MCP Worker)": source,
  inflateCapped: source,
  "decodePayload (short-link Worker)": source,
  "readHash (playground)": { src: source },
  "srcFromHash + &edit (playground)": source,
});

// Node 18's `CompressionStream` has no "deflate-raw" (it arrived in Node 21.2 and current 20.x), so
// there the browser encoders fall back to `#src=` and the subpath's readers cannot inflate: skipped.
describe.skipIf(!HAS_DEFLATE_RAW)(
  "every example's share link decodes the same through every reader (skipped where the runtime lacks deflate-raw streams)",
  () => {
    it("reads the corpus (the list is not empty)", () => {
      expect(EXAMPLES.length).toBeGreaterThan(30);
    });

    for (const [encoder, encode] of ENCODERS) {
      it.each(EXAMPLES)(`%s, minted by ${encoder}: every reader returns its source`, async (_name, source) => {
        const payload = await encode(source);
        expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(await everyReader(payload)).toEqual(expectedReads(source));
        // The base64url pair round-trips the payload, and agrees with Node's Buffer byte for byte.
        expect(toBase64Url(fromBase64Url(payload))).toBe(payload);
        expect(Buffer.from(fromBase64Url(payload)).equals(Buffer.from(payload, "base64url"))).toBe(true);
      });
    }
  },
);

/**
 * The caps, at the edge, for every reader. A payload that inflates to exactly the cap opens; one
 * byte more is refused, and inflation stops at the cap rather than at the end of the stream.
 *
 * The readers refuse in two shapes (card EH2.5b decides whether to unify them; this pins today's):
 *   - THROWS: `decodePlanHashWeb` (the hosted MCP Worker), a `PlanHashTooLarge`.
 *   - RETURNS A CODE: `inflateCapped` and the short-link Worker's `decodePayload` return
 *     `"source_too_large"`; the playground's `readHash` returns `{ refused: "too_large" }` and
 *     `srcFromHash` returns `null`.
 * The playground page's own cap is `LINK_INFLATE_CAP_BYTES` (1 MiB), not `SOURCE_CAP_BYTES`: a
 * link a reader opens in their own tab costs no host anything, so it is held to its own edge.
 */
describe.skipIf(!HAS_DEFLATE_RAW)("the source caps hold at the byte for every reader", () => {
  /** A valid deflate stream that inflates to `n` spaces (minted by the Node encoder). */
  const spaces = (n: number) => encodePlanHash(" ".repeat(n));
  const atCap = spaces(SOURCE_CAP_BYTES);
  const overCap = spaces(SOURCE_CAP_BYTES + 1);

  it("decodePlanHashWeb (throws): opens at SOURCE_CAP_BYTES, throws PlanHashTooLarge one byte over", async () => {
    expect(await decodePlanHashWeb(atCap, { maxBytes: SOURCE_CAP_BYTES })).toHaveLength(SOURCE_CAP_BYTES);
    await expect(decodePlanHashWeb(overCap, { maxBytes: SOURCE_CAP_BYTES })).rejects.toBeInstanceOf(PlanHashTooLarge);
  });

  it("inflateCapped (returns a code): opens at SOURCE_CAP_BYTES, source_too_large one byte over", async () => {
    const ok = await inflateCapped(fromBase64Url(atCap), SOURCE_CAP_BYTES);
    expect(typeof ok === "string" ? ok : ok.byteLength).toBe(SOURCE_CAP_BYTES);
    expect(await inflateCapped(fromBase64Url(overCap), SOURCE_CAP_BYTES)).toBe("source_too_large");
  });

  it("decodePayload, the short-link Worker (returns a code): opens at SOURCE_CAP_BYTES, source_too_large one over", async () => {
    expect(await decodePayload(atCap)).toBe(" ".repeat(SOURCE_CAP_BYTES));
    expect(await decodePayload(overCap)).toBe("source_too_large");
  });

  it("readHash / srcFromHash, the playground (return a refusal / null): opens at LINK_INFLATE_CAP_BYTES, refuses one over", async () => {
    // Under the page's own cap, a payload past SOURCE_CAP_BYTES still opens.
    expect(await readHash(`#z=${overCap}`)).toEqual({ src: " ".repeat(SOURCE_CAP_BYTES + 1) });
    const pageAt = spaces(LINK_INFLATE_CAP_BYTES);
    const pageOver = spaces(LINK_INFLATE_CAP_BYTES + 1);
    expect(await readHash(`#z=${pageAt}`)).toEqual({ src: " ".repeat(LINK_INFLATE_CAP_BYTES) });
    expect(await srcFromHash(`#z=${pageAt}`)).toHaveLength(LINK_INFLATE_CAP_BYTES);
    expect(await readHash(`#z=${pageOver}`)).toEqual({ refused: "too_large" });
    expect(await srcFromHash(`#z=${pageOver}`)).toBeNull();
  });
});
