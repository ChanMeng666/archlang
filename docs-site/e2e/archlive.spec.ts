/**
 * `<ArchLive>` — the docs site's live compiler widget, driven in a real browser.
 *
 * The widget is the site's boldest claim: every ```` ```arch ```` fence in the docs is a real
 * compiler running in the reader's tab, not a screenshot. Three separate things have to
 * hold for that to be true, and NOTHING checked any of them: the SSR'd fallback has to swap
 * to a live editor on mount, an edit has to recompile, and "Open in Playground" has to mint
 * a link the playground can actually decode. The last one matters most: the `#z=` codec is
 * duplicated THREE times in this repo (playground/src/share.ts, scripts/gen-permalink.mjs
 * and this component's inline copy), and `test/share-codec.test.ts` welds the copies by
 * extracting this one's body and evaluating it. That is a static check. This is the runtime
 * one — the real button, in the real bundle, decoded by the playground's real codec.
 *
 * TAG `@prod` — ONE DESCRIBE ONLY: "the widget hydrates into a live compiler".
 * `.github/workflows/nightly.yml` re-runs the tagged subset against the LIVE
 * https://archlang.uk (`E2E_BASE_URL` + `--grep @prod`), and hydration is the case that
 * answers the production question — "is what is deployed a live compiler, or a dead <pre>?"
 * — by loading two pages and looking. The three describes below it are deliberately
 * UNTAGGED: they all TYPE into the widget (`setArchLiveSource`), including the XSS probe,
 * and the nightly subset is meant to stay small, read-only and boringly deterministic.
 * A new describe here does NOT get the tag by default — add it only if the case is pure
 * load-and-look.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
// The PLAYGROUND's canonical decoder, run here in Node: whatever the docs button mints must
// come back through it. Requires Node ≥21.2 for `DecompressionStream("deflate-raw")`; the
// e2e-docs CI job pins Node 22.
import { srcFromHash } from "../../playground/src/share.js";
import {
  archLiveSvg,
  labelledPlan,
  ROOT,
  RESIZED_PLAN,
  setArchLiveSource,
  waitForSvgChange,
  watchForProblems,
} from "./fixtures.js";

/** A page whose ArchLive comes from an explicit `<ArchLive :src>` (no fallback slot). */
const EXPLICIT_PAGE = "/guide";
/** A page whose ArchLives come from plain ```arch fences (fallback slot → swap on mount). */
const FENCE_PAGE = "/relational";

test.describe("the widget hydrates into a live compiler", { tag: "@prod" }, () => {
  test("a plain ```arch fence ships as a highlighted <pre> and becomes an editor on mount", async ({
    page,
    request,
  }) => {
    // 1. The bytes on the wire: the Shiki-highlighted fallback, readable with no JS at all.
    const ssr = await (await request.get(FENCE_PAGE)).text();
    expect(ssr, "the no-JS fallback must be in the SSR HTML").toContain("archlive-fallback");

    // 2. The same page, hydrated: the fallback is gone and a real editor + drawing is there.
    await page.goto(FENCE_PAGE);
    await expect(page.locator(".archlive").first()).toBeVisible();
    await expect(page.locator(".archlive-fallback")).toHaveCount(0);
    const editors = page.locator(".archlive-editor textarea");
    expect(await editors.count()).toBeGreaterThan(0);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();
  });

  test("an explicit <ArchLive> renders its plan and its facts line", async ({ page }) => {
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();
    // `facts` comes from describe() — proof the ANALYSIS layer ran in the browser too, not
    // just the renderer. (This line is also where a `describe()` signature change would
    // surface first; it silently degrades to "—" on a throw.)
    await expect(page.locator(".archlive-facts").first()).not.toHaveText("—");
    await expect(page.locator(".archlive-facts").first()).toContainText("rooms");
  });
});

