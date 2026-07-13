/**
 * Drift guard for the playground permalinks in README.md.
 *
 * GitHub's markdown sanitizer strips `<iframe>` (it comes back HTML-escaped, exactly like
 * `<script>`), so the playground's Embed snippet cannot produce a live plan in the README —
 * it only works in a blog, a wiki, or the docs site. The closest honest substitute is a link
 * that opens the real playground with the plan already loaded, via the `#z=` share hash.
 *
 * That hash is a compressed COPY of an example's source, which means it can rot silently:
 * edit `examples/attached.arch`, and the README's image would show the new plan while its
 * link still opened the old one — the reader would see two different buildings and have no
 * way to know which is real. This test decodes every `#z=` link in README.md and asserts it
 * still matches an example on disk, so that can't happen.
 *
 * If this fails: regenerate with `node scripts/gen-permalink.mjs examples/<name>.arch` and
 * paste the new URL into README.md.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/** Every `#z=` hash the README links to. */
function permalinkHashes(readme: string): string[] {
  return [...readme.matchAll(/archlang-playground\.vercel\.app\/#z=([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
}

/** The `#z=` codec, mirroring `playground/src/share.ts`: base64url of raw-deflated UTF-8. */
function decode(hash: string): string {
  return inflateRawSync(Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8");
}

describe("README playground permalinks stay in sync with examples/", () => {
  const readme = readFileSync("README.md", "utf8");
  const hashes = permalinkHashes(readme);

  const examples = Object.fromEntries(
    readdirSync("examples")
      .filter((f) => f.endsWith(".arch"))
      .map((f) => [f, readFileSync(resolve("examples", f), "utf8").replace(/\r\n/g, "\n")]),
  );

  it("has at least one permalink (the hero — the README's stand-in for an embed)", () => {
    expect(hashes.length).toBeGreaterThan(0);
  });

  it("every permalink decodes to an example that still exists, byte-for-byte", () => {
    for (const hash of hashes) {
      const source = decode(hash).replace(/\r\n/g, "\n");
      const match = Object.entries(examples).find(([, content]) => content === source);
      expect(
        match,
        `A README permalink no longer matches any examples/*.arch — the link would open a stale plan ` +
          `while the README shows the current one. Regenerate it:\n` +
          `  node scripts/gen-permalink.mjs examples/<name>.arch\n` +
          `Decoded source began: ${JSON.stringify(source.slice(0, 60))}`,
      ).toBeDefined();
    }
  });
});
