/**
 * Two things about the site's chrome that only a running browser can see.
 *
 * 1. THE OUTLINE STOPS WHERE THE ARTICLE STOPS. VitePress ships the "On this page"
 *    aside as `position: fixed` with `height: 100vh`, so it has no bottom bound at
 *    any scroll offset; our title-block footer is injected through `layout-bottom`,
 *    OUTSIDE the `.VPDoc` flex row, and carried none of the `position/z-index`
 *    defence VitePress's own `VPFooter` has. At the foot of a long page the outline
 *    links and the 32px curtain painted straight over PROJECT / DRAWN BY / LICENSE.
 *    `doc-pages.css` §8 re-bounds the aside with `position: sticky`; nothing in the
 *    build, the typecheck or the unit suite can tell whether that still holds, because
 *    the fault is entirely a matter of where boxes land at one scroll position.
 *
 *    The assertion is at PAINT level, not rect level: the aside is a scroll container,
 *    so a clipped link's layout rect legitimately sits below the box. `elementFromPoint`
 *    over the title block answers the only question that matters — is anything from the
 *    aside on top of it?
 *
 * 2. THE HERO DOES NOT OPEN WITH ITS ESSAY. `CompileSeam.vue` types the hero example
 *    at 90 chars/s and only paints the sheet when a typed line compiles, so
 *    `examples/laneway-house.arch`'s 7-line prose header was 5.3 seconds of empty
 *    paper. `stripHeaderComments` narrows what the ANIMATION types; the file, the
 *    gallery, the README and the `#z=` permalink are untouched (that last one is
 *    byte-compared in homepage-links.spec.ts — the two specs pull in opposite
 *    directions on purpose).
 *
 * Deliberately UNTAGGED (no `@prod`): both assert the state of the LOCAL build, and
 * against a lagging production deploy a red here would mean nothing.
 */
import { expect, test } from "@playwright/test";

