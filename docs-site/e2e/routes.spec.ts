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
    expect(PAGE_ROUTES.length).toBe(7);
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
