import { expect, type Download, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { srcFromHash } from "../src/share.js";
import {
  AUTOSAVE_KEY,
  chooseLink,
  downloadFromShare,
  gotoEdit,
  openMakeOwn,
  openMore,
  openShare,
  pickPlan,
  setEditorSource,
  shareHash,
  SIMPLE_PLAN,
  waitForPlan,
  watchStatus,
} from "./fixtures.js";

/*
 * The header actions live in two menus (ruling PG-D5): Format, Finish, Saved and the render theme in
 * More (⋯, `openMore`); the links, Embed and every export in Share (`openShare`). Open in Claude /
 * ChatGPT and Copy for LLM live in the Make-your-own sheet alone (`openMakeOwn`). Each case opens the
 * menu before an action, and a case that edits the source opens the page in edit mode (`gotoEdit`).
 */

/** Sloppy but valid — `format()` must rewrite it, which is what makes the test honest. */
const UNFORMATTED = `plan "E2E" {
units mm
    wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
room id=main at (0,0) size 6000x4000 label "Main"
      door at (3000,4000) width 900 wall exterior
}`;

/**
 * The plan source a chat prompt carries, decoded from the `#z=` token in it. Compares
 * SOURCES, never deflate bytes: the page compresses in Chromium and this runs in Node,
 * and two zlib builds may legitimately emit different bytes for the same input.
 */
async function planInPrompt(q: string): Promise<string | null> {
  const token = /#z=[A-Za-z0-9_-]+/.exec(q)?.[0];
  return token ? srcFromHash(token) : null;
}

/** Wait until a chat link carries the current plan (the encoding runs ahead of the click). */
async function chatLinkReady(page: Page, name: string): Promise<void> {
  await expect(page.getByRole("link", { name })).toHaveAttribute("data-ready", "true");
}

/** Download `format` from Share → Export and return the resulting browser download. */
const downloadAs = (page: Page, format: string): Promise<Download> => downloadFromShare(page, format);

/** The downloaded bytes. */
async function payload(download: Download): Promise<Buffer> {
  const path = await download.path();
  return (await import("node:fs/promises")).readFile(path);
}

test.describe("header actions", () => {
  test("Format rewrites the source to canonical style", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, UNFORMATTED);
    // Record the status transitions BEFORE pressing: "Formatted" is painted over by
    // the reformat's own 250 ms debounced `render()`, so it cannot be polled for
    // live without racing it. See `watchStatus`.
    const status = await watchStatus(page);

    await openMore(page);
    await page.locator("#formatSrc").click();
    await status.expectFlash("Formatted");
    // Canonical style is two-space body indentation under `plan { … }`.
    await expect(page.locator(".cm-content")).toContainText("units mm");
    const text = await page.locator(".cm-content").innerText();
    expect(text).not.toContain("      door");

    // The rewrite reaches the autosaved draft too, so a reload restores the
    // formatted source. This is its own assertion now — it used to double as the
    // "wait out the debounce before pressing again" settle, which `expectFlash` no
    // longer needs (a paint it already recorded cannot be overwritten).
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .not.toContain("      door");

    // Idempotent: a second press has nothing to do and says so.
    await openMore(page);
    await page.locator("#formatSrc").click();
    await status.expectFlash("Already formatted");
  });

  test("Finish adds the sheet statements as one undoable edit and lists them in Checks", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // The same transform as `arch finish`: for this plan, paper/scale/dims/schedule/
    // legend and a title block, nothing left unresolved.
    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finished: 6 changes (Ctrl+Z undoes)");
    const editor = page.locator(".cm-content");
    await expect(editor).toContainText("dims auto all");
    await expect(editor).toContainText('title { project "E2E" }');
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .toContain("paper A4 landscape");

    // The change log reads like Repair's, in the Checks tab's Lint section.
    await page.locator("#tab-checks").click();
    const panel = page.getByRole("region", { name: "Finish results" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Finish — 6 changes");
    await expect(panel.locator("code", { hasText: "scale 1:50" })).toBeVisible();
    await expect(panel).not.toContainText("unresolved");

    // Idempotent: a finished sheet has nothing left to add — and a second press
    // leaves the log of what the first one did in place.
    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Nothing to finish");
    await expect(panel).toContainText("Finish — 6 changes");

    // The log of an edit that is no longer there goes away: undo the whole Finish.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("dims auto all");
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .toBe(SIMPLE_PLAN);
    await expect(panel).toBeHidden();
  });

  test("A room finish has no pieces for is listed as information, and asks nothing", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // "Main" names no use, so it gets no piece, and its note carries `scope` (issue #370): no
    // "unresolved" in the flash, and the Checks tab stays closed.
    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finished: 6 changes (Ctrl+Z undoes)");
    await expect(page.locator("#tab-checks")).toHaveAttribute("aria-selected", "false");

    await page.locator("#tab-checks").click();
    const panel = page.getByRole("region", { name: "Finish results" });
    await expect(panel.locator(".repair-outside code", { hasText: "main" })).toBeVisible();
    await expect(panel.locator(".repair-outside")).toContainText("is outside the furnish table");
    await expect(panel).not.toContainText("unresolved");
    await expect(panel).not.toContainText("Left for you to resolve");
    await expect(panel.getByRole("button", { name: "Reissue sheet" })).toHaveCount(0);

    // A plan with nothing else to do is "Nothing to finish", and the room is still listed.
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .toContain("paper A4 landscape");
    const finished = (await page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY)) as string;
    await setEditorSource(page, `${finished}\n`);
    await expect(panel).toBeHidden();
    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Nothing to finish");
    await expect(panel).toContainText("Nothing to finish");
    await expect(panel.locator(".repair-outside code", { hasText: "main" })).toBeVisible();
  });

  test("Finish from view mode opens the editor first, so one Ctrl+Z restores the shared plan", async ({ page }) => {
    // A visitor on a shared link (view mode, no editor yet) presses ⋯ → Finish. The click
    // waits for the editor, then runs through it: Finish is an undo step, and undoing it puts
    // the shared plan back in the editor, the autosave and the hash.
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    const status = await watchStatus(page);
    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finished: 6 changes (Ctrl+Z undoes)");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    const editor = page.locator(".cm-content");
    await expect(editor).toContainText("dims auto all");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("dims auto all");
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .toBe(SIMPLE_PLAN);
    await expect
      .poll(async () => srcFromHash(await page.evaluate(() => location.hash)), { timeout: 10_000 })
      .toBe(SIMPLE_PLAN);
  });

  test("Finish is its own undo step even straight after typing", async ({ page }) => {
    // CodeMirror merges adjacent changes made within 500 ms into one undo step. Typing
    // and then pressing Finish at once must still undo Finish ALONE, keeping the typing
    // — which only `isolateHistory` on the replacement guarantees.
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n# typed");
    // Pressed from the page in the same breath as the typing: a Playwright click waits
    // for actionability and could land past the 500 ms window, making the test vacuous.
    await page.evaluate(() => document.getElementById("finishSrc")?.click());
    await expect(editor).toContainText("dims auto all");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("dims auto all");
    await expect(editor).toContainText("# typed");
    // Exactly the typed text on top of the plan (whatever indent Enter chose), no Finish.
    // ONE predicate, polled: the autosave is debounced 250 ms, so the draft saved while
    // Finish was applied (which also ends in "}\n# typed") can still be the stored one
    // for a moment after the undo; a loose match followed by a second read raced that.
    const isPlanPlusTyping = (saved: string | null) =>
      saved !== null &&
      saved.startsWith(`${SIMPLE_PLAN}\n`) &&
      /^[ \t]*# typed$/.test(saved.slice(SIMPLE_PLAN.length + 1));
    await expect
      .poll(async () => isPlanPlusTyping(await page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY)), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test("Finish that declines says so, opens Checks, and offers Reissue sheet", async ({ page }) => {
    // The flagship on its old A2 sheet (it is issued on A1 since fix/examples-sound) is too
    // small at 1:50: finish adds nothing and says why, and only a reissue may replace the
    // paper (the `arch finish --reissue` rule). The villa's halls and stores it leaves empty are
    // information, so the paper is the one note counted as unresolved here.
    const villaOnA2 = readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8");
    expect(villaOnA2.split("  paper A1 landscape").length, "the villa's sheet line, once").toBe(2);
    await gotoEdit(page);
    await setEditorSource(page, villaOnA2.replace("  paper A1 landscape", "  paper A2 landscape"));
    // The editor draws only the lines in view: bring the sheet settings at the top into it.
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+Home");
    await expect(page.locator(".cm-content")).toContainText("paper A2 landscape");
    const status = await watchStatus(page);

    await openMore(page);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finish added nothing: 1 unresolved (see Checks)");
    await expect(page.locator("#tab-checks")).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("region", { name: "Finish results" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("1 unresolved");
    await expect(panel.locator(".repair-un code", { hasText: "paper" })).toBeVisible();

    await panel.getByRole("button", { name: "Reissue sheet" }).click();
    await status.expectFlash("Finished: 1 change (Ctrl+Z undoes)");
    await expect(page.locator(".cm-content")).toContainText("paper A1 landscape");
    await expect(panel).toContainText("replaced");
    await expect(panel.getByRole("button", { name: "Reissue sheet" })).toHaveCount(0);
  });

  test("Open in Claude / ChatGPT prefill the chat host with the plan's share link", async ({ page, context }) => {
    // Never reach the real hosts: the test only reads the URL the link opened.
    await context.route(/^https:\/\/(claude\.ai|chatgpt\.com)\//, (route) =>
      route.fulfill({ contentType: "text/plain", body: "stub" }),
    );
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);

    const note = page.locator("#chatNote");
    // The links live in the Make-your-own sheet alone (ruling PG-D5); it closes on Escape.
    await openMakeOwn(page);
    await expect(note).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();

    for (const [name, base] of [
      ["Open in Claude ↗", "https://claude.ai/new"],
      ["Open in ChatGPT ↗", "https://chatgpt.com/"],
    ] as const) {
      await openMakeOwn(page);
      // The sheet says, next to the links, that they put the plan in the host's URL.
      await expect(note).toContainText("in the chat host's URL");
      await expect(note).toContainText("To keep the plan off every server, use Copy full link in Share");
      await expect(note).toContainText("Copy short link stores it on archlang.uk's server");
      const link = page.locator("#makeOwnDialog").getByRole("link", { name });
      await expect(link).toHaveAccessibleDescription(/in the chat host's URL/);
      await chatLinkReady(page, name);
      const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
      await popup.waitForURL((u) => u.href.startsWith(base));
      const url = new URL(popup.url());
      expect(`${url.origin}${url.pathname}`).toBe(base);
      expect([...url.searchParams.keys()]).toEqual(["q"]); // no tracking parameter
      const q = url.searchParams.get("q") ?? "";
      // The prompt carries this plan's share link (the real codec), and how to decode it.
      const origin = await page.evaluate(() => location.origin + location.pathname);
      expect(q).toContain(`${origin}#z=`);
      expect(await planInPrompt(q)).toBe(SIMPLE_PLAN);
      expect(q).toContain("zlib.decompress(");
      await popup.close();
      // The sheet stays open beside the chat it opened; Escape closes it.
      await expect(note).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(note).toBeHidden();
    }
    // One home: no chat link anywhere outside the sheet.
    await expect(page.locator("a[data-chat-host]:not(#makeOwnDialog *)")).toHaveCount(0);
  });

  test("a chat link drops to the bare host on an edit and comes back on its undo", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    await openMakeOwn(page);
    await chatLinkReady(page, "Open in Claude ↗");
    // Read the link by its attribute: the sheet is closed to reach the editor.
    const link = page.locator('a[data-chat-host="claude"]');
    await page.keyboard.press("Escape");
    await expect(page.locator("#makeOwnDialog")).toBeHidden();
    const planInHref = async () =>
      planInPrompt(new URL((await link.getAttribute("href")) ?? "about:blank").searchParams.get("q") ?? "");
    expect(await planInHref()).toBe(SIMPLE_PLAN);

    const editor = page.locator(".cm-content");
    await editor.click();
    // A selection move between setEditorSource's insert and the typed "x" closes the undo
    // group: CodeMirror merges adjacent typing under 500 ms apart into one step, and one
    // Ctrl+Z would then undo the whole plan, not just the "x".
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("x");
    // Stale at once: no ready mark, and the href is the bare host, never the old plan.
    await expect(link).not.toHaveAttribute("data-ready", "true");
    await expect(link).toHaveAttribute("href", "https://claude.ai/new");

    // Undo back to the encoded plan: the link is current again and carries it.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(link).toHaveAttribute("data-ready", "true");
    expect(await planInHref()).toBe(SIMPLE_PLAN);
  });
  test("the plan a first visit loads gets a prefilled link, with no edit and no hash yet", async ({
    page,
    context,
  }) => {
    await context.route(/^https:\/\/(claude\.ai|chatgpt\.com)\//, (route) =>
      route.fulfill({ contentType: "text/plain", body: "stub" }),
    );
    // Laneway House is the default; no hash in the URL yet.
    await page.goto("/");
    await waitForPlan(page);
    expect(await page.evaluate(() => location.hash)).toBe("");
    const defaultPlan = readFileSync(new URL("../../examples/laneway-house.arch", import.meta.url), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
    await openMakeOwn(page);
    await chatLinkReady(page, "Open in Claude ↗");
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: "Open in Claude ↗" }).click(),
    ]);
    await popup.waitForURL((u) => u.href.startsWith("https://claude.ai/new"));
    const q = new URL(popup.url()).searchParams.get("q") ?? "";
    expect(await planInPrompt(q)).toBe(defaultPlan);
  });

  test("a plan too long for a chat URL copies the full prompt and opens the host empty", async ({ page, context }) => {
    await context.route(/^https:\/\/(claude\.ai|chatgpt\.com)\//, (route) =>
      route.fulfill({ contentType: "text/plain", body: "stub" }),
    );
    // A comment of incompressible filler pushes the #z= hash past the URL cap.
    let seed = 7;
    const filler = Array.from({ length: 12_000 }, () => {
      seed = (seed * 48_271) % 2_147_483_647; // MINSTD: exact in a double
      return "abcdefghijklmnopqrstuvwxyz0123456789"[seed % 36];
    }).join("");
    const long = SIMPLE_PLAN.replace("units mm", `units mm\n  # ${filler}`);
    await gotoEdit(page);
    await setEditorSource(page, long);
    const status = await watchStatus(page);

    await openMakeOwn(page);
    // Encoded and current, so the copy is for length, not a click that beat the encoding.
    await chatLinkReady(page, "Open in ChatGPT ↗");
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: "Open in ChatGPT ↗" }).click(),
    ]);
    await status.expectFlash("Plan too long for a link: full prompt copied, paste it into ChatGPT");
    await popup.waitForURL((u) => u.href.startsWith("https://chatgpt.com/"));
    expect(popup.url()).toBe("https://chatgpt.com/");
    // The Copy-for-LLM prompt: readable source and facts, not a link to decode.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("This is an ArchLang floor plan");
    expect(copied).toContain("```arch");
    expect(copied).toContain(filler);
  });

  test("the header never scrolls sideways, and is one row from 1280px", async ({ page }) => {
    for (const width of [1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await waitForPlan(page);
      // EVERY visible header item counts — Make your own is the last flex item and so the
      // first to wrap. Items are vertically centred or stretched, so "one row" means each
      // item starts above the first cell's bottom edge, not that all tops are equal.
      const { scroll, client, wrapped } = await page.evaluate(() => {
        const h = document.querySelector("header")!;
        const items = [...h.children].filter(
          (c) => getComputedStyle(c).display !== "none" && !c.classList.contains("spacer"),
        );
        const firstBottom = items[0]!.getBoundingClientRect().bottom;
        return {
          scroll: h.scrollWidth,
          client: h.clientWidth,
          wrapped: items.filter((c) => c.getBoundingClientRect().top >= firstBottom - 1).map((c) => c.className),
        };
      });
      expect(scroll, `header overflows at ${width}px`).toBeLessThanOrEqual(client);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      // Below 1280 the cells may wrap (better than a sideways scroll); from 1280 up the
      // header is one row (ruling PG-D6): the h1 brand, the gallery, Source, Share, ⋯, Make your own.
      if (width >= 1280) expect(wrapped, `header items on a second row at ${width}px`).toEqual([]);
    }
  });

  test("Copy full link puts a #z= permalink in the URL and on the clipboard", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    await chooseLink(page, "full");
    await status.expectFlash("Link copied");
    await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#z=/);

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("#z=");
    // The page's own URL, less the edit-mode flag it carries while the editor is open: a link
    // someone is sent opens the drawing first.
    expect(await page.evaluate(() => window.location.hash)).toMatch(/^#z=[A-Za-z0-9_-]+&edit$/);
    expect(copied).toBe(await page.evaluate(() => window.location.href.replace(/&edit$/, "")));
    expect(copied).not.toMatch(/&edit/);
  });

  test("Copy for LLM writes the spec preamble, the source and the facts", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // In the Make-your-own sheet's "Continue this plan with your AI" (ruling PG-D5): choosing it
    // closes the sheet, copies, and says so.
    await openMakeOwn(page);
    const section = page.locator("#makeOwnDialog .mo-ask");
    await expect(section.getByRole("heading", { name: "Continue this plan with your AI" })).toBeVisible();
    await section.locator("#copyLlm").click();
    await expect(page.locator("#makeOwnDialog")).toBeHidden();
    await status.expectFlash("LLM prompt copied");
    // One home: More (⋯) and Share hold no Copy for LLM and no chat link.
    await expect(page.locator(":is(#more, #share) :is(#copyLlm, a[data-chat-host])")).toHaveCount(0);

    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("This is an ArchLang floor plan");
    expect(prompt).toContain("```arch");
    expect(prompt).toContain('room id=main at (0,0) size 6000x4000 label "Main"');
    expect(prompt).toContain("## Facts (from `describe`)");
    expect(prompt).toContain("## Diagnostics");
    // The spec pointer is what makes the prompt self-sufficient for a cold model.
    expect(prompt).toContain("https://archlang.uk/spec");
  });

  test("Embed builds a copyable iframe snippet pointing at embed.html", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openShare(page);
    await page.locator("#embed").click();

    const dialog = page.locator(".embed-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".embed-code")).toHaveValue(/embed\.html#(z|src)=/);
    await expect(dialog.locator(".embed-live")).toHaveValue(/editable=1$/);

    await dialog.locator(".embed-copy[data-snippet='iframe']").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("<iframe");
    expect(copied).toContain("embed.html#");
    await expect(dialog).toHaveCount(0); // copying closes it
  });

  test("Embed's Markdown for an edited plan is a link to the share URL, never an image of embed.html", async ({
    page,
  }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);
    await openShare(page);
    await page.locator("#embed").click();

    const dialog = page.locator(".embed-dialog");
    await expect(dialog.getByLabel(/Markdown link/)).toHaveValue(/^\[[^\]]+\]\(http[^)]*#(z|src)=[^)]+\)$/);
    await dialog.getByRole("button", { name: "Copy Markdown" }).click();
    await status.expectFlash("Markdown copied");

    const md = await page.evaluate(() => navigator.clipboard.readText());
    // An `embed.html` URL is an HTML page: as `![](…)` it renders as a broken image.
    expect(md).not.toContain("![");
    expect(md).not.toContain("embed.html");
    // The link target is the very URL Copy link would copy (same origin, same hash).
    const target = md.slice(md.indexOf("](") + 2, -1);
    await chooseLink(page, "full");
    await status.expectFlash("Link copied");
    expect(target).toBe(await page.evaluate(() => navigator.clipboard.readText()));
  });

  test("Embed's Markdown for an unedited example shows its hosted drawing", async ({ page }) => {
    await gotoEdit(page);
    await pickPlan(page, "Studio (1BR)");
    await expect(page.locator(".cm-content")).toContainText('plan "');
    await openShare(page);
    await page.locator("#embed").click();
    const md = page.locator(".embed-dialog").getByLabel(/this example's drawing/);
    await expect(md).toHaveValue(
      /^\[!\[ArchLang floor plan\]\(https:\/\/archlang\.uk\/examples\/studio\.svg\)\]\(http[^)]*#(z|src)=[^)]+\)$/,
    );
    await page.locator(".embed-close").click();

    // A multi-storey example names the storey on screen, as the docs gallery does.
    await pickPlan(page, "Hillside Villa");
    await expect(page.locator(".cm-content")).toContainText("paper A1 landscape");
    await openShare(page);
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/this example's drawing/)).toHaveValue(
      /\(https:\/\/archlang\.uk\/examples\/hillside-villa\.L1\.svg\)/,
    );
    await page.locator(".embed-close").click();

    // Switch to the upper storey: the snippet follows the drawing on screen.
    await page.locator('#storeys button[data-level="2"]').click();
    await openShare(page);
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/this example's drawing/)).toHaveValue(
      /\(https:\/\/archlang\.uk\/examples\/hillside-villa\.L2\.svg\)/,
    );
    await page.locator(".embed-close").click();

    // Under a View theme override the gallery drawing is not what is on screen: plain link.
    await openMore(page);
    await page.locator("#theme").selectOption("blueprint");
    await openShare(page);
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/not a theme override/)).toHaveValue(
      /^\[ArchLang floor plan/,
    );
  });
});

