/**
 * Drift guard for the playground permalinks in the hand-written docs.
 *
 * GitHub's markdown sanitizer strips `<iframe>` (it comes back HTML-escaped, exactly like
 * `<script>`), so the playground's Embed snippet cannot produce a live plan in the README —
 * it only works in a blog, a wiki, or the docs site. The closest honest substitute is a link
 * that opens the real playground with the plan already loaded, via the `#z=` share hash.
 *
 * That hash is a compressed COPY of an example's source, which means it can rot silently:
 * edit `examples/attached.arch`, and the README's image would show the new plan while its
 * link still opened the old one — the reader would see two different buildings and have no
 * way to know which is real. This test decodes every `#z=` link in the hand-written docs and
 * asserts it still matches an example on disk AND still compiles clean, so that can't happen.
 *
 * If this fails: regenerate with `node scripts/gen-permalink.mjs examples/<name>.arch` and
 * paste the new URL into the doc.
 *
 * Decoding goes through the playground's OWN codec (`playground/src/share.ts`) rather than a
 * private reimplementation — a permalink is only correct if the code that reads it in the
 * browser can read it. The base64url half is imported directly; the inflate half falls back
 * to `node:zlib` because `DecompressionStream("deflate-raw")` only exists from Node 21.2 and
 * CI runs the suite on 18/20/22 — where the capability IS present, `srcFromHash` is asserted
 * to agree, so the imported codec is exercised end to end. That last case is `it.skipIf`-gated
 * so it reports as a NAMED SKIP on 18/20 instead of an early `return` that read as a pass.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { b64urlToBytes, srcFromHash } from "../playground/src/share.js";

/**
 * Hand-written docs that may carry a permalink. Generated pages are excluded: the docs-site
 * files listed here are the hand-authored ones (the rest of `docs-site/*.md` is written by
 * `sync-docs.mjs` from `docs/*.md`, whose sources are covered by scanning them there).
 */
const DOCS = [
  "README.md",
  "SKILL.md",
  "llms.txt",
  "docs-site/index.md",
  "docs-site/guide.md",
  "docs-site/agents.md",
  "docs-site/examples.md",
  "docs-site/relational.md",
];

/** Whether this Node can run the playground's own `#z=` decode path. */
const HAS_DEFLATE_RAW = (() => {
  if (typeof DecompressionStream === "undefined") return false;
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
})();

/** Every `playground.archlang.uk/#z=<hash>` link in `text`, with the line it sits on. */
function permalinks(file: string, text: string): { file: string; line: number; hash: string }[] {
  const found: { file: string; line: number; hash: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/playground\.archlang\.uk\/#z=([A-Za-z0-9_-]+)/g))
      found.push({ file, line: i + 1, hash: m[1]! });
  });
  return found;
}

/** The plan source a `#z=` hash carries: base64url (the playground's own) → raw inflate. */
const decode = (hash: string): string => inflateRawSync(Buffer.from(b64urlToBytes(hash))).toString("utf8");

describe("playground permalinks stay in sync with examples/", () => {
  const links = DOCS.flatMap((f) => permalinks(f, readFileSync(f, "utf8")));

  const examples = Object.fromEntries(
    readdirSync("examples")
      .filter((f) => f.endsWith(".arch"))
      .map((f) => [f, readFileSync(resolve("examples", f), "utf8").replace(/\r\n/g, "\n")]),
  );

  it("has at least one permalink (the README hero — its stand-in for an embed)", () => {
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.file === "README.md")).toBe(true);
  });

  it("every permalink decodes to an example that still exists, byte-for-byte", () => {
    for (const { file, line, hash } of links) {
      const source = decode(hash).replace(/\r\n/g, "\n");
      const match = Object.entries(examples).find(([, content]) => content === source);
      expect(
        match,
        `${file}:${line} — a permalink no longer matches any examples/*.arch, so the link would open ` +
          `a stale plan while the page shows the current one. Regenerate it:\n` +
          `  node scripts/gen-permalink.mjs examples/<name>.arch\n` +
          `Decoded source began: ${JSON.stringify(source.slice(0, 60))}`,
      ).toBeDefined();
    }
  });

  it("every permalink opens a plan that compiles with zero errors", () => {
    for (const { file, line, hash } of links) {
      const { diagnostics } = compile(decode(hash), { noCache: true });
      const errors = diagnostics.filter((d) => d.severity === "error");
      expect(
        errors.map((d) => `${d.code}: ${d.message}`),
        `${file}:${line} — the plan behind this permalink does not compile, so a reader clicking it ` +
          `lands on an error card instead of a drawing. Fix the example and regenerate the link with ` +
          `\`node scripts/gen-permalink.mjs examples/<name>.arch\`.`,
      ).toEqual([]);
    }
  });

  // `skipIf`, not an early `return`: the early return made this case report as a PASS on
  // Node 18/20 having asserted nothing at all. This is a CAPABILITY gate, not an optional
  // dependency, so — unlike the pdfkit/resvg gates — it deliberately carries NO CI throw:
  // two of the three matrix legs legitimately lack `deflate-raw`, and failing there would
  // be wrong. Skipping by name is the whole fix. It still runs on Node 22.
  it.skipIf(!HAS_DEFLATE_RAW)("the playground's own decoder reads every permalink", async () => {
    for (const { file, line, hash } of links) {
      expect(
        await srcFromHash(`#z=${hash}`),
        `${file}:${line} — playground/src/share.ts cannot decode this permalink, so the browser that ` +
          `opens it would show an empty editor. The link must be minted by \`scripts/gen-permalink.mjs\`, ` +
          `whose scheme test/share-codec.test.ts pins against that codec.`,
      ).toBe(decode(hash));
    }
  });
});
