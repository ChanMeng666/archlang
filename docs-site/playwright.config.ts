import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config for the DOCS SITE.
 *
 * What this covers that nothing else does: the docs site's two contracts are
 * (a) the MACHINE routes it publishes — `/llms.txt`, `/llms-full.txt`, the two
 * JSON schemas, the GBNF grammar, a raw `/<page>.md` copy of every doc page and
 * one SVG per gallery example — and (b) the `<ArchLive>` widget, which compiles
 * ArchLang in the reader's browser. `npm run docs:build` proves the site
 * COMPILES; `scripts/smoke.mjs` proves the routes exist AFTER a deploy. Neither
 * runs the site, and nothing at all ran the widget. These specs do both, before
 * anything ships.
 *
 * PREREQUISITE: the BUILT site must exist. `webServer` runs `vitepress preview`,
 * which only SERVES `docs-site/.vitepress/dist/` — it never builds. The full
 * local/CI recipe is:
 *
 *     npm run build            # the core, into dist/ (the theme aliases it)
 *     npm run docs:build:only  # sync-docs + vitepress build
 *     npm run e2e:docs
 *
 * Serving the built output rather than the dev server is deliberate: SSR'd HTML,
 * hydration and the `public/` passthrough are all part of what is under test, and
 * only the production build exercises them the way a visitor does.
 *
 * ESCAPE HATCH — `E2E_BASE_URL`: set it and the suite drives THAT origin with no
 * local server and no build at all (the `webServer` key is omitted, not disabled
 * — Playwright would otherwise still try to start it). The nightly workflow uses
 * this to run the READ-ONLY `@prod` subset against https://archlang.uk, which is
 * why every spec navigates relatively (`page.goto("/")`, `request.get("/llms.txt")`)
 * rather than to a hardcoded localhost URL. Note what that turns the raw-`.md`
 * byte-equality cases into: they compare PRODUCTION's bytes against the LOCAL
 * checkout's, i.e. a deployment-staleness probe. Unset, everything below behaves
 * exactly as before.
 */
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Every spec asserts on a stateless page; they may run in parallel.
  fullyParallel: true,
  // A `.only` left in a spec silently shrinks the suite — never let one reach CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Chromium only: the site's own behaviour is what these specs test, not browser
  // support for `CompressionStream` (the `#z=` codec already has a documented
  // fallback and its own unit gate in test/share-codec.test.ts).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Spread, not a `webServer: undefined` key: with an external base URL there is
  // nothing to start and nothing to build.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          // 4174, not the Vite default 4173: that is the PLAYGROUND E2E's port
          // (playground/playwright.config.ts), and running both suites locally must not
          // have one silently answer the other's requests. `--strictPort` makes a clash
          // fail loudly instead of drifting to the next free port, which would hang the
          // readiness probe until it timed out.
          //
          // NB the URL says `localhost`, not `127.0.0.1`: the preview server binds the
          // hostname, not the loopback address, so a 127.0.0.1 probe never connects.
          command: "npm run preview -- --port 4174 --strictPort",
          cwd: ".",
          url: "http://localhost:4174/",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