test.describe("downloads", () => {
  test.beforeEach(async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
  });

  test("SVG downloads real, annotation-free vector markup", async ({ page }) => {
    const download = await downloadAs(page, "svg");
    expect(download.suggestedFilename()).toBe("floorplan.svg");
    const text = (await payload(download)).toString("utf8");
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).toContain("</svg>");
    // The editor-only click-to-source annotations must never reach an export.
    expect(text).not.toContain("data-span");
  });

  test("TXT downloads the zero-dep ASCII plan", async ({ page }) => {
    const download = await downloadAs(page, "txt");
    expect(download.suggestedFilename()).toBe("floorplan.txt");
    const text = (await payload(download)).toString("utf8");
    // `renderAscii` draws the plan with box-drawing rules — assert the ART, not
    // just that bytes arrived, and that the room label made it into the text plan.
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain("─");
    expect(text).toContain("│");
    expect(text).toContain("Main");
    expect(text.split("\n").length).toBeGreaterThan(5);
  });

  test("DXF downloads a well-formed drawing file", async ({ page }) => {
    const download = await downloadAs(page, "dxf");
    expect(download.suggestedFilename()).toBe("floorplan.dxf");
    const text = (await payload(download)).toString("utf8");
    // A DXF is group-code/value pairs; every file opens with `0 / SECTION`.
    expect(text.replace(/\r\n/g, "\n").startsWith("0\nSECTION")).toBe(true);
    expect(text).toContain("ENTITIES");
    expect(text.replace(/\r\n/g, "\n")).toContain("0\nEOF");
  });

  test("PNG downloads non-empty raster bytes (smoke)", async ({ page }) => {
    const download = await downloadAs(page, "png");
    expect(download.suggestedFilename()).toBe("floorplan.png");
    const bytes = await payload(download);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG magic
  });

  test("PDF downloads non-empty document bytes (smoke)", async ({ page }) => {
    const download = await downloadAs(page, "pdf");
    expect(download.suggestedFilename()).toBe("floorplan.pdf");
    const bytes = await payload(download);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });

  test("PDF of a plan with a sheet is that paper's size", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(
      page,
      `plan "Sheet" {\n  units mm\n  paper A3 landscape\n  scale 1:100\n  room id=a at (0,0) size 4000x3000 label "A"\n}\n`,
    );
    await waitForPlan(page);
    const download = await downloadAs(page, "pdf");
    const box = (await payload(download)).toString("latin1").match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(box?.[1])).toBeCloseTo((420 / 25.4) * 72, 0);
    expect(Number(box?.[2])).toBeCloseTo((297 / 25.4) * 72, 0);
  });
});

