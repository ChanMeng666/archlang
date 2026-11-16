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
import { pathToFileURL } from "node:url";
// The one Node encoder and the one playground origin, shared with `archlang link` and the MCP
// `link` tool. Re-exported so `docs-site/sync-docs.mjs` and the playground build scripts import
// both from here and never keep a copy of the origin.
import { decodePlanHash, encodePlanHash, PLAYGROUND_ORIGIN } from "../src/cli/share-codec.mjs";

export { decodePlanHash, encodePlanHash, PLAYGROUND_ORIGIN };

// The CLI half runs ONLY when this file is the entry point. `docs-site/sync-docs.mjs`
// IMPORTS `encodePlanHash` to mint the home page's per-example playground links, and
// without this guard that import would hit the arg check and `process.exit(2)` in the
// middle of the docs build. `test/share-codec.test.ts` still spawns this script directly
// — including with no args, asserting the exit-2 usage line — so both paths stay covered.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: node scripts/gen-permalink.mjs <example.arch>\n");
    process.exit(2);
  }
  process.stdout.write(`${PLAYGROUND_ORIGIN}/#z=${encodePlanHash(readFileSync(file, "utf8"))}\n`);
}
