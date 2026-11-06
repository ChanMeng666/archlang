/**
 * The home page's drawings are DOORS into the playground, and its two primaries are on the
 * first screen.
 *
 * Every plan pictured on the landing page (the hero's agent-gallery pair, the home gallery and
 * the "Reads its own plans" band) carries an "Open in Playground" link whose `#z=` payload is
 * minted at BUILD time by `docs-site/sync-docs.mjs` (reusing `scripts/gen-permalink.mjs`'s
 * `encodePlanHash`). Nothing in a browser would notice if that map went stale or a card pointed
 * at a plan it is not showing, so this decodes every real href through the PLAYGROUND's own
 * decoder and byte-compares the result with the file on disk.
 *
 * Every count below is DERIVED from the components' own data arrays (read from their source
 * files), never typed: add a plan to the home gallery and this suite expects one more link.
 *
 * Deliberately UNTAGGED (no `@prod`): a production-vs-local source comparison would fail on a
 * normal deploy lag for a reason that is not a bug.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
// The playground's canonical decoder, run here in Node (Node ≥ 21.2 for deflate-raw; the
// e2e-docs CI job pins Node 22).
import { srcFromHash } from "../../playground/src/share.js";
import { HOME_3D_PLAN, homeHero, previewLines, ROOT, threeDAssets, VIEW3D_PARAM } from "./fixtures.js";

const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const THEME = ["docs-site", ".vitepress", "theme"];

const DOORS_FILE = JSON.parse(read("site-shared", "doors.json"));
const DOORS = DOORS_FILE.doors;
const PROMPT: string = DOORS_FILE.agentPrompt.join("\n");

/** The home gallery's plans, from HomeGallery.vue's PLANS table. */
const GALLERY_PLANS = [
  ...read(...THEME, "HomeGallery.vue").matchAll(/\{ example: "([^"]+)", caption: "[^"]+" \}/g),
].map((m) => m[1]!);
/** The facts band's plan, from FactsSection.vue. */
const FACTS_PLAN = /const PLAN = "([^"]+)"/.exec(read(...THEME, "FactsSection.vue"))![1]!;
/** The hero as the build emitted it (home-data.js): an agent-gallery pair, or its fallback. The
 *  gallery is not pinned corpus, so the hero is checked against the build, never its files. */
const HERO = homeHero();
/** The 3D preview's plans (public/3d/manifest.json), and the home band's. */
const ASSETS_3D = threeDAssets(ROOT);
const BAND = ASSETS_3D.find((a) => a.name === HOME_3D_PLAN)!;
/** The home gallery's cards that carry the 2D/3D swap: those whose plan has a 3D preview. */
const SWAP_PLANS = GALLERY_PLANS.filter((p) => ASSETS_3D.some((a) => a.name === p));

const exampleSource = (name: string) => read("examples", `${name}.arch`);
const heroSource = () => HERO.source.replace(/\r\n/g, "\n");

async function decode(href: string | null): Promise<string | null> {
  expect(href, "a playground link must be a real href, not a click handler").toBeTruthy();
  const s = await srcFromHash((href as string).slice((href as string).indexOf("#")));
  return s === null ? null : s.replace(/\r\n/g, "\n");
}

