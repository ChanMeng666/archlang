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
 * 2. THE HERO TELLS BRIEF → SOURCE → PLAN. `CompileSeam.vue` opens on a real agent-gallery
 *    brief in a chat bubble, then streams the agent's ArchLang and paints the sheet as each
 *    line compiles, and the whole run settles within eight seconds. `stripHeaderComments`
 *    narrows what the ANIMATION streams; the file and its `#z=` permalink are untouched
 *    (byte-compared in homepage-links.spec.ts; the two specs pull in opposite directions on
 *    purpose).
 *
 * Deliberately UNTAGGED (no `@prod`): both assert the state of the LOCAL build, and
 * against a lagging production deploy a red here would mean nothing.
 */
import { expect, test } from "@playwright/test";
import { homeHero } from "./fixtures.js";

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

test.describe("the hero tells brief → source → plan, and finishes inside eight seconds", () => {
  // The pair the hero streams, as the build emitted it (home-data.js). The gallery behind it is not
  // pinned corpus, so this compares the page with the build, never with the gallery's files.
  const HERO = homeHero();
  const SOURCE = HERO.source.replace(/\r\n/g, "\n");

  test("the final state is server-rendered: the brief, the whole plan, the drawing", async ({ page }) => {
    // Reduced motion is the state a visitor who asked for no motion sees, and it is also the
    // SSR state: compile() is isomorphic, so the server renders the settled hero.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".seam-hero")).toHaveAttribute("data-phase", "settled");
    await expect(page.locator(".code-chrome__status")).toHaveText("compiled");
    if (HERO.brief) await expect(page.locator(".chat__bubble")).toHaveText(HERO.brief.trim());
    else await expect(page.locator(".chat__bubble"), "a fallback hero has no brief to show").toHaveCount(0);
    const typed = (await page.locator(".code-pre code").textContent()) ?? "";
    expect(typed.trimStart().startsWith('plan "')).toBe(true);
    // The header comment stays in the file and out of the stream.
    expect(typed).not.toContain(SOURCE.split("\n")[0]!);
    await expect(page.locator(".sheet__svg svg")).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.locator(".seam-hero"), "reduced motion must never start the run").toHaveAttribute(
      "data-phase",
      "settled",
    );
  });

  test("the run opens on the brief bubble, then streams the source, then settles within 8 s", async ({ page }) => {
    // Record every phase change with its time, and what the source pane held at that moment.
    await page.addInitScript(() => {
      type Mark = { phase: string; t: number; typed: number; bubble: boolean };
      const marks: Mark[] = [];
      (window as unknown as { __phases: Mark[] }).__phases = marks;
      const watch = () => {
        const hero = document.querySelector(".seam-hero");
        if (!hero) return requestAnimationFrame(watch);
        const note = () =>
          marks.push({
            phase: hero.getAttribute("data-phase") ?? "",
            t: performance.now(),
            typed: (document.querySelector(".code-pre code")?.textContent ?? "").length,
            bubble: !!document.querySelector(".chat__bubble")?.textContent?.trim(),
          });
        note();
        new MutationObserver(note).observe(hero, { attributes: true, attributeFilter: ["data-phase"] });
      };
      requestAnimationFrame(watch);
    });
    await page.goto("/");
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { __phases: { phase: string }[] }).__phases;
        return m.some((x) => x.phase === "brief") && m[m.length - 1]!.phase === "settled";
      },
      null,
      { timeout: 20_000 },
    );
    const marks = await page.evaluate(
      () =>
        (window as unknown as { __phases: { phase: string; t: number; typed: number; bubble: boolean }[] }).__phases,
    );
    const brief = marks.find((m) => m.phase === "brief")!;
    const typing = marks.find((m) => m.phase === "typing" && m.t >= brief.t)!;
    const settled = marks.filter((m) => m.phase === "settled" && m.t > brief.t).pop()!;
    expect(brief.typed, "the brief must arrive alone, before any source").toBe(0);
    expect(brief.bubble).toBe(!!HERO.brief);
    expect(typing.t).toBeGreaterThan(brief.t);
    expect(settled.t - brief.t, "the whole run must finish within 8 s").toBeLessThan(8000);
  });

  test("the first characters streamed are `plan`, not a comment", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => {
        const t = document.querySelector(".code-pre code")?.textContent ?? "";
        return t.length > 0 && t.length < 400;
      },
      null,
      { timeout: 20_000 },
    );
    const head = (await page.locator(".code-pre code").textContent()) ?? "";
    expect(head.startsWith("plan"), `the hero began streaming "${head.slice(0, 40)}…"`).toBe(true);
  });

  test("the drawing is back on the sheet soon after the source starts", async ({ page }) => {
    // The SSR'd page carries the final SVG and play() blanks it, so "an svg exists" proves
    // nothing: watch for the blank, then for the re-ink.
    await page.addInitScript(() => {
      const s = { blanked: null as number | null, reInk: null as number | null };
      (window as unknown as { __ink: typeof s }).__ink = s;
      const tick = () => {
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
      { timeout: 20_000 },
    );
    const ink = await page.evaluate(() => (window as unknown as { __ink: { blanked: number; reInk: number } }).__ink);
    // The brief holds the sheet blank for under a second; the first statements then draw.
    expect(ink.reInk - ink.blanked, "the sheet stayed empty too long after the hero rewound").toBeLessThan(3000);
  });
});