/** Desktop widths where the aside is displayed at all (VitePress shows it from 1280). */
const WIDE = [
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/**
 * Sample a grid over the title block, inside the aside's own column, and report every
 * point where an element belonging to the aside is the topmost one.
 */
const asidePaintOverTitleBlock = () => {
  const ac = document.querySelector(".VPDoc .aside-container");
  const tb = document.querySelector(".tblock");
  if (!ac || !tb) return ["no .aside-container / .tblock on this page"];
  const a = ac.getBoundingClientRect();
  const t = tb.getBoundingClientRect();
  const hits: string[] = [];
  for (let x = Math.max(t.left + 1, a.left); x <= Math.min(t.right - 1, a.right); x += 8) {
    for (let y = t.top + 1; y < Math.min(t.bottom, window.innerHeight) - 1; y += 6) {
      const el = document.elementFromPoint(x, y);
      if (el?.closest(".VPDoc .aside")) hits.push(`(${Math.round(x)},${Math.round(y)}) → ${el.className}`);
    }
  }
  return hits;
};

test.describe("the On this page outline is bounded by its own column", () => {
  // /reference: a long page whose outline FITS the viewport. /errors: 130 outline
  // entries, so the aside scrolls internally — the case a `max-height` regression
  // would break. /showcase: short enough that the outline is nowhere near the fold.
  for (const route of ["/reference", "/errors", "/showcase"]) {
    for (const viewport of WIDE) {
      test(`nothing from the aside paints over the title block — ${route} @ ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize({ ...viewport });
        await page.goto(route);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(300);

        const hits = await page.evaluate(asidePaintOverTitleBlock);
        expect(
          hits,
          "the outline is painting on top of the title-block footer — doc-pages.css §8 " +
            "re-bounds `.aside-container` with `position: sticky`; a revert to VitePress's " +
            "`fixed` default (or a lost `.aside-content { min-height: 0 }`) brings this back",
        ).toEqual([]);

        const { asideBottom, titleTop } = await page.evaluate(() => ({
          asideBottom: document.querySelector(".VPDoc .aside-container")!.getBoundingClientRect().bottom,
          titleTop: document.querySelector(".tblock")!.getBoundingClientRect().top,
        }));
        expect(asideBottom, "the aside's box must end at or above the title block").toBeLessThanOrEqual(titleTop + 1);
      });
    }
  }

  test("a taller-than-the-viewport outline still scrolls inside the aside", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/errors");
    const scrollable = await page.evaluate(() => {
      const ac = document.querySelector(".VPDoc .aside-container") as HTMLElement;
      return { over: ac.scrollHeight - ac.clientHeight, pos: getComputedStyle(ac).position };
    });
    expect(scrollable.pos).toBe("sticky");
    expect(scrollable.over, "/errors' 130-entry outline must overflow the aside and stay scrollable").toBeGreaterThan(
      0,
    );
  });

  test("the outline does not jump between its unstuck and stuck states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reference");
    const topAt = async (y: number) => {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
      return page.evaluate(() =>
        Math.round(document.querySelector(".VPDocAside .outline-title")!.getBoundingClientRect().top),
      );
    };
    const atRest = await topAt(0);
    expect(await topAt(2000), "sticky `top` and the old fixed `padding-top` must place the outline identically").toBe(
      atRest,
    );
    expect(await topAt(8000)).toBe(atRest);
  });

  test("the title block carries the footer's own stacking guard", async ({ page }) => {
    await page.goto("/reference");
    const s = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".tblock")!);
      return { position: cs.position, zIndex: cs.zIndex };
    });
    expect(s).toEqual({ position: "relative", zIndex: "10" });
  });
});

test.describe("the hero types the plan, not its prose header", () => {
  // NB none of these waits out the animation. The stripped source is still 2 553
  // characters at 90 chars/s — a little over 28 s — so "wait for `compiled`" would
  // sit right on Playwright's 30 s test timeout and turn a passing guard into a
  // stopwatch. Each case below reads the state it actually needs instead.

  test("the whole source the hero will type is the plan, header-free", async ({ page }) => {
    // `compile()` is isomorphic, so the SERVER renders the full, settled source —
    // the same string `play()` then types back one character at a time. Reading it
    // there is byte-exact and costs no animation at all. reduced-motion is also the
    // state a visitor who asked for no motion sees, so this doubles as that check:
    // final source, final drawing, nothing moving.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".code-chrome__status")).toHaveText("compiled");
    const typed = (await page.locator(".code-pre code").textContent()) ?? "";
    expect(typed.trimStart().startsWith('plan "Laneway House" {')).toBe(true);
    expect(typed, "the 7-line prose header must not reach the hero").not.toContain("A one-bedroom laneway cottage");
    // The comments AT the decisions stay — they are half of what the hero demonstrates.
    expect(typed).toContain("is walked lane→garden");
    expect(typed).toContain("The rug is an UNDERLAY");
    await expect(page.locator(".sheet__svg svg")).toBeVisible();
  });

  test("the first characters typed are `plan`, not a comment", async ({ page }) => {
    await page.goto("/");
    // Wait only for the rewind plus the first line or so, never for the whole run.
    await page.waitForFunction(
      () => {
        const t = document.querySelector(".code-pre code")?.textContent ?? "";
        return t.length > 0 && t.length < 400;
      },
      null,
      { timeout: 20_000 },
    );
    const head = (await page.locator(".code-pre code").textContent()) ?? "";
    expect(head.startsWith("plan"), `the hero began typing "${head.slice(0, 40)}…"`).toBe(true);
  });

  test("the drawing is on the sheet before the typing finishes", async ({ page }) => {
    // The SSR'd page already carries the final SVG and `play()` blanks it on mount, so
    // "an svg exists" proves nothing. Watch for the blank and then for the re-ink, and
    // require the drawing back well before the ~33 s the full source takes to type.
    await page.addInitScript(() => {
      (window as unknown as { __ink: { blanked: number | null; reInk: number | null } }).__ink = {
        blanked: null,
        reInk: null,
      };
      const tick = () => {
        const s = (window as unknown as { __ink: { blanked: number | null; reInk: number | null } }).__ink;
        const host = document.querySelector(".sheet__svg");
        if (host && !host.querySelector("svg")) {
          if (s.blanked === null) s.blanked = performance.now();
        } else if (host && s.blanked !== null && s.reInk === null) {
          s.reInk = performance.now();
        }
        if (s.reInk === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForFunction(
      () => (window as unknown as { __ink: { reInk: number | null } }).__ink.reInk !== null,
      null,
      { timeout: 30_000 },
    );
    const ink = await page.evaluate(() => (window as unknown as { __ink: { blanked: number; reInk: number } }).__ink);
    // Measured from the rewind, not from navigation, so a slow CI box cannot move it:
    // the header used to cost 5.3 s here. A 2 s budget is generous for the ~0.3 s the
    // first `plan …` line now takes and still fails loudly if the header comes back.
    expect(ink.reInk - ink.blanked, "the sheet stayed empty too long after the hero rewound").toBeLessThan(2000);
  });
});
