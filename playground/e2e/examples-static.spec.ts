import { expect, test } from "@playwright/test";
import { watchForProblems } from "./fixtures.js";

/**
 * The STATIC half of this site: `/examples/<name>.html`, written by
 * `playground/scripts/gen-static.mjs` after `vite build`.
 *
 * These pages exist because no AI or search crawler executes JavaScript and the
 * editor's entire state lives in a `#z=` fragment the server never receives — so
 * they are the only form in which a plan can be indexed at all. Which means the
 * thing worth asserting is not that they look right but that they are COMPLETE
 * WITHOUT SCRIPT: one heading, an inlined drawing, the source, and no request for
 * an app asset. `vite build` cannot see any of that (it does not run the
 * generator's output), and the unit gate parses the generator's SOURCE rather than
 * its product.
 *
 * TAG `@prod` — WHOLE FILE. `.github/workflows/nightly.yml` re-runs the tagged
 * subset against the LIVE https://playground.archlang.uk, so a tag here is a
 * promise about production. Every case below keeps it: they navigate, read the DOM
 * and assert — nothing downloads, writes the clipboard, or depends on persisted
 * state.
 *
 * NB the `.html` in every URL is load-bearing. The site is served with
 * `html_handling: "none"` (exact-path lookup), so `/examples/studio` 404s and a
 * spec that dropped the extension would fail against production while passing
 * against a preview server that is more forgiving.
 */
test.describe("static example pages", { tag: "@prod" }, () => {
  test("serves one h1 and a compiled plan with no JavaScript at all", async ({ page }) => {
    // `waitUntil: "commit"` returns on the response's first bytes, before any
    // script could have run. Everything asserted after it is in the SERVED HTML —
    // which is all a crawler ever sees.
    await page.goto("/examples/studio.html", { waitUntil: "commit" });

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("ArchLang floor plan example");

    // The drawing is INLINE, not an <img>: it is text a crawler can read, and it
    // carries a name, since a bare <svg> is an unlabelled graphic to a screen reader.
    const svg = page.locator("figure.plan svg");
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute("role", "img");
    await expect(svg).toHaveAttribute("aria-label", /.+/);
    expect(await svg.locator("path, rect, line, polyline, polygon").count()).toBeGreaterThan(0);

    // The statistics sentence: describe()'s numbers, in prose, on the page.
    await expect(page.locator(".stats").first()).toContainText("This plan compiles to");

    // And the source that produced it, escaped into a <pre>.
    await expect(page.locator("pre.source")).toContainText("plan ");
  });

  test("boots with no console errors and no failed or 4xx requests", async ({ page }) => {
    // The sharp edge `base: "./"` leaves: a page one directory down that referenced
    // the app's relative `./assets/…` URLs would ask for `/examples/assets/…` and
    // 404. This is the case that would catch it, and it is why the pages carry
    // their own inline <style> instead of sharing the app's.
    const problems = watchForProblems(page);
    await page.goto("/examples/studio.html", { waitUntil: "networkidle" });

    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console.error output").toEqual([]);
    expect(problems.badResponses, "4xx/5xx responses").toEqual([]);
    expect(problems.failedRequests, "failed requests").toEqual([]);
  });

  test("carries a self-canonical link and parseable JSON-LD", async ({ page }) => {
    await page.goto("/examples/studio.html", { waitUntil: "commit" });

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute("href", "https://playground.archlang.uk/examples/studio.html");

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks).toHaveLength(1);
    const graph = JSON.parse(blocks[0]!) as { "@context": string; "@graph": Array<{ "@type": string }> };
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"].map((n) => n["@type"])).toContain("SoftwareSourceCode");
  });

  test("the index lists every example page and links back to the editor", async ({ page }) => {
    await page.goto("/examples/", { waitUntil: "commit" });
    await expect(page.locator("h1")).toHaveCount(1);
    const links = page.locator('ul.plans a[href^="/examples/"]');
    // The exact count is the table's business, not this spec's — assert the shape
    // (a real, grouped list) so adding an example never fails a spec that should
    // not have known the number.
    expect(await links.count()).toBeGreaterThanOrEqual(20);
    await expect(page.locator('ul.plans a[href="/examples/studio.html"]')).toHaveCount(1);
  });
});
