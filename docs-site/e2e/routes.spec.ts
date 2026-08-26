/**
 * The docs site's MACHINE CONTRACT, checked against the built site before it ships.
 *
 * `llms.txt` tells agents that every doc page is fetchable as raw markdown by appending
 * `.md`, that the Plan/intent JSON schemas live at the site root, and that the GBNF grammar
 * is one GET away. That contract is implemented entirely by `sync-docs.mjs` dropping files
 * into `public/` plus VitePress's `srcExclude` keeping them out of page routing — a
 * one-character mistake in either silently turns a raw `/reference.md` into an HTML 404
 * page, and the site still builds, still deploys, still looks perfect to a human.
 *
 * `scripts/smoke.mjs` checks the same routes, but only AFTER a deploy is live. This runs
 * against `vitepress preview` in CI, so the breakage never reaches production.
 *
 * Every route list here is DERIVED from sync-docs.mjs (see fixtures.ts) — adding a page or
 * an example extends this suite automatically.
 *
 * TAG `@prod` — WHOLE FILE (one tag per describe, so a describe added later must opt in
 * explicitly). `.github/workflows/nightly.yml` re-runs the tagged subset against the LIVE
 * https://archlang.uk (`E2E_BASE_URL` + `--grep @prod`). Everything here is a plain GET or a
 * navigation, which is why the whole file qualifies — and against production it buys one
 * thing more than it does in CI: the byte-equality cases below compare the DEPLOYED bytes
 * against the LOCAL checkout of `main`, so a docs deploy that silently went stale (a failed
 * build, a rolled-back deployment, a `public/` copy that never re-synced) fails here. That
 * staleness probe is the point, not an accident — do not relax those assertions to make a
 * red night green.
 */
import { expect, test } from "@playwright/test";
import {
  BANNER_MARKER,
  firstHeading,
  GALLERY_EXAMPLES,
  PAGE_ROUTES,
  readRepoFile,
  ROOT_COPY_ROUTES,
} from "./fixtures.js";

test.describe("the homepage renders", { tag: "@prod" }, () => {
  test("/ serves HTML carrying the hand-written agents band", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    // Prose in docs-site/index.md, not a component — it survives a theme refactor, which is
    // what makes it a stable "we got the real homepage, not a fallback" marker. The same
    // marker scripts/smoke.mjs uses against production.
    await expect(page.getByText("An interface, not just an image.")).toBeVisible();
  });
});

test.describe("machine-readable root artifacts", { tag: "@prod" }, () => {
  test("every ROOT_COPIES route is served and non-empty", async ({ request }) => {
    // Derived, so /llms.txt, /llms-full.txt, both schemas and the grammar are all covered
    // — and so is anything added to that table later.
    expect(ROOT_COPY_ROUTES.length).toBeGreaterThanOrEqual(5);
    for (const route of ROOT_COPY_ROUTES) {
      const res = await request.get(route);
      expect(res.status(), `${route} must be served`).toBe(200);
      expect((await res.text()).trim().length, `${route} must not be empty`).toBeGreaterThan(0);
    }
  });

  test("/llms-full.txt is the generated bundle, not an SPA fallback", async ({ request }) => {
    const body = await (await request.get("/llms-full.txt")).text();
    // The heading scripts/gen-llms-full.ts emits. An HTML 404 page would also be "non-empty".
    expect(body).toContain("# ArchLang — full agent context");
    expect(body).not.toContain("<!DOCTYPE html>");
  });

  test("/plan.schema.json parses and its $id points at the canonical host", async ({ request }) => {
    const schema = JSON.parse(await (await request.get("/plan.schema.json")).text());
    expect(String(schema.$id)).toContain("archlang.uk");
    expect(schema.$schema).toBeTruthy();
  });

  test("/intent.schema.json parses", async ({ request }) => {
    const schema = JSON.parse(await (await request.get("/intent.schema.json")).text());
    expect(schema.$schema).toBeTruthy();
    expect(String(schema.$id)).toContain("archlang.uk");
  });

  test("/archlang.gbnf is a grammar, not a page", async ({ request }) => {
    const body = await (await request.get("/archlang.gbnf")).text();
    // `.gbnf` is an extension VitePress does not know, so it is the one route most likely to
    // be mistaken for a page route (config.ts has to allow-list it in `ignoreDeadLinks`).
    // The grammar's own root rule proves we got the file.
    expect(body).toContain("root ::=");
    expect(body).not.toContain("<!DOCTYPE html>");
  });
});