test.describe("editing recompiles", () => {
  test("replacing the source redraws the plan", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();

    const before = await archLiveSvg(page, 0);
    expect(before.length).toBeGreaterThan(0);

    await setArchLiveSource(page, 0, RESIZED_PLAN);
    const after = await waitForSvgChange(page, 0, before);
    expect(after.length).toBeGreaterThan(0);

    expect(problems.pageErrors, "the widget must not throw while recompiling").toEqual([]);
  });

  test("a source with an error shows the message instead of a stale drawing", async ({ page }) => {
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();
    await setArchLiveSource(page, 0, 'plan "E2E" {\n  units mm\n  romo at (0,0) size 4000x3000\n}');
    // `svg` is "" whenever there are errors, so the error pane takes over — a reader never
    // sees a drawing that does not match the source in front of them.
    await expect(page.locator(".archlive-error").first()).toBeVisible();
    await expect(page.locator(".archlive-svg svg")).toHaveCount(0);
  });
});

test.describe("Open in Playground mints a decodable link", () => {
  test("the #z= payload round-trips back to exactly what is on screen", async ({ page }) => {
    // `openInPlayground` calls `window.open(url, "_blank", "noopener")`. Record the call
    // rather than letting a real tab navigate to the live playground: this asserts the
    // wiring AND the payload with no network dependency.
    await page.addInitScript(() => {
      (window as unknown as { __opened: unknown[] }).__opened = [];
      window.open = (...args: unknown[]) => {
        (window as unknown as { __opened: unknown[] }).__opened.push(args);
        return null;
      };
    });
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();

    // Use a source of our own so the assertion is on an exact, known string.
    const source = labelledPlan("Round Trip");
    await setArchLiveSource(page, 0, source);
    await page.locator(".archlive-open").first().click();

    const opened = (await page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened)) as Array<
      [string, string, string]
    >;
    expect(opened, "the button must call window.open exactly once").toHaveLength(1);
    const [url, target, features] = opened[0]!;
    expect(target).toBe("_blank");
    expect(features).toBe("noopener");
    expect(url.startsWith("https://playground.archlang.uk/#z=")).toBe(true);

    // THE POINT OF THIS SPEC: the playground's own decoder gets the source back, byte for
    // byte. A scheme drift in the component's inline copy (gzip for deflate-raw, standard
    // base64 for base64url, a stray `=` pad) fails here — and would otherwise show a reader
    // an empty playground with no error at all.
    expect(await srcFromHash(url.slice(url.indexOf("#")))).toBe(source);
  });

  test("the link survives a real example, not just a toy plan", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __opened: unknown[] }).__opened = [];
      window.open = (...args: unknown[]) => {
        (window as unknown as { __opened: unknown[] }).__opened.push(args);
        return null;
      };
    });
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();

    const source = readFileSync(join(ROOT, "examples", "studio.arch"), "utf8");
    await setArchLiveSource(page, 0, source);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();
    await page.locator(".archlive-open").first().click();

    const opened = (await page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened)) as Array<
      [string]
    >;
    const url = opened[0]![0];
    expect(await srcFromHash(url.slice(url.indexOf("#")))).toBe(source);
  });
});

