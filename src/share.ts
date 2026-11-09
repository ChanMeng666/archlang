/**
 * `@chanmeng666/archlang/share`: the browser-safe half of the playground's `#z=` share link,
 * `#z=<base64url(deflate-raw(utf8))>`, for every consumer with no `zlib` (the playground page and
 * its short-link Worker, the hosted MCP Worker, the docs widget). Web-standard APIs only
 * (`atob`/`btoa`, `DecompressionStream`); nothing here is reached by `compile()`.
 *
 * The decoders need a runtime with `DecompressionStream("deflate-raw")`: a modern browser, a
 * Worker, or a current Node 20 or later. On Node 18 that constructor throws, so both
 * `decodePlanHashWeb` and `inflateCapped` reject; the CLI's sync Node decoder
 * (`cli/share-codec.mjs`) has no such need.
 *
 * It holds the base64url pair, the bounded decoders (`decodePlanHashWeb`, `inflateCapped`), the
 * edit flag, the short-link id shape and the hosts' size caps. It holds no encoder: deflate output
 * depends on the implementation (Node's zlib at level 9 in `cli/share-codec.mjs`, a browser's
 * `CompressionStream` at its default), so each environment keeps its own and
 * `test/share-codec.test.ts` pins them to one scheme.
 *
 * The base64url pair, the web decoder and the flag live in `cli/share-codec.web.mjs`, plain JS, so
 * the Node encoder (`cli/share-codec.mjs`, which scripts import with plain `node`) shares the flag.
 *
 * The encoders stay one per implementation (Node zlib, the playground's and the docs widget's
 * `CompressionStream`), since deflate output differs by implementation, pinned by
 * `test/share-codec.test.ts`.
 */
export {
  decodePlanHashWeb,
  fromBase64Url,
  PLAYGROUND_EDIT_FLAG,
  PlanHashTooLarge,
  toBase64Url,
} from "./cli/share-codec.web.mjs";

/**
 * The most UTF-8 bytes a shared plan's source may inflate to on a host: the hosted MCP Worker's cap
 * on any tool argument and on a `/svg/<payload>` (ADR 0026), and the short-link Worker's on a
 * stored plan (ADR 0034). A deflate stream can expand a thousandfold, so inflation stops here rather
 * than at the end of the stream. Three and a half times the largest example
 * (`examples/hillside-villa.arch`, ~18 KB). It bounds a host's `compile()`: measured on a desktop,
 * about 0.5 s for 64 KiB of rooms and 1.8 s for 256 KiB.
 */
export const SOURCE_CAP_BYTES = 64 * 1024;

/**
 * The longest `POST /api/share` body the playground's short-link Worker reads, in characters
 * (= bytes: the alphabet is ASCII). It is the COMPRESSED payload, the value stored in KV, and the
 * body is read no further past it. Equal in number to {@link SOURCE_CAP_BYTES}, not derived from
 * it: 64 Ki base64url characters carry 48 KiB of deflate output, so a source at the source cap that
 * deflates by less than a quarter is refused here, as too long a payload. Real plans deflate several
 * times over (the largest example to a few KB), so none comes near it.
 */
export const SHORT_LINK_PAYLOAD_CAP_CHARS = 64 * 1024;

/**
 * The longest `/svg/<payload>` the hosted MCP Worker accepts, in characters. Derived from
 * {@link SOURCE_CAP_BYTES}: a cap-sized source that does not compress at all (deflate's stored
 * blocks add a few bytes) is 4/3 as long in base64url, plus 1 KiB of slack, so there the source cap
 * is the only size that refuses a plan.
 */
export const MCP_PAYLOAD_CAP_CHARS = Math.ceil((SOURCE_CAP_BYTES * 4) / 3) + 1024;

/** The shortest short-link id: 8 base62 characters, about 47.6 bits. */
export const SHARE_ID_MIN = 8;
/** The longest short-link id: the whole base62 SHA-256 (62^43 > 2^256). */
export const SHARE_ID_MAX = 43;
/** A short-link id: {@link SHARE_ID_MIN} to {@link SHARE_ID_MAX} base62 characters. */
export const SHARE_ID = /^[0-9A-Za-z]{8,43}$/;

/** Is `s` shaped like a short-link id (8–43 base62 characters)? */
export const isShareId = (s: string): boolean => SHARE_ID.test(s);

/** Why a payload was refused, before any plan is read. */
export type PayloadFault = "bad_payload" | "source_too_large";

/** The compressed input is fed to the inflater this many bytes at a time. */
const WRITE_SLICE = 1024;

/**
 * Inflate a raw-deflate stream, stopping as soon as the output passes `cap` bytes. Returns the
 * bytes, `"source_too_large"` past the cap, or `"bad_payload"` for a stream that does not inflate.
 *
 * The input goes in as ~1 KiB slices, each awaited, rather than one write: a browser's
 * `DecompressionStream` may inflate a whole written chunk in one step, so one write of a 200 KB
 * bomb could expand to its full 200 MB before the read loop below sees a byte. Node's zlib
 * applies backpressure either way, which is why the Node tests cannot show the difference.
 */
export async function inflateCapped(bytes: Uint8Array, cap: number): Promise<Uint8Array | PayloadFault> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // Runs beside the read loop (an awaited write waits for the reader to drain). Its writes reject
  // with the read side when the stream is corrupt or the reader cancels at the cap; the read loop
  // reports that, so the rejection is only kept from becoming unhandled.
  void (async () => {
    try {
      for (let at = 0; at < bytes.length; at += WRITE_SLICE) {
        await writer.write(bytes.subarray(at, at + WRITE_SLICE) as BufferSource);
      }
      await writer.close();
    } catch {
      /* reported by the reader */
    }
  })();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return "source_too_large";
      }
      chunks.push(value);
    }
  } catch {
    return "bad_payload";
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