test.describe("the raw /<page>.md copies serve the canonical markdown", { tag: "@prod" }, () => {
  test("there are as many routes as sync-docs publishes pages", () => {
    expect(PAGE_ROUTES.length).toBe(8);
  });

  for (const { route, source } of PAGE_ROUTES) {
    test(`${route} is ${source}, verbatim`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
      // A VitePress page 404 would come back as text/html; the raw copy must not.
      expect(res.headers()["content-type"] ?? "").toContain("markdown");
      const body = (await res.text()).replace(/\r\n/g, "\n");
      const canonical = readRepoFile(source);
      expect(body.trim().length).toBeGreaterThan(0);
      // The raw copy is the UNBANNERED body: machines get the repo's canonical bytes, not a
      // decorated variant. (The bannered copy is the SITE PAGE at `/<route>`, without `.md`.)
      expect(body, `${route} must not carry page()'s "generated from" banner`).not.toContain(BANNER_MARKER);
      // A readable first assertion — the heading names the doc, so a mix-up reads plainly…
      expect(firstHeading(body), `${route} is serving the wrong document`).toBe(firstHeading(canonical));
      // …and then the real contract: byte-for-byte the repo file.
      expect(body, `${route} is not a verbatim copy of ${source}`).toBe(canonical);
    });
  }
});

test.describe("the example gallery", { tag: "@prod" }, () => {
  test("the derived gallery is non-trivial and holds the flagships", () => {
    expect(GALLERY_EXAMPLES.length).toBeGreaterThan(5);
    for (const flagship of ["studio", "museum", "aquarium", "gallery-l", "laneway-house", "library"]) {
      expect(GALLERY_EXAMPLES).toContain(flagship);
    }
  });

  for (const name of GALLERY_EXAMPLES) {
    test(`/examples/${name}.svg is a compiled drawing`, async ({ request }) => {
      const res = await request.get(`/examples/${name}.svg`);
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body.trimStart().startsWith("<svg"), `expected SVG, got ${JSON.stringify(body.slice(0, 60))}`).toBe(true);
      // A compiled plan is never a stub: it always carries drawn geometry.
      expect(body).toContain("</svg>");
      expect(body.length).toBeGreaterThan(500);
    });
  }
});

/**
 * The title-block footer is injected at the `.Layout` root through the `#layout-bottom`
 * slot, which makes it a SIBLING of `.VPContent` rather than a child — so it inherits
 * none of VitePress's sidebar compensation and rendered from viewport left:0, underneath
 * the opaque `position: fixed` sidebar. On /guide that covered the brand mark, the blurb
 * and the first title-block cells ("DRAWN BY" read as "N BY"). doc-pages.css §12 re-applies
 * the offset via `.VPContent.has-sidebar ~ .tblock`.
 *
 * UNTAGGED: it sets a viewport and measures layout, which is not the "load and look"
 * shape the @prod nightly subset is for.
 */
