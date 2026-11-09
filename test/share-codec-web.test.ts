/**
 * The two `#z=` decoders agree: `share-codec.mjs` (Node `zlib`, the one encoder `archlang link`
 * and the MCP `link` tool mint with) and `share-codec.web.mjs` (`DecompressionStream`, what the
 * hosted MCP Worker's `GET /svg/<payload>` reads). One encoding, so a link and an image URL
 * minted from the same plan carry the same payload and decode to the same source.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePlanHash, encodePlanHash } from "../src/cli/share-codec.mjs";
import { decodePlanHashWeb } from "../src/cli/share-codec.web.mjs";

/**
 * `DecompressionStream("deflate-raw")` is missing from Node 18 (a CI leg) and from early Node 20
 * releases; current Node 20 and later have it. Gate on the capability, not the version.
 */
const HAS_DEFLATE_RAW = (() => {
  if (typeof DecompressionStream === "undefined") return false;
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
})();

/** Every top-level example, read from disk rather than listed. */
const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => [f, readFileSync(join("examples", f), "utf8")] as const);

describe.skipIf(!HAS_DEFLATE_RAW)("share-codec.web.mjs ↔ share-codec.mjs", () => {
  it("reads the corpus (the list is not empty)", () => {
    expect(EXAMPLES.length).toBeGreaterThan(20);
  });

  it.each(EXAMPLES)("%s: both decoders return the encoded source", async (_name, source) => {
    const payload = encodePlanHash(source);
    const node = decodePlanHash(payload);
    const web = await decodePlanHashWeb(payload);
    expect(node).toBe(source);
    expect(web).toBe(node);
  });

  it("reads a payload the browser's CompressionStream minted (level 6, not zlib's 9)", async () => {
    const source = EXAMPLES.find(([n]) => n === "museum.arch")?.[1] ?? EXAMPLES[0]![1];
    const deflated = new Uint8Array(
      await new Response(new Blob([source]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer(),
    );
    const payload = Buffer.from(deflated).toString("base64url");
    expect(payload).not.toBe(encodePlanHash(source)); // the two encoders really differ here
    expect(await decodePlanHashWeb(payload)).toBe(source);
    expect(decodePlanHash(payload)).toBe(source);
  });

  it("keeps non-ASCII text intact", async () => {
    const source = 'plan "厨房 🏠" {\n  room at (0,0) size 4000x3000 label "Küche"\n}\n';
    expect(await decodePlanHashWeb(encodePlanHash(source))).toBe(source);
  });

  it("stops at maxBytes: a small payload that inflates past the cap is refused, not inflated", async () => {
    const bomb = encodePlanHash("x".repeat(1_000_000));
    expect(bomb.length).toBeLessThan(2_000);
    expect(await decodePlanHashWeb(bomb, { maxBytes: 65_536 })).toBe("source_too_large");
    // At the cap exactly, it decodes.
    expect(await decodePlanHashWeb(encodePlanHash("y".repeat(65_536)), { maxBytes: 65_536 })).toHaveLength(65_536);
  });

  it("rejects a payload that is not base64url deflate-raw (never returns garbage as source)", async () => {
    expect(await decodePlanHashWeb("!!!not-base64!!!")).toBe("bad_payload");
    expect(await decodePlanHashWeb("AAAA")).toBe("bad_payload");
  });
});