test.describe("the v-html preview cannot be turned into an injection vector", () => {
  test("a hostile room label reaches the drawing as TEXT, not markup", async ({ page }) => {
    // ArchLive renders `compile().svg` through `v-html`, which is unescaped by construction.
    // That is safe ONLY because the SVG backend escapes every string it embeds — so this
    // asserts the property that makes the v-html defensible, at the level a reader sees it.
    const problems = watchForProblems(page);
    await page.goto(EXPLICIT_PAGE);
    await expect(page.locator(".archlive-svg svg").first()).toBeVisible();

    const payload = '<img src=x onerror="window.__pwned=1">';
    const before = await archLiveSvg(page, 0);
    await setArchLiveSource(page, 0, labelledPlan(payload));
    await waitForSvgChange(page, 0, before);

    const stage = page.locator(".archlive-svg").first();
    // No element was created from the payload…
    await expect(stage.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    // …and the markup carries the ESCAPED form, while the text layer reads back literally.
    expect(await stage.innerHTML()).toContain("&lt;img");
    expect(await stage.textContent()).toContain("<img src=x");

    expect(problems.dialogs, "injected markup must never open a dialog").toEqual([]);
    expect(problems.pageErrors).toEqual([]);
  });
});

/**
 * The editor paints ArchLang.
 *
 * The source pane is two layers: a coloured <pre> (from the GENERATED tokenizer,
 * .vitepress/theme/arch-highlight.js) and a transparent-text <textarea> over it. Before
 * this, ArchLive rendered a bare textarea in one flat colour — which is where nearly all
 * the ArchLang on the site lives, since every plain ```arch fence becomes one of these.
 * It was even handed the Shiki-highlighted <pre> as an SSR fallback and threw it away.
 *
 * The register assertions are the ones that matter: if the two layers disagree by even a
 * pixel on padding, size, leading or wrapping, coloured text slides out from under the
 * caret and the pane becomes unusable. UNTAGGED — it types, and the @prod subset stays
 * read-only.
 */
test.describe("the editor paints ArchLang, in register with the caret", () => {
  test("the coloured layer carries real tokens and shares the textarea's content box", async ({ page }) => {
    await page.goto(EXPLICIT_PAGE);
    const code = page.locator(".archlive-code").first();
    await expect(code.locator(".ahl-keyword").first()).toBeVisible(); // `plan`
    await expect(code.locator(".ahl-typename").first()).toBeVisible(); // `wall` / `room`
    await expect(code.locator(".ahl-string").first()).toBeVisible();
    await expect(code.locator(".ahl-comment").first()).toBeVisible();

    const d = await code.evaluate((el) => {
      const pre = el.querySelector("pre") as HTMLElement;
      const ta = el.querySelector("textarea") as HTMLTextAreaElement;
      const a = pre.getBoundingClientRect();
      const b = ta.getBoundingClientRect();
      const cs = (n: Element, p: string) => getComputedStyle(n).getPropertyValue(p);
      return {
        dx: a.left - b.left,
        dy: a.top - b.top,
        dw: a.width - b.width,
        dsh: pre.scrollHeight - ta.scrollHeight,
        // The text itself must be invisible, or it doubles the coloured layer.
        taFill: cs(ta, "-webkit-text-fill-color"),
        mismatched: [
          "font-family",
          "font-size",
          "line-height",
          "padding",
          "white-space",
          "overflow-wrap",
          "word-break",
          "tab-size",
          "letter-spacing",
        ].filter((p) => cs(pre, p) !== cs(ta, p)),
      };
    });
    expect(d.mismatched, "these properties differ between the two layers — glyphs will drift apart").toEqual([]);
    expect(Math.abs(d.dx)).toBeLessThan(0.5);
    expect(Math.abs(d.dy)).toBeLessThan(0.5);
    expect(Math.abs(d.dw)).toBeLessThan(0.5);
    expect(Math.abs(d.dsh), "the layers wrap to different heights").toBeLessThanOrEqual(24);
    expect(d.taFill).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test("colour tracks an edit, and hostile source stays text", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(EXPLICIT_PAGE);
    await setArchLiveSource(page, 0, 'plan "Recolour" {\n  units mm\n  # a fresh comment\n}');
    await expect(page.locator(".archlive-code .ahl-comment").first()).toHaveText("# a fresh comment");

    // The <pre> is rendered with v-html, so the tokenizer's escaping is load-bearing.
    await setArchLiveSource(page, 0, 'plan "X" {\n  units mm\n  # <img src=x onerror="window.__hl=1">\n}');
    const pre = page.locator(".archlive-code pre").first();
    await expect(pre.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __hl?: number }).__hl)).toBeUndefined();
    await expect(pre).toContainText("<img src=x");
    expect(problems.pageErrors).toEqual([]);
  });
});
