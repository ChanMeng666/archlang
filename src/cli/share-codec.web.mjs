/**
 * The Web-standard decoder of the playground's `#z=` share payload, beside the Node one in
 * `share-codec.mjs`: `#z=<base64url(deflate-raw(utf8))>`, read with `DecompressionStream` and
 * `atob` instead of `zlib` and `Buffer`, so a runtime with no Node built-ins (the hosted MCP
 * Worker's `GET /svg/<payload>`) reads exactly what `archlang link` mints.
 * `test/share-codec-web.test.ts` holds the two decoders to the same source on every example.
 *
 * Bounded: `maxBytes` caps the INFLATED size and stops reading the moment it is passed, so a
 * small payload that inflates enormously costs at most `maxBytes` of work, never the whole bomb.
 * There is ONE inflater, `inflateCapped`; `decodePlanHashWeb` is built on it, and a refusal is a
 * returned code (`PayloadFault`), never a throw.
 * Types: `share-codec.web.d.mts`.
 *
 * Published in `@chanmeng666/archlang/share` (`src/share.ts` re-exports it). Plain `.mjs` with no
 * Node built-in on purpose: `share-codec.mjs`, the Node encoder that scripts run with plain `node`,
 * imports the edit flag from here, so the flag has one definition.
 */

/**
 * The hash param that opens the playground in edit mode (the source beside the drawing), as
 * `#z=<payload>&edit`. The playground opens in view mode without it; its `#z=` reader parses the
 * plan out of the hash either way (`hasEditFlag` in `playground/src/share.ts`).
 */
export const PLAYGROUND_EDIT_FLAG = "edit";

/** bytes → base64url (no padding). UTF-8-safe: no `escape`/`unescape`. */
export function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url (no padding) → bytes. Throws on a character outside the alphabet. */
export function fromBase64Url(hash) {
  const bin = atob(hash.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** @typedef {"bad_payload" | "source_too_large"} PayloadFault Why a payload was refused, before any plan is read. */

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
 *
 * @param {Uint8Array} bytes
 * @param {number} cap
 * @returns {Promise<Uint8Array | PayloadFault>}
 */
export async function inflateCapped(bytes, cap) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // Runs beside the read loop (an awaited write waits for the reader to drain). Its writes reject
  // with the read side when the stream is corrupt or the reader cancels at the cap; the read loop
  // reports that, so the rejection is only kept from becoming unhandled.
  void (async () => {
    try {
      for (let at = 0; at < bytes.length; at += WRITE_SLICE) {
        await writer.write(bytes.subarray(at, at + WRITE_SLICE));
      }
      await writer.close();
    } catch {
      /* reported by the reader */
    }
  })();
  const reader = ds.readable.getReader();
  const chunks = [];
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

/**
 * Decode a `#z=` payload back to plan source. The inverse of `encodePlanHash` in
 * `share-codec.mjs`, and of the playground's browser encoder. Never throws on a bad payload:
 * `"bad_payload"` for text that is not base64url or a stream that does not inflate,
 * `"source_too_large"` once the inflated source passes `maxBytes`.
 *
 * @param {string} hash the payload after `#z=`
 * @param {{ maxBytes?: number }} [opts] refuse past this many inflated bytes (default: no cap)
 * @returns {Promise<string | PayloadFault>}
 */
export async function decodePlanHashWeb(hash, opts = {}) {
  let input;
  try {
    input = fromBase64Url(hash);
  } catch {
    return "bad_payload";
  }
  const raw = await inflateCapped(input, opts.maxBytes ?? Number.POSITIVE_INFINITY);
  if (typeof raw === "string") return raw;
  return new TextDecoder("utf-8").decode(raw);
}
