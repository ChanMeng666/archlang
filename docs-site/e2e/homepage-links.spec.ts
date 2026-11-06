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
import { homeHero, ROOT } from "./fixtures.js";

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
    // the hero sheet + one per gallery plan + the facts band
    await expect(links).toHaveCount(1 + GALLERY_PLANS.length + 1);

    expect(await decode(await page.locator(".seam-hero .sheet__ctl--open").getAttribute("href"))).toBe(heroSource());
    expect(await decode(await page.locator(".facts__open").getAttribute("href"))).toBe(exampleSource(FACTS_PLAN));

    const items = page.locator(".home-gallery__item");
    await expect(items).toHaveCount(GALLERY_PLANS.length);
    for (let i = 0; i < GALLERY_PLANS.length; i++) {
      const item = items.nth(i);
      const src = (await item.locator("img").getAttribute("src")) ?? "";
      const pictured = /^\/examples\/([a-z0-9-]+)\.svg$/.exec(src)?.[1];
      expect(pictured, `gallery item ${i} draws ${src}, not an example`).toBe(GALLERY_PLANS[i]);
      const decoded = await decode(await item.locator("a.plan-open").getAttribute("href"));
      expect(decoded, `gallery item ${i} pictures ${pictured} but opens a different plan`).toBe(
        exampleSource(pictured as string),
      );
    }
  });

  test("every drawing the landing page asks for actually renders", async ({ page }) => {
    await page.goto("/");
    // The gallery plus the Why cards' three figures (one drawing, then two pairs).
    const imgs = page.locator(".home-gallery img, .why-card img");
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