/**
 * 3. THE NAV BAR FITS THE VIEWPORT, MEASURED TWO WAYS BECAUSE ONE OF THEM IS BLIND.
 *
 *    VitePress reveals the whole desktop nav row the instant the hamburger is dismissed,
 *    at `min-width: 768px`. Our bar carries eight destinations — 684px of menu beside a
 *    105px title — and does not fit until 1152. `style.css` moves the reveal there.
 *
 *    The fault had two faces and only one of them scrolled, which is the reason this block
 *    asserts TWO metrics:
 *
 *    - Below 960 `.VPNav` is `position: relative`, so the overflowing row grows the
 *      document: `scrollWidth - clientWidth` was 272 at 768, 240 at 800, 140 at 900, on
 *      `/` and on every doc page alike.
 *    - At 960 VitePress makes `.VPNav` `position: fixed`, and **a fixed element's overflow
 *      never grows the document**. The row did not start fitting there — it started being
 *      CLIPPED at the viewport edge, silently, while `scrollWidth - clientWidth` read 0.
 *      The last item ("Ecosystem") overhung by +179 at 960, +139 at 1000, +115 at 1024 and
 *      +39 at 1100 on a doc page; its dropdown, anchored `right: 0` to a button half
 *      off-screen, opened where it could not be read.
 *
 *    So `scrollWidth` alone cannot gate this: it reports zero across the entire clipped
 *    band. The second metric — the last menu child's `getBoundingClientRect().right`
 *    against `clientWidth` — is the one that can see it, and a doc page is the tight case
 *    because `.content` reserves a 272px padding-left for the sidebar column.
 *
 *    Unlike the full-bleed-band gate in routes.spec.ts, neither metric here skips under
 *    overlay scrollbars: the overhang is hundreds of pixels, not one scrollbar. Both were
 *    verified non-vacuous by putting the breakpoint back and watching them go red.
 */
test.describe("the nav bar fits the viewport", () => {
  /** The five slots (PS-D6), as config.ts's `nav` spells them. */
  const NAV_SLOTS = ["Try it", "Gallery", "Docs", "Playground", "GitHub"] as const;

  /** The last real child of the desktop menu, or `null` when the hamburger is up. */
  const lastItemOverhang = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const items = [...document.querySelectorAll(".VPNavBarMenu > *")].filter(
        (e) => e.getBoundingClientRect().width > 3,
      );
      if (items.length === 0) return null;
      const r = items[items.length - 1]!.getBoundingClientRect();
      return Math.round(r.right) - document.documentElement.clientWidth;
    });

  // The band VitePress used to open the desktop row in, its edges, and the first width
  // where the row is meant to be back.
  for (const width of [768, 800, 900, 959, 960, 1000, 1024, 1100, 1151, 1152]) {
    for (const route of ["/", "/guide"]) {
      test(`${route} at ${width}px: no page overflow, and no nav item off the edge`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        const m = await page.evaluate(() => {
          const de = document.documentElement;
          return { over: de.scrollWidth - de.clientWidth };
        });
        expect(m.over, `${route} overflows its client width by ${m.over}px at ${width}px`).toBe(0);
        // The metric `scrollWidth` cannot provide: above 960 the nav is `position: fixed`,
        // so a too-wide row is clipped rather than scrolled and `over` stays 0.
        const overhang = await lastItemOverhang(page);
        if (overhang !== null) {
          expect(
            overhang,
            `the last nav item hangs ${overhang}px past the viewport on ${route} at ${width}px — ` +
              `clipped, not scrolled, so page overflow is still 0`,
          ).toBeLessThanOrEqual(0);
        }
      });
    }
  }

  for (const width of [375, 1024]) {
    test(`below 1152 (${width}px) the hamburger reaches every nav destination`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator(".VPNavBarHamburger")).toBeVisible();
      await expect(page.locator(".VPNavBarMenu")).toBeHidden();
      await page.locator(".VPNavBarHamburger").click();
      const screen = page.locator(".VPNavScreen");
      await expect(screen).toBeVisible();
      for (const item of NAV_SLOTS) {
        await expect(
          screen.getByText(item, { exact: true }).first(),
          `"${item}" is unreachable at ${width}px`,
        ).toBeVisible();
      }
    });
  }

  for (const width of [1152, 1440]) {
    test(`at ${width}px the desktop row is back, whole and on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/guide");
      await expect(page.locator(".VPNavBarHamburger")).toBeHidden();
      const menu = page.locator(".VPNavBarMenu");
      await expect(menu).toBeVisible();
      for (const item of NAV_SLOTS) {
        await expect(menu.getByText(item, { exact: true }).first(), `"${item}" left the desktop bar`).toBeVisible();
      }
      expect(await lastItemOverhang(page), `the desktop row is clipped at ${width}px`).toBeLessThanOrEqual(0);
    });
  }
});
