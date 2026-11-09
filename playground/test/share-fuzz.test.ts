/**
 * The three `#z=` decoders against hostile input: arbitrary base64url text and valid deflate
 * streams that inflate far past the cap. None may hang or throw out of its refusal path, and no
 * output may pass its cap. Seeded, so a failure replays.
 */
import { deflateRawSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PlanHashTooLarge, decodePlanHashWeb } from "../../src/cli/share-codec.web.mjs";
import { LINK_INFLATE_CAP_BYTES, bytesToB64url, readHash, srcFromHash } from "../src/share.js";
import { decodePayload } from "../worker/share-core.js";
import { supportsDeflateRaw } from "./helpers.js";

const RUNS = { numRuns: 60, seed: 20261109 };
const b64url = fc.stringMatching(/^[A-Za-z0-9_-]{0,400}$/);
/** Deflate streams of `n` spaces: tiny on the wire, `n` bytes out. */
const bomb = (n: number) => bytesToB64url(deflateRawSync(Buffer.alloc(n, 0x20)));

describe.skipIf(!supportsDeflateRaw)("share decoders on arbitrary input", () => {
  it("the playground decoder never throws and any source it returns is within the cap", async () => {
    await fc.assert(
      fc.asyncProperty(b64url, async (s) => {
        const r = await readHash(`#z=${s}`);
        if (r !== null && "src" in r)
          expect(new TextEncoder().encode(r.src).length).toBeLessThanOrEqual(LINK_INFLATE_CAP_BYTES * 3);
        expect(await srcFromHash(`#z=${s}`)).toSatisfy((v: unknown) => v === null || typeof v === "string");
      }),
      RUNS,
    );
  });

  it("the worker decoder returns a refusal or a source within its cap", async () => {
    const cap = 4096;
    await fc.assert(
      fc.asyncProperty(b64url, async (s) => {
        const r = await decodePayload(s, cap);
        expect(typeof r).toBe("string");
        if (r !== "bad_payload" && r !== "source_too_large") expect(r.length).toBeLessThanOrEqual(cap);
      }),
      RUNS,
    );
  });

  it("the web decoder resolves within maxBytes or rejects with an Error, never anything else", async () => {
    const maxBytes = 4096;
    await fc.assert(
      fc.asyncProperty(b64url, async (s) => {
        try {
          const out = await decodePlanHashWeb(s, { maxBytes });
          expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(maxBytes);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
        }
      }),
      RUNS,
    );
  });

  it("valid deflate that inflates past the cap is refused by all three, unread", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 40 }), async (mib) => {
        const z = bomb(mib * 1024 * 1024);
        expect(await readHash(`#z=${z}`)).toEqual({ refused: "too_large" });
        expect(await srcFromHash(`#z=${z}`)).toBeNull();
        expect(await decodePayload(z)).toBe("source_too_large");
        await expect(decodePlanHashWeb(z, { maxBytes: LINK_INFLATE_CAP_BYTES })).rejects.toBeInstanceOf(
          PlanHashTooLarge,
        );
      }),
      { numRuns: 4, seed: 20261109 },
    );
  });

  it("a stream just inside the cap still opens", async () => {
    const r = await readHash(`#z=${bomb(LINK_INFLATE_CAP_BYTES)}`);
    expect(r !== null && "src" in r && r.src.length === LINK_INFLATE_CAP_BYTES).toBe(true);
  });
});
