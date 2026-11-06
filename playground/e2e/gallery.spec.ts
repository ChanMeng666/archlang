import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CHECKS_SAMPLE, SAMPLE_GROUP } from "../src/samples.js";
import { splitLabel } from "../src/plan-label.js";
import {
  currentPlanCard,
  expectPlanNamed,
  gallery,
  galleryTrigger,
  gotoEdit,
  openGallery,
  pickPlan,
  planCard,
  SIMPLE_PLAN,
  setEditorSource,
  shareHash,
  waitForPlan,
} from "./fixtures.js";

/**
 * The plan gallery (card PG3, ruling PG-D2): the header's one way to choose a plan, replacing the
 * old <select> and the thumbnail strip under the stage. A `<details>` whose cards are in the
 * served page (scripts/gen-static.mjs), grouped and ordered as `EXAMPLE_ROWS` is, each a link to
 * the plan's static page, so it works with no script and a crawler follows every link; with
 * script a plain click opens the plan here. Untagged (no `@prod`): the nightly run against the
 * live site would fail on a deploy lag that is not a bug.
 */

/** `EXAMPLE_ROWS` (src/examples.ts), parsed as gen-static parses it: the order the gallery must keep. */
const ROWS = (() => {
  const src = readFileSync(new URL("../src/examples.ts", import.meta.url), "utf8");
  const block = /const EXAMPLE_ROWS = \[([\s\S]*?)\n\] as const;/.exec(src)?.[1] ?? "";
  return [...block.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",/g)].map((m) => ({
    name: m[1]!,
    label: m[2]!,
    group: m[3]!,
  }));
})();

const exampleCards = (page: Page) => page.locator("#gallery a.gal-card");
const panel = (page: Page) => page.locator("#galleryPanel");
const box = async (page: Page) => {
  const b = (await page.locator(".pz-viewport").boundingBox())!;
  return [b.x, b.y, b.width, b.height].map(Math.round);
};

