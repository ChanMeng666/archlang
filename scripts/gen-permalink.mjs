/**
 * Print the playground permalink for an example — `#z=<base64url(deflate-raw(utf8))>`,
 * the exact codec `playground/src/share.ts` reads.
 *
 * Why this exists: GitHub's markdown sanitizer strips `<iframe>` (it renders as escaped
 * text, like `<script>`), so the playground's Embed snippet — which works fine in a blog,
 * a wiki or the docs site — CANNOT produce a live plan in the README. The closest honest
 * thing is a link that opens the real playground with the plan already loaded.
 *
 * A hand-pasted hash would rot silently: edit the example, and the README's image shows the
 * NEW plan while its link still opens the OLD one. So the links are generated here and
 * pinned by `test/readme-permalink.test.ts`, which decodes every `#z=` in README.md and
 * fails if it no longer matches the example it claims to be.
 *
 *   node scripts/gen-permalink.mjs examples/attached.arch
 */

import { readFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const PLAYGROUND = "https://playground.archlang.uk";

/** Encode plan source into the `#z=` share hash (base64url of the raw-deflated UTF-8). */
export function encodePlanHash(source) {
  return deflateRawSync(Buffer.from(source, "utf8"), { level: 9 })
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a `#z=` hash back to plan source. The inverse of {@link encodePlanHash}. */
export function decodePlanHash(hash) {
  return inflateRawSync(Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8");
}

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: node scripts/gen-permalink.mjs <example.arch>\n");
  process.exit(2);
}
process.stdout.write(`${PLAYGROUND}/#z=${encodePlanHash(readFileSync(file, "utf8"))}\n`);
