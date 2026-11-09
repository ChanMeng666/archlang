/**
 * The Node side of the playground's `#z=` share link: `#z=<base64url(deflate-raw(utf8))>`,
 * the scheme `playground/src/share.ts` reads (the browser copy, which has `CompressionStream`
 * and no `zlib`).
 *
 * This is the ONE Node encoder in the repo. Plain `.mjs` on purpose: `archlang link` and the
 * MCP `link` tool reach it through `link.ts` (bundled by tsup), while `scripts/gen-permalink.mjs`
 * — and through it the docs-site and playground build scripts — import it straight from the
 * source tree with plain `node`, no build first. Types: `share-codec.d.mts`.
 *
 * Level 9, not `CompressionStream`'s default 6: on a long plan the payload differs from the
 * browser's byte for byte but decodes to the same source (`test/share-codec.test.ts`).
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * The hash param that opens the playground in edit mode, `#z=<payload>&edit`: defined once, in
 * the browser-safe half (`share-codec.web.mjs`, published as `@chanmeng666/archlang/share`).
 */
export { PLAYGROUND_EDIT_FLAG } from "./share-codec.web.mjs";
import { SHARE_INFLATE_CAP_BYTES } from "./share-codec.web.mjs";

/** The production playground origin every minted link points at (no trailing slash). */
export const PLAYGROUND_ORIGIN = "https://playground.archlang.uk";

/** Encode plan source into the `#z=` share payload (base64url of the raw-deflated UTF-8). */
export function encodePlanHash(source) {
  return deflateRawSync(Buffer.from(source, "utf8"), { level: 9 })
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a `#z=` payload back to plan source. The inverse of {@link encodePlanHash}. Throws (a
 * RangeError) when the source inflates past `opts.maxBytes` (default `SHARE_INFLATE_CAP_BYTES`,
 * 1 MiB), so a decompression bomb costs at most that much.
 */
export function decodePlanHash(hash, opts = {}) {
  return inflateRawSync(Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64"), {
    maxOutputLength: opts.maxBytes ?? SHARE_INFLATE_CAP_BYTES,
  }).toString("utf8");
}