test.describe("plan gallery", () => {
  test("is the header's one plan-choosing control, and there is no strip under the stage", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("#examples, #strip, #stripList, .strip-item")).toHaveCount(0);
    // No plan-choosing <select>: the header's only select is More's render theme.
    const pickers = await page.evaluate(() =>
      [...document.querySelectorAll("header select")].filter((s) => !s.closest(".tools-panel")).map((s) => s.id),
    );
    expect(pickers, "a <select> in the header outside its menus").toEqual([]);
    await expect(page.locator("header .gal-trigger")).toHaveCount(1);
    // The trigger: a grid glyph, the plan's name, a caret; it says what it controls.
    const trigger = galleryTrigger(page);
    await expect(trigger).toHaveText(/▦\s*Plan:\s*Laneway House\s*▾/);
    await expect(trigger).toHaveAttribute("aria-controls", "galleryPanel");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page)).toBeHidden();
    // The stage reaches the facts line: no row of thumbnails between them any more.
    const stage = (await page.locator(".pz-viewport").boundingBox())!;
    const facts = (await page.locator("#facts").boundingBox())!;
    expect(Math.abs(facts.y - (stage.y + stage.height)), "facts line right under the stage").toBeLessThanOrEqual(2);
  });

  test("lists every example in the table's groups and order, the default marked, and counts them in More", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPlan(page);
    expect(ROWS.length).toBeGreaterThan(1);
    const cards = await exampleCards(page).evaluateAll((as) =>
      as.map((a) => ({
        label: (a as HTMLElement).dataset.label,
        href: a.getAttribute("href"),
        group: a.closest<HTMLElement>(".gal-group")?.dataset.group,
      })),
    );
    expect(cards).toEqual(
      ROWS.map((r) => ({
        label: r.label,
        href: `/examples/${r.name}.html`,
        group: r.group,
      })),
    );
    await expect(currentPlanCard(page)).toHaveCount(1);
    await expect(currentPlanCard(page)).toHaveAttribute("data-label", "Laneway House");
    // The headings are the table's groups, in its order, then the samples' group: real headings,
    // so a screen reader can jump between groups (and still one H1 on the page).
    const groups = [...new Set(ROWS.map((r) => r.group))];
    await expect(page.locator("#gallery .gal-h")).toHaveText([...groups, SAMPLE_GROUP]);
    await openGallery(page);
    await expect(page.locator("#galleryPanel").getByRole("heading", { level: 2 })).toHaveText([
      ...groups,
      SAMPLE_GROUP,
    ]);
    await expect(page.locator("h1")).toHaveCount(1);
    await page.keyboard.press("Escape");
    // "All plans", and the More menu's count is the number of plans, not a typed figure.
    await expect(page.locator("#gallery a.gal-all")).toHaveAttribute("href", "/examples/");
    await expect(page.locator('#more a[href="/examples/"]')).toHaveText(`${ROWS.length} example plans`, {
      useInnerText: false,
    });
  });

  test("shows each card's clean name, a trailing parenthetical as a tag under it, named by the whole label", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openGallery(page);
    const tagged = ROWS.filter((r) => splitLabel(r.label).tag !== null);
    expect(tagged.length, "some labels carry a parenthetical").toBeGreaterThan(0);
    for (const r of ROWS) {
      const { name, tag } = splitLabel(r.label);
      const card = planCard(page, r.label);
      await expect(card.locator(".gal-name")).toHaveText(name);
      if (tag === null) await expect(card.locator(".gal-tag")).toHaveCount(0);
      else await expect(card.locator(".gal-tag")).toContainText(tag);
      // The link's name and its text are the label itself, never "Clinicplace ×6".
      await expect(card).toHaveAccessibleName(r.label);
      expect(await card.evaluate((c) => c.textContent)).toBe(r.label);
    }
    await expect(planCard(page, "Laneway House")).toHaveAccessibleName("Laneway House");
    const clinic = planCard(page, "Clinic (place ×6)");
    await expect(clinic).toHaveAccessibleName("Clinic (place ×6)");
    await expect(clinic.locator(".gal-name")).toHaveText("Clinic");
    // On screen the tag shows without its brackets (they are visually hidden).
    const shownTag = await clinic.locator(".gal-tag").evaluate((t) =>
      [...t.childNodes]
        .filter((n) => !(n instanceof Element && n.classList.contains("vh")))
        .map((n) => n.textContent)
        .join(""),
    );
    expect(shownTag).toBe("place ×6");
    // The tag is grey and smaller than the name.
    const [nameSize, tagSize] = await planCard(page, "Parametric (for loop)").evaluate((c) =>
      [".gal-name", ".gal-tag"].map((s) => Number.parseFloat(getComputedStyle(c.querySelector(s)!).fontSize)),
    );
    expect(tagSize!).toBeLessThan(nameSize!);
  });

  test("a click opens the plan here, updates the hash, names it on the trigger and closes", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();
    await openGallery(page);
    await expect(galleryTrigger(page)).toHaveAttribute("aria-expanded", "true");
    await planCard(page, "Two-bed flat").click();
    await expect(page).toHaveURL((u) => u.pathname === "/"); // not the static page
    await expect(panel(page)).toBeHidden();
    await expect(galleryTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(galleryTrigger(page)).toBeFocused();
    await expectPlanNamed(page, "Two-bed flat");
    await expect(page.locator("#planName")).toHaveText("Two-bed flat");
    await expect
      .poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before, { timeout: 5000 })
      .toBe(true);
    // The hash carries the plan picked, as it did for the old picker (a `#z=` token, no flag).
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#z=[A-Za-z0-9_-]+$/);
  });

  test("a modified click keeps the link's own meaning: a new tab, nothing changed here", async ({ page, context }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openGallery(page);
    const popup = context.waitForEvent("page");
    await planCard(page, "Museum (A1 sheet)").click({
      modifiers: ["ControlOrMeta"],
    });
    const tab = await popup;
    await tab.waitForLoadState("domcontentloaded");
    expect(new URL(tab.url()).pathname).toBe("/examples/museum.html");
    await tab.close();
    await expect(page).toHaveURL((u) => u.pathname === "/");
    await expectPlanNamed(page, "Laneway House");
  });

  test("keyboard: opens on the current card, arrows and Home/End move, Enter opens, Escape returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1422, height: 676 });
    await page.goto("/");
    await waitForPlan(page);
    await galleryTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await expect(planCard(page, "Laneway House")).toBeFocused();
    // One tab stop in the grid (a roving tabindex).
    const stops = await page
      .locator("#gallery .gal-card")
      .evaluateAll((cs) => cs.filter((c) => (c as HTMLElement).tabIndex === 0).length);
    expect(stops, "one tab stop in the grid").toBe(1);
    await page.keyboard.press("ArrowRight");
    await expect(planCard(page, ROWS[1]!.label)).toBeFocused();
    // Down moves to the next row of cards, Up back to the row above.
    const at = async () => (await page.locator("#gallery .gal-card:focus").boundingBox())!;
    const a = await at();
    await page.keyboard.press("ArrowDown");
    const b = await at();
    expect(b.y).toBeGreaterThan(a.y);
    await page.keyboard.press("ArrowUp");
    expect((await at()).y).toBeLessThan(b.y);
    await page.keyboard.press("End");
    await expect(planCard(page, CHECKS_SAMPLE)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(planCard(page, ROWS[0]!.label)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeHidden();
    await expectPlanNamed(page, ROWS[1]!.label);
    await expect(galleryTrigger(page)).toBeFocused();
    // Escape closes it and gives the focus back to the trigger.
    await page.keyboard.press("Enter");
    await expect(planCard(page, ROWS[1]!.label)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(galleryTrigger(page)).toBeFocused();
  });

  test("typing filters the cards by name, with an empty state", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openGallery(page);
    await expect(planCard(page, "Laneway House")).toBeFocused();
    await page.keyboard.type("house");
    const filter = page.locator("#galleryFilter");
    await expect(filter).toBeFocused();
    await expect(filter).toHaveValue("house");
    const want = ROWS.filter((r) => r.label.toLowerCase().includes("house")).map((r) => r.label);
    expect(want.length).toBeGreaterThan(1);
    await expect(page.locator("#gallery .gal-card:visible")).toHaveCount(want.length);
    const shown = await page
      .locator("#gallery .gal-card:visible")
      .evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.label));
    expect(shown).toEqual(want);
    // A group with no match is hidden whole.
    await expect(page.locator('#gallery .gal-group[data-group="Public buildings"]')).toBeHidden();
    // Down from the filter goes to the first match, and Enter opens it.
    await page.keyboard.press("ArrowDown");
    await expect(planCard(page, want[0]!)).toBeFocused();
    // The empty state is a live region always in the tree: silent while cards match…
    const empty = page.locator("#galleryEmpty");
    await expect(empty).toHaveAttribute("role", "status");
    await expect(empty).toHaveText("");
    // …and says so when nothing matches.
    await filter.fill("zzzz");
    await expect(empty).toHaveText("No plans match “zzzz”.");
    await expect(page.locator("#gallery .gal-card:visible")).toHaveCount(0);
    // Escape from the filter closes; the next open starts unfiltered.
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await openGallery(page);
    await expect(filter).toHaveValue("");
    await expect(empty).toHaveCount(1);
    await expect(empty).toHaveText("");
    await expect(page.locator("#gallery .gal-card:visible")).toHaveCount(ROWS.length + 1);
  });

  for (const [width, height] of [
    [1422, 676],
    [390, 844],
  ] as const) {
    test(`opening on a current plan far down the list shows its card, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await waitForPlan(page);
      const far = ROWS.at(-1)!.label; // the table's last row, the furthest example down
      await pickPlan(page, far);
      await openGallery(page);
      await expect(planCard(page, far)).toBeFocused();
      await expect(planCard(page, far)).toBeInViewport();
    });
  }

  test("a click outside or a Tab out closes it", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openGallery(page);
    // A point on the stage to the right of the open panel, checked to be outside it.
    const p = (await panel(page).boundingBox())!;
    const stage = (await page.locator(".pz-viewport").boundingBox())!;
    const at = { x: p.x + p.width + 40, y: stage.y + 40 };
    expect(at.x, "a point right of the panel, on the stage").toBeLessThan(stage.x + stage.width);
    expect(at.y).toBeGreaterThan(p.y);
    expect(at.y).toBeLessThan(p.y + p.height);
    await page.mouse.click(at.x, at.y);
    await expect(panel(page)).toBeHidden();
    await openGallery(page);
    // Tab: the card, then "All plans", then out of the gallery.
    await page.keyboard.press("Tab");
    await expect(page.locator("#gallery a.gal-all")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel(page)).toBeHidden();
  });

  test("no thumbnail is requested before the gallery first opens; then every one resolves and none moves the drawing", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const asked: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/examples/thumbs/")) asked.push(r.url());
    });
    await page.goto("/");
    await waitForPlan(page);
    await page.waitForTimeout(500);
    expect(asked, "thumbnails fetched before the gallery opened").toEqual([]);
    const srcs = await page
      .locator("#gallery img.gal-thumb")
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute("src")!));
    expect(srcs).toEqual(ROWS.map((r) => `/examples/thumbs/${r.name}.svg`));
    for (const src of srcs) {
      const res = await request.get(src);
      expect(res.status(), src).toBe(200);
      expect(res.headers()["content-type"], src).toContain("image/svg+xml");
    }
    // Lazy, with a declared intrinsic size, in a box whose size is fixed before any arrives.
    for (const attr of ["loading", "width", "height"]) {
      const missing = await page
        .locator("#gallery img.gal-thumb")
        .evaluateAll((imgs, a) => imgs.filter((i) => !i.getAttribute(a)).length, attr);
      expect(missing, `thumbnails with no ${attr}`).toBe(0);
    }
    const stage = await box(page);
    await openGallery(page);
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    const cardBox = await planCard(page, ROWS[0]!.label).boundingBox();
    // Bring every thumbnail in (the panel scrolls) and wait for all of them.
    await panel(page).evaluate((p) => {
      p.scrollTop = p.scrollHeight;
    });
    await expect
      .poll(() =>
        page
          .locator("#gallery img.gal-thumb")
          .evaluateAll(
            (imgs) =>
              imgs.filter((i) => !(i as HTMLImageElement).complete || !(i as HTMLImageElement).naturalWidth).length,
          ),
      )
      .toBe(0);
    await panel(page).evaluate((p) => {
      p.scrollTop = 0;
    });
    expect(await planCard(page, ROWS[0]!.label).boundingBox(), "a card after every thumbnail loaded").toEqual(cardBox);
    expect(await box(page), "the stage box after every thumbnail loaded").toEqual(stage);
  });

  test("opens as a full-width two-column sheet on a phone, with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForPlan(page);
    await openGallery(page);
    const sheet = (await panel(page).boundingBox())!;
    expect(sheet.x).toBeLessThanOrEqual(0.5);
    expect(sheet.width).toBeGreaterThanOrEqual(389);
    const { over, cols, inner } = await page.evaluate(() => {
      const p = document.getElementById("galleryPanel")!;
      const grid = p.querySelector(".gal-grid")!;
      return {
        over: document.documentElement.scrollWidth - window.innerWidth,
        cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        inner: p.scrollWidth - p.clientWidth,
      };
    });
    expect(over, "horizontal page overflow at 390px").toBeLessThanOrEqual(0);
    expect(inner, "the sheet scrolls sideways").toBeLessThanOrEqual(0);
    expect(cols).toBe(2);
    // Touch-sized: every card, the filter and "All plans".
    for (const loc of [planCard(page, "Laneway House"), page.locator("#galleryFilter")]) {
      expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator("#gallery a.gal-all").scrollIntoViewIfNeeded();
    expect((await page.locator("#gallery a.gal-all").boundingBox())!.height).toBeGreaterThanOrEqual(40);
    // A card opens the plan here, as on the desktop.
    await planCard(page, "Tiny House").click();
    await expect(panel(page)).toBeHidden();
    await expectPlanNamed(page, "Tiny House");
  });

  test("offers the Checks sample in its own group, and opens it", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickPlan(page, CHECKS_SAMPLE);
    await expect(page.locator("#planName")).toHaveText(CHECKS_SAMPLE);
    await expect(planCard(page, CHECKS_SAMPLE)).toHaveJSProperty("tagName", "BUTTON");
    await expect(planCard(page, CHECKS_SAMPLE).locator("xpath=ancestor::section[1]")).toHaveAttribute(
      "data-group",
      SAMPLE_GROUP,
    );
  });

  test("is in edit mode too, naming the plan a link opens when it is an example word for word", async ({ page }) => {
    await gotoEdit(
      page,
      await shareHash(readFileSync(new URL("../../examples/one-room.arch", import.meta.url), "utf8")),
    );
    await expect(galleryTrigger(page)).toBeVisible();
    await expectPlanNamed(page, "One room");
    await pickPlan(page, "Studio (1BR)");
    await expect(page.locator(".cm-content")).toContainText('plan "');
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
  });

  test("a shared plan that is no example: the trigger says so and no card is marked", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expectPlanNamed(page, { neutral: "Shared plan" });
    // Shown, never offered: there is no card for it.
    await openGallery(page);
    await expect(page.locator('#gallery .gal-card[data-label=""]')).toHaveCount(0);
    // Choosing an example names it again.
    await planCard(page, "One room").click();
    await expectPlanNamed(page, "One room");
    await expect(page.locator("#planName")).toHaveText("One room");
  });

  test("an edit that makes the plan no longer the example un-names it", async ({ page }) => {
    await gotoEdit(page);
    await expectPlanNamed(page, "Laneway House");
    const laneway = readFileSync(new URL("../../examples/laneway-house.arch", import.meta.url), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
    await setEditorSource(page, `${laneway}\n# edited\n`);
    await expectPlanNamed(page, { neutral: "Edited plan" });
    // Back to the example word for word (an undo would do the same): named again.
    await setEditorSource(page, laneway);
    await expectPlanNamed(page, "Laneway House");
  });
});