test.describe("every home-page drawing opens its own plan in the playground", () => {
  test("the derived tables are real", () => {
    expect(GALLERY_PLANS.length).toBeGreaterThanOrEqual(6);
    expect(GALLERY_PLANS.length).toBeLessThanOrEqual(8);
    expect(HERO.id).toBeTruthy();
    expect(FACTS_PLAN).toBeTruthy();
  });

  test("each `#z=` href decodes to the plan the page pictures beside it", async ({ page }) => {
    await page.goto("/");
    const links = page.locator('a[href*="playground.archlang.uk/#z="]');
    // the hero sheet + the 3D band + one per gallery plan + the facts band
    await expect(links).toHaveCount(1 + 1 + GALLERY_PLANS.length + 1);

    expect(await decode(await page.locator(".seam-hero .sheet__ctl--open").getAttribute("href"))).toBe(heroSource());
    // The 3D band pictures BAND's drawing and opens that plan, on the 3D preview (`&3d`).
    const band = page.locator(".same-source");
    expect(await band.locator(".same-source__fig--plan img").getAttribute("src")).toBe(`/examples/${BAND.name}.svg`);
    const bandHref = await band.locator(".same-source__open").getAttribute("href");
    expect(bandHref?.endsWith(`&${VIEW3D_PARAM}`), `${bandHref} must open the 3D preview`).toBe(true);
    expect(await decode(bandHref)).toBe(exampleSource(BAND.name));
    expect(await decode(await page.locator(".facts__open").getAttribute("href"))).toBe(exampleSource(FACTS_PLAN));

    const items = page.locator(".home-gallery__item");
    await expect(items).toHaveCount(GALLERY_PLANS.length);
    for (let i = 0; i < GALLERY_PLANS.length; i++) {
      const item = items.nth(i);
      // The plan drawing only: a card with a 3D preview also holds its poster (`.home-gallery__3d img`).
      const src = (await item.locator('img[data-role="plan"]').getAttribute("src")) ?? "";
      const pictured = /^\/examples\/([a-z0-9-]+)\.svg$/.exec(src)?.[1];
      expect(pictured, `gallery item ${i} draws ${src}, not an example`).toBe(GALLERY_PLANS[i]);
      // Its poster, if it has one, is the same plan's.
      const asset = ASSETS_3D.find((a) => a.name === pictured);
      await expect(item.locator(".home-gallery__3d img")).toHaveCount(asset ? 1 : 0);
      if (asset) expect(await item.locator(".home-gallery__3d img").getAttribute("src")).toBe(asset.poster.png);
      const decoded = await decode(await item.locator("a.plan-open").getAttribute("href"));
      expect(decoded, `gallery item ${i} pictures ${pictured} but opens a different plan`).toBe(
        exampleSource(pictured as string),
      );
    }
  });

  test("every drawing the landing page asks for actually renders", async ({ page }) => {
    await page.goto("/");
    // The gallery's drawings plus the Why cards' three figures (one drawing, then two pairs); the
    // gallery's 3D posters are checked with the swap, below.
    const imgs = page.locator('.home-gallery__art > img[data-role="plan"], .why-card img');
    await expect(imgs).toHaveCount(GALLERY_PLANS.length + 1 + 2 + 2);
    for (const img of await imgs.all()) {
      // Lazy: scroll it in and poll, rather than reading a 0 that only means "not asked for".
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);
      expect(await img.getAttribute("src"), "every drawing is served from the site's own routes").toMatch(
        /^\/(examples|gallery|home)\//,
      );
    }
  });

  test("the links are real hrefs that open in a new tab", async ({ page }) => {
    await page.goto("/");
    for (const a of await page.locator(".plan-open").all()) {
      expect(await a.getAttribute("href")).toMatch(/^https:\/\/playground\.archlang\.uk\/#z=/);
      expect(await a.getAttribute("target")).toBe("_blank");
      expect(await a.getAttribute("rel")).toContain("noopener");
    }
  });
});

/**
 * The front door: both primaries (ChatGPT and the agent prompt, PS-D2) are visible WITHOUT
 * scrolling at the two viewports peers are judged at, and the home never scrolls sideways.
 */
async function bottomOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} must render`).not.toBeNull();
  return box!.y + box!.height;
}

test.describe("home above the fold", () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`both primaries are above the fold at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const chatgpt = page.locator(".primary--chatgpt");
      await expect(chatgpt).toHaveAttribute("href", DOORS.chatgpt.url);
      await expect(chatgpt.locator(".primary__title")).toHaveText("Use it in ChatGPT");
      await expect(chatgpt).toContainText(DOORS.chatgpt.label);
      const prompt = page.locator(".primary--prompt");
      await expect(prompt.locator(".primary__title")).toHaveText("Copy the prompt for your agent");
      expect((await prompt.locator(".copybox__text").textContent())?.trim()).toBe(PROMPT);
      await expect(prompt.getByRole("button", { name: "Copy the prompt for your agent" })).toBeVisible();
      for (const sel of [".primary--chatgpt", ".primary--prompt"]) {
        expect(await bottomOf(page, sel), `${sel} ends inside the first screen`).toBeLessThanOrEqual(height);
      }
      // Equal weight: the two cards are the same width at both viewports.
      const [a, b] = [await chatgpt.boundingBox(), await prompt.boundingBox()];
      expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, "no horizontal overflow").toBeLessThanOrEqual(0);
    });
  }
});