test.describe("the title-block footer clears the sidebar", () => {
  for (const width of [1280, 1600]) {
    test(`at ${width}px no footer content sits under the fixed sidebar`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/guide");
      const sidebar = await page.locator(".VPSidebar").boundingBox();
      const inner = await page.locator(".tblock__inner").boundingBox();
      expect(sidebar, "a doc page must have a sidebar at ≥960px").not.toBeNull();
      expect(inner, "the title block must render on doc pages").not.toBeNull();
      expect(
        (inner as { x: number }).x,
        "the title block starts left of the sidebar's right edge — it is being clipped again",
      ).toBeGreaterThanOrEqual((sidebar as { x: number; width: number }).x + (sidebar as { width: number }).width);
    });
  }

  test("the home page footer stays full-bleed (there is no sidebar to clear)", async ({ page }) => {
    // The load-bearing half: this is what stops a future "just make it global" edit
    // from indenting the landing page's title block by a sidebar that is not there.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator(".VPContent.has-sidebar")).toHaveCount(0);
    const pad = await page.locator(".tblock").evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(pad).toBe("24px");
  });

  test("below 960px the sidebar is a drawer, so the footer keeps its own gutter", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 800 });
    await page.goto("/guide");
    const pad = await page.locator(".tblock").evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(pad).toBe("24px");
  });
});

/**
 * The landing page must not scroll sideways.
 *
 * Its three bands are pulled full-bleed with `calc(50% - 50vw)` (home.css), which mixes a
 * container-relative `50%` — scrollbar excluded — with a viewport-relative `50vw` —
 * scrollbar included. They come out exactly `100vw`, about a scrollbar wider than the
 * client area, so the page grew a horizontal scrollbar for a strip of pure background.
 * `.VPContent.is-home { overflow-x: clip }` swallows it.
 *
 * ## Why the CONTRACT is asserted and the symptom is only a bonus
 *
 * The obvious test — "scrollWidth must not exceed clientWidth" — PASSES WITHOUT THE FIX in
 * headless Chromium, which uses overlay scrollbars: with no scrollbar there is nothing to
 * overflow by, `100vw` equals the client width, and the bug is invisible. A gate that
 * cannot fail is worse than no gate, because the row still reads green. So the real
 * assertions are the two environment-independent halves of the contract — the wrapper
 * clips, and the bands are still full-bleed — and the measurement SKIPS LOUDLY when the
 * browser has no classic scrollbar to reproduce the bug with.
 *
 * `clip`, not `hidden`, is the load-bearing half: `overflow-x: hidden` with a visible
 * y-axis computes `overflow-y` to `auto`, turning the home page into a nested scroll
 * container — a second scrollbar and a broken `scrollIntoView` for every in-page anchor.
 *
 * UNTAGGED: it measures layout at a fixed viewport, not the load-and-look shape @prod is for.
 */
test.describe("the landing page does not scroll sideways", () => {
  test("the home wrapper clips the overhang, and clips rather than hides it", async ({ page }) => {
    await page.goto("/");
    const s = await page.locator(".VPContent.is-home").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { x: cs.overflowX, y: cs.overflowY, scrolls: el.scrollHeight > el.clientHeight + 2 };
    });
    expect(s.x, "the full-bleed bands are ~a scrollbar wider than the client area; this clips them").toBe("clip");
    expect(s.y, "`overflow-x: hidden` would compute this to `auto` — it must stay `clip`").toBe("visible");
    expect(s.scrolls, "the home wrapper must not be its own scroll container").toBe(false);
  });

  test("the bands still read as full bleed", async ({ page }) => {
    // The other half: clipping the overhang must not shrink the bands into the text column.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const client = await page.evaluate(() => document.documentElement.clientWidth);
    for (const sel of [".sheets", ".facts", ".agents"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${sel} must render on the home page`).not.toBeNull();
      expect((box as { width: number }).width, `${sel} is no longer full-bleed`).toBeGreaterThanOrEqual(client);
    }
  });

  for (const width of [1280, 1600]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        return { over: de.scrollWidth - de.clientWidth, bar: window.innerWidth - de.clientWidth };
      });
      // Overlay scrollbars (headless Chromium's default) cannot reproduce the bug — say so
      // instead of passing, so this row never reads as coverage it did not provide.
      test.skip(m.bar === 0, "this browser uses overlay scrollbars, so 100vw == the client width");
      expect(m.over, `the home page overflows its client width by ${m.over}px`).toBeLessThanOrEqual(0);
    });
  }
});