test.describe("plan gallery in the served bytes", () => {
  test("every example has a crawlable <a href> in the HTML before any script runs", async ({ page, request }) => {
    // The bytes a crawler gets: no script has run on them.
    const html = await (await request.get("/")).text();
    const hrefs = [...html.matchAll(/<a class="gal-card" href="(\/examples\/[\w-]+\.html)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(ROWS.map((r) => `/examples/${r.name}.html`));
    expect(html).toContain('<a class="gal-all" href="/examples/">');
    // The default is marked and named before hydration.
    expect(html).toMatch(/<a class="gal-card" href="\/examples\/laneway-house\.html" [^>]*aria-current="true"/);
    expect(html).toMatch(/id="planName">Laneway House</);
    // A tagged card's text reads as its label: hidden brackets around the tag, not "Clinicplace ×6".
    // Parsed as a document (DOMParser runs no script), as a crawler reads it.
    const clinic = await page.evaluate((h) => {
      const a = new DOMParser()
        .parseFromString(h, "text/html")
        .querySelector<HTMLAnchorElement>('a.gal-card[href="/examples/clinic.html"]');
      return { text: a?.textContent, label: a?.getAttribute("aria-label"), html: a?.innerHTML };
    }, html);
    expect(clinic.text).toBe("Clinic (place ×6)");
    expect(clinic.label).toBe("Clinic (place ×6)");
    expect(clinic.html).toContain('<span class="vh"> (</span>place ×6<span class="vh">)</span>');
    // The trigger's expanded state is the script's to set, from the real state: none is authored.
    expect(/<summary[^>]*id="planPicker"[^>]*>/.exec(html)?.[0]).not.toContain("aria-expanded");
  });
});

test.describe("plan gallery without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("opens by itself, and its cards are links to the static example pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#planName")).toHaveText("Laneway House");
    await galleryTrigger(page).click();
    await expect(gallery(page)).toHaveAttribute("open", "");
    await expect(panel(page)).toBeVisible();
    const links = exampleCards(page);
    expect(await links.count()).toBe(ROWS.length);
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const h of hrefs) expect(h).toMatch(/^\/examples\/[\w-]+\.html$/);
    await expect(currentPlanCard(page)).toHaveAttribute("href", "/examples/laneway-house.html");
    await links.nth(1).click();
    await expect(page).toHaveURL((u) => u.pathname === hrefs[1]);
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
