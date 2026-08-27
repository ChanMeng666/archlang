/**
 * The home page's drawings are DOORS into the playground.
 *
 * Every plan pictured on the landing page — the hero that types itself, the six sheet
 * cards, and the "Reads its own plans" band — carries an "Open in Playground" link whose
 * `#z=` payload is minted at BUILD time by `docs-site/sync-docs.mjs` (reusing
 * `scripts/gen-permalink.mjs`'s `encodePlanHash`), not encoded on click. That is what
 * makes them real `<a href>`s: middle-clickable, crawlable, no async handler.
 *
 * It also means NOTHING in a browser would ever notice if that map went stale, or if a
 * card pointed at a plan it is not showing — there is no runtime step to fail. So this
 * decodes each real href through the PLAYGROUND's own decoder and byte-compares the
 * result against `examples/<name>.arch` on disk. `test/share-codec.test.ts` holds the
 * three codec implementations equal statically; this is the end-to-end half.
 *
 * Deliberately UNTAGGED (no `@prod`): the nightly runs the tagged subset against the LIVE
 * site, where a normal deploy lag would make a production-vs-local source comparison fail
 * for a reason that is not a bug.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
// The playground's canonical decoder, run here in Node. Needs Node ≥21.2 for
// `DecompressionStream("deflate-raw")`; the e2e-docs CI job pins Node 22.
import { srcFromHash } from "../../playground/src/share.js";
import { ROOT } from "./fixtures.js";

/** Every plan the landing page pictures, in the order the page presents them. */
const PICTURED = [
  "hillside-villa", // card A-101, the showpiece
  "laneway-house", // the hero, and card A-102
  "courtyard-house", // A-103
  "library", // A-104
  "hexagon-pavilion", // A-105
  "materials", // A-106
  "garden-loft", // the "Reads its own plans" band
] as const;

/** `examples/<name>.arch` as the site's own build read it (LF, like the generated map). */
function exampleSource(name: string): string {
  return readFileSync(join(ROOT, "examples", `${name}.arch`), "utf8").replace(/\r\n/g, "\n");
}

test.describe("every home-page drawing opens its own plan in the playground", () => {
  test("each `#z=` href decodes to an example that exists on disk", async ({ page }) => {
    await page.goto("/");
    const links = page.locator('a[href*="playground.archlang.uk/#z="]');
    const n = await links.count();
    // hero CTA + hero sheet control + 6 cards + the facts band.
    expect(n, "the home page must offer a per-plan playground link on every drawing").toBe(9);

    const onDisk = new Map(PICTURED.map((name) => [exampleSource(name), name]));
    for (let i = 0; i < n; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href, `link ${i} has no href — it must be a real anchor, not a click handler`).toBeTruthy();
      const decoded = await srcFromHash((href as string).slice((href as string).indexOf("#")));
      expect(
        decoded === null ? null : onDisk.get(decoded.replace(/\r\n/g, "\n")),
        `link ${i} does not decode to any example on disk. Either the \`#z=\` scheme drifted ` +
          `(playground/src/share.ts vs scripts/gen-permalink.mjs) or examples-data.js is stale — ` +
          `re-run the docs build, which regenerates it.`,
      ).toBeDefined();
    }
  });

  test("a card shows and opens the SAME plan", async ({ page }) => {
    await page.goto("/");
    // The card names its source file on the strip, and its art is derived from the same
    // key — so "shows X, opens Y" is checkable from the page alone.
    for (const card of await page.locator(".card").all()) {
      const named = (await card.locator(".card__open-file").textContent())?.trim();
      if (!named) continue; // an art-less sheet (none today, but the shape allows it)
      const stem = named.replace(/\.arch$/, "");
      expect(await card.locator(".card__art img").getAttribute("src")).toBe(`/examples/${stem}.svg`);
      const href = (await card.locator(".card__open").getAttribute("href")) as string;
      const decoded = await srcFromHash(href.slice(href.indexOf("#")));
      expect(decoded, `card "${named}" mints a hash the playground cannot read`).not.toBeNull();
      expect(
        (decoded as string).replace(/\r\n/g, "\n"),
        `card "${named}" pictures ${stem}.svg but opens a different plan`,
      ).toBe(exampleSource(stem));
    }
  });

  test("the links are real hrefs that open in a new tab", async ({ page }) => {
    await page.goto("/");
    // Being a plain anchor is the whole point of minting these at build time — a
    // click-handler version would lose middle-click, "copy link" and crawlability.
    for (const a of await page.locator(".plan-open").all()) {
      expect(await a.getAttribute("href")).toMatch(/^https:\/\/playground\.archlang\.uk\/#z=/);
      expect(await a.getAttribute("target")).toBe("_blank");
      expect(await a.getAttribute("rel")).toContain("noopener");
    }
  });
});