/**
 * jsPDF (and the html2canvas it brings) loads on the first PDF download and at no other time
 * (card PG5a): not on boot, with the compiler, nor with the editor. The compiler chunk once
 * imported the jsPDF chunk statically for the bundler's shared helpers, so every visit paid ~129 KB
 * gzip for a PDF nobody asked for; the startup-chunks gate (preview3d.spec.ts) reads the build, and
 * this reads the network.
 */
test.describe("jsPDF loads only for a PDF", () => {
  const PDF_CHUNK = /\/assets\/(?:jspdf|html2canvas)[-.][^/]*\.js$/;
  const watchPdfChunks = (page: Page): string[] => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (PDF_CHUNK.test(r.url())) fetched.push(r.url());
    });
    return fetched;
  };
  const pdfDownloads = async (page: Page) => {
    const bytes = await payload(await downloadAs(page, "pdf"));
    expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  };

  test("view mode: not on boot, then on the first PDF download", async ({ page }) => {
    const fetched = watchPdfChunks(page);
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    // Another export is not a PDF: still nothing.
    await downloadAs(page, "svg");
    expect(fetched, "no jsPDF chunk is fetched on boot or for an SVG").toEqual([]);
    await pdfDownloads(page);
    expect(
      fetched.some((u) => /\/assets\/jspdf[-.]/.test(u)),
      "the PDF download fetched jsPDF",
    ).toBe(true);
  });

  test("edit mode: not with the editor, then on the first PDF download", async ({ page }) => {
    const fetched = watchPdfChunks(page);
    await gotoEdit(page);
    expect(fetched, "no jsPDF chunk is fetched with the editor").toEqual([]);
    await pdfDownloads(page);
    expect(
      fetched.some((u) => /\/assets\/jspdf[-.]/.test(u)),
      "the PDF download fetched jsPDF",
    ).toBe(true);
  });
});

