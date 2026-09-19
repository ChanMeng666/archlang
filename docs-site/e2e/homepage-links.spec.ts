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
  "laneway-house", // the hero that types itself
  "hillside-villa", // card A-101, the showpiece
  "townhouse", // A-102, pictured as its three storey pages
  "library", // A-103
  "hexagon-pavilion", // A-104
  "garden-house", // A-105
  "furnished-flat", // A-106
  "terrace-row", // A-107
  "two-storey", // A-108 — pictured as its AXON render, linked as its plan
  "materials", // A-109
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
    // hero CTA + hero sheet control + 9 cards + the facts band.
    expect(n, "the home page must offer a per-plan playground link on every drawing").toBe(12);

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
    // The card names its source file on the strip, and every drawing on it is derived from
    // that same key — so "shows X, opens Y" is checkable from the page alone.
    //
    // A card may carry MORE than one drawing, and not always the plan view: A-102 shows
    // townhouse's three storey pages (`<stem>.L<n>.svg`) and A-108 shows two-storey's
    // committed axonometric render (`/view/<stem>-axon.svg`) while still linking the plan.
    // Both stay welded to the stem — that is what the pattern below enforces.
    const cards = await page.locator(".card").all();
    expect(cards.length, "the sheet gallery must render its cards").toBe(9);
    for (const card of cards) {
      const named = (await card.locator(".card__open-file").textContent())?.trim();
      if (!named) continue; // an art-less sheet (none today, but the shape allows it)
      const stem = named.replace(/\.arch$/, "");
      const art = await card
        .locator(".card__art img")
        .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute("src") ?? ""));
      expect(art.length, `card "${named}" draws nothing`).toBeGreaterThan(0);
      const derived = new RegExp(`^/(examples/${stem}(\\.L-?\\d+)?|view/${stem}-(iso|axon))\\.svg$`);
      for (const src of art) {
        expect(src, `card "${named}" draws ${src}, which is not derived from ${stem}`).toMatch(derived);
      }
      const href = (await card.locator(".card__open").getAttribute("href")) as string;
      const decoded = await srcFromHash(href.slice(href.indexOf("#")));
      expect(decoded, `card "${named}" mints a hash the playground cannot read`).not.toBeNull();
      expect(
        (decoded as string).replace(/\r\n/g, "\n"),
        `card "${named}" pictures ${art.join(", ")} but opens a different plan`,
      ).toBe(exampleSource(stem));
    }
  });

  /**
   * Every drawing on the page must actually LOAD.
   *
   * The card art is `<img src>`, which is the right call for a crawler — static bytes are
   * all an AI crawler ever sees — and the wrong call for confidence: a route that 404s
   * leaves a card with an empty box and fails nothing. `routes.spec.ts` fetches the
   * gallery routes it DERIVES; this asserts the ones the page actually asks for, which is
   * the other half (a typo'd `src` passes there and fails here).
   */
  test("every drawing the landing page asks for actually renders", async ({ page }) => {
    await page.goto("/");
    const imgs = page.locator(".card__art img");
    const n = await imgs.count();
    // 8 single-drawing cards + A-102's three storeys.
    expect(n, "the sheet gallery must draw one image per card, and three on A-102").toBe(11);
    for (let i = 0; i < n; i++) {
      const img = imgs.nth(i);
      const src = await img.getAttribute("src");
      // The art is `loading="lazy"`, so a card below the fold has not fetched anything
      // yet — scroll it in and poll, rather than reading a 0 that only means "not asked
      // for". A genuinely missing route stays 0 until the timeout.
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);
      expect(src, "every drawing must be served from the site's own routes").toMatch(/^\/(examples|view)\//);
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