/** The first-contact answers (V1 round 1): a way in for a newcomer, the checks, what a language gives. */
test.describe("the newcomer's questions", () => {
  test("the hero links /start, the check card links the catalogues, and the language paragraph", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".hero-links a[href='/start']")).toHaveText(/New here\? Get a floor plan from your AI/);
    const check = page.locator('.why-card[data-why="check"] .why-card__more');
    await expect(check.locator("a[href='/analysis']")).toHaveText("The checks →");
    await expect(check.locator("a[href='/errors']")).toHaveText("Error codes →");
    await expect(page.locator("#what-a-language-gives")).toHaveText("What writing it as a language gives you");
  });

  test("/start shows ChatGPT's example prompt and what comes back, and claude.ai's steps", async ({ page }) => {
    await page.goto("/start");
    const chatgpt = page.locator('.start-door[data-door="chatgpt"]');
    expect((await chatgpt.locator(".copybox__text").textContent())?.trim()).toBe(DOORS.chatgpt.example);
    await expect(chatgpt).toContainText(DOORS.chatgpt.returns);
    const claudeai = page.locator('.start-door[data-door="claudeai"]');
    await expect(claudeai.locator(".door__steps li")).toHaveText(DOORS.claudeai.steps);
    await expect(claudeai).toContainText(DOORS.claudeai.plansNote);
    // The footer's title block reads as words: a label and its value never run together.
    expect(await page.locator(".tblock").textContent()).toContain("Sheet 1 of 1");
  });
});

/** The feature sheets moved to /examples (D2); they still show and open the SAME plan. */
test.describe("the feature sheets on /examples", () => {
  const SHEET_SRC = read(...THEME, "SheetGrid.vue");
  const CARDS = (SHEET_SRC.match(/\bno: "A-\d+"/g) ?? []).length;
  const LEVEL_ART = [...SHEET_SRC.matchAll(/art: \{ levels: \[([\d, ]+)\] \}/g)].reduce(
    (n, m) => n + m[1]!.split(",").length - 1,
    0,
  );

  test("a sheet shows and opens the SAME plan", async ({ page }) => {
    await page.goto("/examples");
    const cards = await page.locator(".card").all();
    expect(cards.length, "the sheet gallery must render every SheetGrid card").toBe(CARDS);
    for (const card of cards) {
      const named = (await card.locator(".card__open-file").textContent())?.trim();
      if (!named) continue;
      const stem = named.replace(/\.arch$/, "");
      const art = await card
        .locator(".card__art img")
        .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute("src") ?? ""));
      expect(art.length, `card "${named}" draws nothing`).toBeGreaterThan(0);
      for (const src of art) expect(src).toMatch(new RegExp(`^/examples/${stem}(\\.L-?\\d+)?\\.svg$`));
      expect(await decode(await card.locator(".card__open").getAttribute("href"))).toBe(exampleSource(stem));
    }
  });

  test("every sheet drawing renders", async ({ page }) => {
    await page.goto("/examples");
    const imgs = page.locator(".card__art img");
    // one image per card, plus the extra storeys of each multi-storey card
    await expect(imgs).toHaveCount(CARDS + LEVEL_ART);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);
    }
  });
});

/**
 * The 3D band (card X6, PS-D12): the plan beside its replay, poster-first. The poster is a lazy
 * picture over a `preload="none"` video with no `poster` attribute (which a browser would fetch
 * eagerly); the MP4 loads when the band is at least half in view, where it plays muted, and it
 * pauses when the band leaves. Under reduced motion it never starts by itself. A video that cannot
 * play leaves the poster with a link to the MP4.
 *
 * `play()`, `pause()` and `paused` are stubbed to count the calls and fire the media events, so the
 * band's logic is tested without depending on the browser's H.264 decoder. With `__holdPlay` set, a
 * play() stays pending (no frame yet) until `__resolvePlay()`, as a slow load does.
 */
const STUB_MEDIA = () => {
  type V = HTMLMediaElement & { __paused?: boolean; __reject?: (e: unknown) => void; __start?: () => void };
  const w = window as unknown as {
    __plays: number;
    __pauses: number;
    __holdPlay?: boolean;
    __resolvePlay?: () => void;
  };
  w.__plays = 0;
  w.__pauses = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: V) {
      return this.__paused ?? true;
    },
  });
  HTMLMediaElement.prototype.play = function (this: V) {
    w.__plays++;
    this.__paused = false;
    const start = () => this.dispatchEvent(new Event("playing"));
    if (!w.__holdPlay) {
      start();
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.__reject = reject;
      w.__resolvePlay = () => {
        if (this.__paused) return;
        start();
        resolve();
      };
    });
  };
  HTMLMediaElement.prototype.pause = function (this: V) {
    w.__pauses++;
    this.__paused = true;
    this.__reject?.(new DOMException("The play() request was interrupted by a call to pause().", "AbortError"));
    this.__reject = undefined;
    this.dispatchEvent(new Event("pause"));
  };
};
const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: number }).__plays);
const pauses = (page: Page) => page.evaluate(() => (window as unknown as { __pauses: number }).__pauses);
const videoFrame = (page: Page) => page.locator(".same-source__frame--video");