/** The GLB note, word for word (glb-note.ts): what the browser writes, and that it does not check it. */
const GLB_NOTE =
  "The whole plan as a GLB, written in your browser and not validated here. npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb writes the same file and checks it with the Khronos glTF validator.";

/** A GLB's header and JSON chunk, read from its bytes; the glTF node names. */
function glbNodes(bytes: Buffer): string[] {
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("glTF");
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.subarray(16, 20).toString("latin1")).toBe("JSON");
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as {
    asset: { generator: string; version: string };
    nodes: Array<{ name: string }>;
  };
  expect(gltf.asset.version).toBe("2.0");
  // The package's own writer: its fixed generator.
  expect(gltf.asset.generator).toMatch(/^archlang-3d \d+\.\d+\.\d+$/);
  return gltf.nodes.map((n) => n.name);
}

test.describe("Share: one menu for the links, Embed and every export (ruling PG-D5)", () => {
  test("holds exactly the links, Embed and Export, the GLB note beside GLB", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openShare(page);
    const share = page.locator("#share");
    await expect(share.locator(".tools-h")).toHaveText(["Link", "Export"]);
    // ADR 0034's note, word for word, describes both link buttons.
    await expect(share.locator("#shareNote")).toHaveText(
      "A short link stores this plan on archlang.uk's server; the full link does not.",
    );
    for (const id of ["#copyShortLink", "#copyLink"])
      await expect(share.locator(id)).toHaveAttribute("aria-describedby", "shareNote");
    expect(
      await share
        .locator(".tools-panel button")
        .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())),
    ).toEqual([
      "Copy short link",
      "Copy full link",
      "Embed",
      "Copy SVG",
      "Copy PNG",
      "Download SVG",
      "Download PNG",
      "Download PDF",
      "Download DXF",
      "Download TXT",
      "Download GLB",
    ]);
    // GLB's note is visible subtext, and the button's description.
    const note = share.locator("#glbNote");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(GLB_NOTE);
    await expect(note.locator("code")).toHaveText("npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb");
    const glb = share.getByRole("button", { name: "Download GLB" });
    await expect(glb).toHaveAttribute("aria-describedby", "glbNote");
    await expect(glb).toHaveAccessibleDescription(GLB_NOTE);
    // Escape closes it; Share and More are never open together.
    await page.keyboard.press("Escape");
    await expect(share.locator(".tools-panel")).toBeHidden();
    await openShare(page);
    await openMore(page);
    await expect(share.locator(".tools-panel")).toBeHidden();
  });

  test("GLB downloads the whole plan without the 3D view ever opened, and the writer loads on the click", async ({
    page,
  }) => {
    const glbChunks: string[] = [];
    const chunks3d: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/glb-export-[^/]+\.js$/.test(r.url())) glbChunks.push(r.url());
      if (/\/assets\/preview3d-[^/]+\.js$/.test(r.url())) chunks3d.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("#preview3d")).not.toHaveClass(/\bactive\b/);
    expect(glbChunks, "the GLB writer is not fetched before the click").toEqual([]);
    expect(chunks3d, "nor the 3D chunk").toEqual([]);
    const download = await downloadFromShare(page, "glb");
    expect(download.suggestedFilename()).toBe("floorplan.glb");
    const names = glbNodes(await payload(download));
    expect(names).toContain("level:L1");
    expect(names.some((n) => n.startsWith("floor:"))).toBe(true);
    expect(glbChunks.length, "the GLB writer loads on the first click").toBe(1);
    expect(chunks3d, "GLB loads no three.js: the 3D view's chunk stays unloaded").toEqual([]);
    // Still on the drawing: exporting the GLB does not switch the view.
    await expect(page.locator("#preview")).toHaveClass(/\bactive\b/);
    expect(await page.evaluate(() => location.hash)).not.toMatch(/&3d/);
  });

  test("GLB from Share with the 3D view open writes the same bytes as without it", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const before = await payload(await downloadFromShare(page, "glb"));
    await page.locator("#view3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
    await page.waitForFunction(() => (window as { __preview3d?: unknown }).__preview3d !== undefined);
    // The 3D view's floating group has no GLB button any more: Share is its one home.
    await expect(page.locator("#preview3d").getByRole("button", { name: /GLB/ })).toHaveCount(0);
    await expect(page.locator("#preview3d").getByText(/GLB/)).toHaveCount(0);
    const after = await payload(await downloadFromShare(page, "glb"));
    expect(after.equals(before), "same plan, same GLB").toBe(true);
    // And opened on `&3d` from the start.
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
    await page.waitForFunction(() => (window as { __preview3d?: unknown }).__preview3d !== undefined);
    expect((await payload(await downloadFromShare(page, "glb"))).equals(before)).toBe(true);
  });

  test("GLB of a plan the 3D package refuses says why, and writes nothing", async ({ page }) => {
    const noWalls = `plan "No walls" {\n  units mm\n  room id=r at (0,0) size 3000x3000 label "Yard"\n}`;
    await page.goto(`/${await shareHash(noWalls)}`);
    await waitForPlan(page);
    let downloads = 0;
    page.on("download", () => downloads++);
    await openShare(page);
    await page.locator('#share [data-download="glb"]').click();
    await expect(page.locator("#status")).toHaveClass(/\berr\b/);
    // In view mode the diagnostics drawer is out of sight: the reason is on the stage, visible.
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    const statusText = page.locator("#statusText");
    await expect(statusText).toBeVisible();
    await expect(statusText).toHaveText(/^GLB export failed: no 3D preview: The plan has no walls/);
    await expect(page.locator("#errors")).toContainText("GLB export failed: no 3D preview: The plan has no walls");
    expect(downloads).toBe(0);
  });

  test("GLB says it is under way, and a double activation writes one file", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const status = await watchStatus(page);
    let downloads = 0;
    page.on("download", () => downloads++);
    await openShare(page);
    const glb = page.locator('#share [data-download="glb"]');
    // Two activations in one task, before the first has loaded anything: the second is ignored.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      glb.evaluate((b: HTMLElement) => {
        b.click();
        b.click();
      }),
    ]);
    await status.expectFlash("Preparing GLB…");
    expect(download.suggestedFilename()).toBe("floorplan.glb");
    // Once done, the button takes the next activation again; nothing else was written meanwhile.
    await expect(glb).not.toHaveAttribute("aria-busy", "true");
    await page.waitForTimeout(500);
    expect(downloads, "one download for a double activation").toBe(1);
    await expect(page.locator("#statusText")).not.toHaveText("Preparing GLB…");
  });
});

