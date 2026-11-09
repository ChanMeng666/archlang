/**
 * The three `#z=` decoders against hostile input: arbitrary base64url text, and valid deflate
 * streams whose inflated size sits around the cap. None may hang or throw out of its refusal path,
 * and the cap is exact: `cap` bytes open, `cap + 1` is refused. Seeded, so a failure replays.
 *
 * What this cannot show: Node's zlib applies backpressure whatever the write size, so these pass
 * with or without the 1 KiB write slices in `inflateCapped` (see its comment); only a browser's
 * `DecompressionStream` gains from them.
 */
import { deflateRawSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodePlanHashWeb } from "archlang/share";
import { LINK_INFLATE_CAP_BYTES, bytesToB64url, readHash, srcFromHash } from "../src/share.js";
import { decodePayload } from "../worker/share-core.js";
import { supportsDeflateRaw } from "./helpers.js";
import { runs } from "../../test/setup/fast-check.js";

const SEED = 20261109;
const RUNS = { numRuns: runs(60), seed: SEED };
const b64url = fc.stringMatching(/^[A-Za-z0-9_-]{0,400}$/);
/** A valid deflate stream of `n` spaces: tiny on the wire, `n` bytes out. */
const bomb = (n: number) => bytesToB64url(deflateRawSync(Buffer.alloc(n, 0x20)));
/** Inflated sizes around `cap`: both sides of it, and the two bytes at its edge. */
const around = (cap: number) =>
  fc.oneof(fc.constantFrom(cap - 1, cap, cap + 1), fc.integer({ min: Math.max(0, cap - 64), max: cap + 64 }));

describe.skipIf(!supportsDeflateRaw)("share decoders on arbitrary input", () => {
  it("the playground decoder never throws and any source it returns is within the cap", async () => {
    await fc.assert(
      fc.asyncProperty(b64url, async (s) => {
        const r = await readHash(`#z=${s}`);
        if (r !== null && "src" in r)
          expect(new TextEncoder().encode(r.src).length).toBeLessThanOrEqual(LINK_INFLATE_CAP_BYTES);
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

  it("the web decoder resolves within maxBytes or returns a code, never throws", async () => {
    const maxBytes = 4096;
    await fc.assert(
      fc.asyncProperty(b64url, async (s) => {
        const out = await decodePlanHashWeb(s, { maxBytes });
        if (out.ok) expect(new TextEncoder().encode(out.source).length).toBeLessThanOrEqual(maxBytes);
      }),
      RUNS,
    );
  });

  describe("valid streams around the cap: the bound is exact", () => {
    const cap = 4096;
    it("the worker decoder opens up to the cap and refuses past it", async () => {
      await fc.assert(
        fc.asyncProperty(around(cap), async (n) => {
          const r = await decodePayload(bomb(n), cap);
          if (n <= cap) expect(r).toBe(" ".repeat(n));
          else expect(r).toBe("source_too_large");
        }),
        RUNS,
      );
    });

    it("the web decoder opens up to maxBytes and refuses past it", async () => {
      await fc.assert(
        fc.asyncProperty(around(cap), async (n) => {
          const out = await decodePlanHashWeb(bomb(n), { maxBytes: cap });
          if (n <= cap) expect(out).toEqual({ ok: true, source: " ".repeat(n) });
          else expect(out).toEqual({ ok: false, code: "source_too_large" });
        }),
        RUNS,
      );
    });

    it("the playground decoder opens up to LINK_INFLATE_CAP_BYTES and refuses past it", async () => {
      await fc.assert(
        fc.asyncProperty(around(LINK_INFLATE_CAP_BYTES), async (n) => {
          const r = await readHash(`#z=${bomb(n)}`);
          if (n <= LINK_INFLATE_CAP_BYTES) expect(r !== null && "src" in r && r.src.length === n).toBe(true);
          else expect(r).toEqual({ refused: "too_large" });
        }),
        { numRuns: runs(12), seed: SEED },
      );
    });
  });

  it("cap + 1 byte is refused where exactly the cap opens", async () => {
    expect(await readHash(`#z=${bomb(LINK_INFLATE_CAP_BYTES + 1)}`)).toEqual({ refused: "too_large" });
    const at = await readHash(`#z=${bomb(LINK_INFLATE_CAP_BYTES)}`);
    expect(at !== null && "src" in at && at.src.length === LINK_INFLATE_CAP_BYTES).toBe(true);
  });

  it("valid deflate that inflates far past the cap is refused by all three, unread", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 40 }), async (mib) => {
        const z = bomb(mib * 1024 * 1024);
        expect(await readHash(`#z=${z}`)).toEqual({ refused: "too_large" });
        expect(await srcFromHash(`#z=${z}`)).toBeNull();
        expect(await decodePayload(z)).toBe("source_too_large");
        expect(await decodePlanHashWeb(z, { maxBytes: LINK_INFLATE_CAP_BYTES })).toEqual({
          ok: false,
          code: "source_too_large",
        });
      }),
      { numRuns: runs(4), seed: SEED },
    );
  });
});