test.describe("the 3D band", () => {
  test("carries the package's lines, the plan, and a poster-first replay", async ({ page }) => {
    const lines = previewLines(ROOT);
    await page.goto("/");
    const band = page.locator(".same-source");
    await expect(band.locator("h2")).toHaveText(lines.title);
    await expect(band.locator(".same-source__lede")).toHaveText(lines.rest);
    await expect(band.locator(".same-source__limits")).toHaveText(lines.limits);
    await expect(band.locator("a[href='/3d']")).toHaveText("What the 3D preview shows →");
    await expect(band.locator(".same-source__open")).toHaveText("Try it in the playground →");

    const video = band.locator("video");
    await expect(video).toHaveAttribute("preload", "none");
    expect(await video.getAttribute("autoplay"), "no autoplay attribute").toBeNull();
    expect(await video.getAttribute("poster"), "a poster attribute is fetched eagerly").toBeNull();
    expect(await video.evaluate((v) => (v as HTMLVideoElement).muted && (v as HTMLVideoElement).playsInline)).toBe(
      true,
    );
    await expect(video).toHaveAttribute("src", BAND.video!.mp4);
    // Until it fails, no link to the MP4: the video plays in place.
    await expect(band.locator(".same-source__mp4")).toHaveCount(0);
    const poster = band.locator(".same-source__poster");
    await expect(poster.locator("source")).toHaveAttribute("srcset", BAND.poster.webp);
    await expect(poster.locator("img")).toHaveAttribute("src", BAND.poster.png);
    await expect(poster.locator("img")).toHaveAttribute("loading", "lazy");
    // The frames reserve their 16:9 boxes, so nothing below moves when they load.
    for (const sel of [".same-source__fig--plan .same-source__frame", ".same-source__frame--video"]) {
      const box = await band.locator(sel).boundingBox();
      expect(Math.abs(box!.width / box!.height - 16 / 9), sel).toBeLessThan(0.02);
    }
  });

  test("the video is not fetched until it is asked for, and the poster is one image", async ({ page }) => {
    // A lazy image may load before it is on screen (Chromium starts some way below the
    // viewport), so the poster is allowed early; the MP4 is not.
    const fetched: string[] = [];
    page.on("request", (r) => fetched.push(new URL(r.url()).pathname));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await videoFrame(page).scrollIntoViewIfNeeded();
    await expect
      .poll(() => fetched.filter((p) => p === BAND.poster.webp || p === BAND.poster.png))
      .toEqual([BAND.poster.webp]);
    expect(fetched.filter((p) => p.startsWith("/3d/") && !p.includes(".poster."))).toEqual([]);
  });

  test("plays once half in view, pauses off-screen, and the button pauses it for good", async ({ page }) => {
    await page.addInitScript(STUB_MEDIA);
    await page.goto("/");
    const fig = page.locator(".same-source__fig--3d");
    await expect(fig).toHaveAttribute("data-state", "poster");
    expect(await plays(page)).toBe(0);
    await videoFrame(page).scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute("data-state", "playing");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(fig).toHaveAttribute("data-state", "paused");
    await videoFrame(page).scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute("data-state", "playing");
    const toggle = page.locator(".same-source__toggle");
    await expect(toggle).toHaveAccessibleName("Pause the replay");
    await toggle.click();
    await expect(fig).toHaveAttribute("data-state", "paused");
    // Paused by the visitor: scrolling away and back does not start it again.
    await page.evaluate(() => window.scrollTo(0, 0));
    await videoFrame(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await expect(fig).toHaveAttribute("data-state", "paused");
    await expect(toggle).toHaveAccessibleName("Play the replay");
  });

  test("a play still pending when the band leaves is paused, and the poster stays", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __holdPlay: boolean }).__holdPlay = true;
    });
    await page.addInitScript(STUB_MEDIA);
    await page.goto("/");
    const fig = page.locator(".same-source__fig--3d");
    await videoFrame(page).scrollIntoViewIfNeeded();
    await expect.poll(() => plays(page)).toBe(1);
    // No frame yet: still the poster.
    await expect(fig).toHaveAttribute("data-state", "poster");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => pauses(page)).toBe(1);
    // The load finishing off-screen does not start it: the pause rejected the pending play.
    await page.evaluate(() => (window as unknown as { __resolvePlay?: () => void }).__resolvePlay?.());
    await page.waitForTimeout(300);
    await expect(fig).toHaveAttribute("data-state", "poster");
    expect(await page.locator(".same-source video").evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);
    await expect(page.locator(".same-source__poster img")).toBeVisible();
  });

  test("a video that cannot play leaves the poster, with a link to the MP4", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const fig = page.locator(".same-source__fig--3d");
    await videoFrame(page).scrollIntoViewIfNeeded();
    await page.locator(".same-source video").dispatchEvent("error");
    await expect(fig).toHaveAttribute("data-state", "failed");
    await expect(page.locator(".same-source__poster img")).toBeVisible();
    await expect(page.locator(".same-source__toggle")).toHaveCount(0);
    const link = page.locator(".same-source__mp4");
    await expect(link).toHaveText("Play the replay (MP4)");
    await expect(link).toHaveAttribute("href", BAND.video!.mp4);
  });

  test("under reduced motion it stays on the poster until the play button is pressed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(STUB_MEDIA);
    await page.goto("/");
    const fig = page.locator(".same-source__fig--3d");
    await videoFrame(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(fig).toHaveAttribute("data-state", "poster");
    expect(await plays(page)).toBe(0);
    await expect(page.locator(".same-source__poster img")).toBeVisible();
    const toggle = page.locator(".same-source__toggle");
    await expect(toggle).toHaveAccessibleName("Play the replay");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(fig).toHaveAttribute("data-state", "playing");
    expect(await plays(page)).toBe(1);
  });
});

