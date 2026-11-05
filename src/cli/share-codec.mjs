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

/** The production playground origin every minted link points at (no trailing slash). */
export const PLAYGROUND_ORIGIN = "https://playground.archlang.uk";

/**
 * The hash param that opens the playground in edit mode (the source beside the drawing), as
 * `#z=<payload>&edit`. The playground opens in view mode without it; its `#z=` reader parses the
 * plan out of the hash either way (`hasEditFlag` in `playground/src/share.ts`).
 */
export const PLAYGROUND_EDIT_FLAG = "edit";

/** Encode plan source into the `#z=` share payload (base64url of the raw-deflated UTF-8). */
export function encodePlanHash(source) {
  return deflateRawSync(Buffer.from(source, "utf8"), { level: 9 })
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a `#z=` payload back to plan source. The inverse of {@link encodePlanHash}. */
export function decodePlanHash(hash) {
  return inflateRawSync(Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8");
}