test.describe("Share → Export copies, and the stage toolbar", () => {
  test("Copy SVG puts the export-clean markup on the clipboard", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const status = await watchStatus(page);
    await openShare(page);
    await page.locator("#copySvg").click();
    await status.expectFlash("SVG copied");
    await expect(page.locator("#share .tools-panel")).toBeHidden(); // choosing it closes Share
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith("<svg")).toBe(true);
    expect(copied).not.toContain("data-span");
  });

  test("the Paths overlay changes the on-screen plan but leaves the export byte-identical", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const status = await watchStatus(page);

    await openShare(page);
    await page.locator("#copySvg").click();
    // Consume this copy's flash as well as asserting it: both presses paint the same
    // message, and without advancing the cursor the second assertion would be
    // satisfied by the first press — green whatever the second one did.
    await status.expectFlash("SVG copied");
    const exportBefore = await page.evaluate(() => navigator.clipboard.readText());
    const displayedBefore = await page.locator(".pz-stage svg").innerHTML();

    const paths = page.locator("button[data-pz='paths']");
    await paths.click();
    await expect(paths).toHaveAttribute("aria-pressed", "true");
    // The on-screen plan really does gain the circulation overlay…
    await expect.poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== displayedBefore).toBe(true);

    // …but the export re-compiles WITHOUT it, so a downloaded/copied file never
    // carries a diagnostic aid. Byte-identical, not merely "similar".
    await openShare(page);
    await page.locator("#copySvg").click();
    await status.expectFlash("SVG copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exportBefore);
  });

  test("Copy PNG puts a PNG image on the clipboard", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const status = await watchStatus(page);
    await openShare(page);
    await page.locator("#copyPng").click();
    await status.expectFlash("PNG copied");
    const head = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item!.getType("image/png");
      return [...new Uint8Array(await blob.slice(0, 8).arrayBuffer())]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    });
    expect(head).toBe("89504e470d0a1a0a"); // PNG magic
  });

  test("the stage toolbar holds no copy or download: zoom, fit, fullscreen, Checks and Paths only", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPlan(page);
    const toolbar = page.locator(".pz-toolbar");
    expect(await toolbar.locator("button").evaluateAll((bs) => bs.map((b) => b.textContent?.trim()))).toEqual([
      "−",
      "+",
      "⤢",
      "⛶",
      "Checks",
      "Paths",
    ]);
    await expect(toolbar.getByRole("button", { name: /SVG|PNG/ })).toHaveCount(0);
    await expect(page.locator("[data-pz='copysvg'], [data-pz='copypng']")).toHaveCount(0);
  });
});