/** The gallery cards whose plan has a 3D preview swap their drawing for its poster (card X6). */
test.describe("the gallery's 2D/3D swap", () => {
  test("there is a card to swap (so the cases below are not vacuous)", () => {
    expect(SWAP_PLANS.length).toBeGreaterThan(0);
  });

  test("a card with a 3D preview shows its poster on hover, and its badge toggles it", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".home-gallery__item");
    for (let i = 0; i < GALLERY_PLANS.length; i++) {
      const item = items.nth(i);
      const has3d = SWAP_PLANS.includes(GALLERY_PLANS[i]!);
      await expect(item.locator(".home-gallery__badge")).toHaveCount(has3d ? 1 : 0);
      await expect(item.locator(".home-gallery__3d")).toHaveCount(has3d ? 1 : 0);
      if (!has3d) continue;
      const asset = ASSETS_3D.find((a) => a.name === GALLERY_PLANS[i])!;
      const poster = item.locator(".home-gallery__3d");
      await expect(poster.locator("source")).toHaveAttribute("srcset", asset.poster.webp);
      await expect(poster.locator("img")).toHaveAttribute("src", asset.poster.png);
      await expect(poster.locator("img")).toHaveAttribute("loading", "lazy");
      const opacity = () => poster.evaluate((el) => getComputedStyle(el).opacity);
      await item.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect.poll(opacity).toBe("0");
      await item.locator(".home-gallery__open").hover();
      await expect.poll(opacity).toBe("1");
      await page.mouse.move(0, 0);
      await expect.poll(opacity).toBe("0");
      // Keyboard and tap: the badge is a toggle button.
      const badge = item.locator(".home-gallery__badge");
      await expect(badge).toHaveAttribute("aria-pressed", "false");
      await badge.focus();
      await page.keyboard.press("Enter");
      await expect(badge).toHaveAttribute("aria-pressed", "true");
      await expect.poll(opacity).toBe("1");
      await page.keyboard.press("Space");
      await expect(badge).toHaveAttribute("aria-pressed", "false");
      await badge.click();
      await expect(badge).toHaveAttribute("aria-pressed", "true");
      // The poster loads, and the card's link still opens the plan it pictures.
      await expect
        .poll(() => poster.locator("img").evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
        .toBeGreaterThan(0);
      expect(await decode(await item.locator("a.plan-open").getAttribute("href"))).toBe(exampleSource(asset.name));
    }
  });

  test("under reduced motion the swap is instant", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const name of SWAP_PLANS) {
      const poster = page.locator(".home-gallery__item").nth(GALLERY_PLANS.indexOf(name)).locator(".home-gallery__3d");
      expect(await poster.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
    }
  });
});
