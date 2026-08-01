import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config for the playground.
 *
 * The unit suite (`playground/test/**` under the root vitest) proves the pure
 * logic; nothing proved that the assembled PAGE boots, compiles and downloads.
 * These specs drive the real bundle in a real Chromium.
 *
 * PREREQUISITE: the BUILT playground must exist. `webServer` below runs
 * `vite preview`, which only SERVES `playground/dist/` — it never builds. So the
 * full local/CI recipe is:
 *
 *     npm run build                 # the core, into dist/ (the playground aliases it)
 *     npm run playground:build:only # the playground, into playground/dist/
 *     npm run e2e:playground
 *
 * Serving the built bundle rather than the dev server is deliberate: it is the
 * artifact that actually deploys, so asset paths, chunk splitting and the
 * `base: "./"` rewrite are all under test.
 *
 * ESCAPE HATCH — `E2E_BASE_URL`: set it and the suite drives THAT origin with no
 * local server and no build at all (the `webServer` key is omitted, not disabled
 * — Playwright would otherwise still try to start it). The nightly workflow uses
 * this to run the READ-ONLY `@prod` subset against https://playground.archlang.uk,
 * which is why every spec navigates relatively (`page.goto("/")`) rather than to a
 * hardcoded localhost URL. Unset, everything below behaves exactly as before.
 */
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Every spec asserts on a shared, stateless page; they may run in parallel.
  fullyParallel: true,
  // A `.only` left in a spec silently shrinks the suite — never let one reach CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The Copy link / Copy for LLM / Copy SVG buttons all go through
    // `navigator.clipboard`, which is permission-gated in Chromium.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  // Chromium only: the playground's browser requirements (CompressionStream for
  // the `#z=` codec, canvas rasterization, the clipboard API) are not what these
  // specs are testing — the app's own behaviour is. One engine, run fast.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Spread, not a `webServer: undefined` key: with an external base URL there is
  // nothing to start and nothing to build.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          // `cwd` is resolved against this config's directory, so this is the
          // playground workspace's own `vite preview` on its default port (4173).
          // `--strictPort` makes a clash fail loudly instead of silently moving to
          // 4174, which would hang the readiness probe until it timed out.
          //
          // NB the URL says `localhost`, not `127.0.0.1`: `vite preview` binds the
          // hostname, not the loopback address, so a 127.0.0.1 probe never connects.
          command: "npm run preview -- --port 4173 --strictPort",
          cwd: ".",
          url: "http://localhost:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
