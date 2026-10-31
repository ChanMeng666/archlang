import { expect, type Download, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { srcFromHash } from "../src/share.js";
import { AUTOSAVE_KEY, SIMPLE_PLAN, setEditorSource, waitForPlan, watchStatus } from "./fixtures.js";

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

/** Click `#download` for `format` and return the resulting browser download. */
async function downloadAs(page: Page, format: string): Promise<Download> {
  await page.locator("#format").selectOption(format);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  return download;
}

/** The downloaded bytes. */
async function payload(download: Download): Promise<Buffer> {
  const path = await download.path();
  return (await import("node:fs/promises")).readFile(path);
}

test.describe("header actions", () => {
  test("Format rewrites the source to canonical style", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, UNFORMATTED);
    // Record the status transitions BEFORE pressing: "Formatted" is painted over by
    // the reformat's own 250 ms debounced `render()`, so it cannot be polled for
    // live without racing it. See `watchStatus`.
    const status = await watchStatus(page);

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
    await page.locator("#formatSrc").click();
    await status.expectFlash("Already formatted");
  });

  test("Finish adds the sheet statements as one undoable edit and lists them in Lint", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // The same transform as `arch finish`: for this plan, paper/scale/dims/schedule/
    // legend and a title block, nothing left unresolved.
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finished: 6 changes (Ctrl+Z undoes)");
    const editor = page.locator(".cm-content");
    await expect(editor).toContainText("dims auto all");
    await expect(editor).toContainText('title { project "E2E" }');
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 })
      .toContain("paper A4 landscape");

    // The change log reads like Repair's, in the Lint tab.
    await page.locator("#tab-lint").click();
    const panel = page.getByRole("region", { name: "Finish results" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Finish — 6 changes");
    await expect(panel.locator("code", { hasText: "scale 1:50" })).toBeVisible();
    await expect(panel).not.toContainText("unresolved");

    // Idempotent: a finished sheet has nothing left to add — and a second press
    // leaves the log of what the first one did in place.
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
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // "Main" names no use, so it gets no piece, and its note carries `scope` (issue #370): no
    // "unresolved" in the flash, and Lint stays closed.
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finished: 6 changes (Ctrl+Z undoes)");
    await expect(page.locator("#tab-lint")).toHaveAttribute("aria-selected", "false");

    await page.locator("#tab-lint").click();
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
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Nothing to finish");
    await expect(panel).toContainText("Nothing to finish");
    await expect(panel.locator(".repair-outside code", { hasText: "main" })).toBeVisible();
  });

  test("Finish is its own undo step even straight after typing", async ({ page }) => {
    // CodeMirror merges adjacent changes made within 500 ms into one undo step. Typing
    // and then pressing Finish at once must still undo Finish ALONE, keeping the typing
    // — which only `isolateHistory` on the replacement guarantees.
    await page.goto("/");
    await waitForPlan(page);
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

  test("Finish that declines says so, opens Lint, and offers Reissue sheet", async ({ page }) => {
    // The flagship on its old A2 sheet (it is issued on A1 since fix/examples-sound) is too
    // small at 1:50: finish adds nothing and says why, and only a reissue may replace the
    // paper (the `arch finish --reissue` rule). The villa's halls and stores it leaves empty are
    // information, so the paper is the one note counted as unresolved here.
    const villaOnA2 = readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8");
    expect(villaOnA2.split("  paper A1 landscape").length, "the villa's sheet line, once").toBe(2);
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, villaOnA2.replace("  paper A1 landscape", "  paper A2 landscape"));
    // The editor draws only the lines in view: bring the sheet settings at the top into it.
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+Home");
    await expect(page.locator(".cm-content")).toContainText("paper A2 landscape");
    const status = await watchStatus(page);

    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await status.expectFlash("Finish added nothing: 1 unresolved (see Lint)");
    await expect(page.locator("#tab-lint")).toHaveAttribute("aria-selected", "true");
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
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);

    const note = page.locator("#chatNote");
    const summary = page.getByText("Ask AI");
    // The disclosure closes on Escape, like the Saved popover.
    await summary.click();
    await expect(note).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();

    for (const [name, base] of [
      ["Open in Claude ↗", "https://claude.ai/new"],
      ["Open in ChatGPT ↗", "https://chatgpt.com/"],
    ] as const) {
      await summary.click();
      // The panel says, next to the links, that they put the plan in the host's URL.
      await expect(note).toContainText("in the chat host's URL");
      await expect(note).toContainText("never sends");
      const link = page.getByRole("link", { name });
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
      await expect(note).toBeHidden(); // choosing a link closes the menu
    }
  });

  test("a chat link drops to the bare host on an edit and comes back on its undo", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    await page.getByText("Ask AI").click();
    await chatLinkReady(page, "Open in Claude ↗");
    // Read the link by its attribute: the menu closes once the editor is clicked.
    const link = page.locator('a[data-chat-host="claude"]');
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
    await page.getByText("Ask AI").click();
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
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, long);
    const status = await watchStatus(page);

    await page.getByText("Ask AI").click();
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
      // EVERY visible header item counts — the "⋯" menu is the last flex item and so the
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
      // title block is one row, as it was before Finish and Ask AI joined it.
      if (width >= 1280) expect(wrapped, `header items on a second row at ${width}px`).toEqual([]);
    }
  });

  test("Copy link puts a #z= permalink in the URL and on the clipboard", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    await page.locator("#copyLink").click();
    await status.expectFlash("Link copied");
    await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#z=/);

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("#z=");
    expect(copied).toBe(await page.evaluate(() => window.location.href));
  });

  test("Copy for LLM writes the spec preamble, the source and the facts", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    await page.locator("#copyLlm").click();
    await status.expectFlash("LLM prompt copied");

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
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);
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
    await page.locator("#copyLink").click();
    await status.expectFlash("Link copied");
    expect(target).toBe(await page.evaluate(() => navigator.clipboard.readText()));
  });

  test("Embed's Markdown for an unedited example shows its hosted drawing", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#examples").selectOption("Studio (1BR)");
    await expect(page.locator(".cm-content")).toContainText('plan "');
    await page.locator("#embed").click();
    const md = page.locator(".embed-dialog").getByLabel(/this example's drawing/);
    await expect(md).toHaveValue(
      /^\[!\[ArchLang floor plan\]\(https:\/\/archlang\.uk\/examples\/studio\.svg\)\]\(http[^)]*#(z|src)=[^)]+\)$/,
    );
    await page.locator(".embed-close").click();

    // A multi-storey example names the storey on screen, as the docs gallery does.
    await page.locator("#examples").selectOption("Hillside Villa");
    await expect(page.locator(".cm-content")).toContainText("paper A1 landscape");
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/this example's drawing/)).toHaveValue(
      /\(https:\/\/archlang\.uk\/examples\/hillside-villa\.L1\.svg\)/,
    );
    await page.locator(".embed-close").click();

    // Switch to the upper storey: the snippet follows the drawing on screen.
    await page.locator('#storeys button[data-level="2"]').click();
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/this example's drawing/)).toHaveValue(
      /\(https:\/\/archlang\.uk\/examples\/hillside-villa\.L2\.svg\)/,
    );
    await page.locator(".embed-close").click();

    // Under a View theme override the gallery drawing is not what is on screen: plain link.
    await page.locator("#theme").selectOption("blueprint");
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog").getByLabel(/not a theme override/)).toHaveValue(
      /^\[ArchLang floor plan/,
    );
  });
});

test.describe("downloads", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
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
});

test.describe("preview toolbar", () => {
  test("Copy SVG puts the export-clean markup on the clipboard", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const status = await watchStatus(page);
    await page.locator("button[data-pz='copysvg']").click();
    await status.expectFlash("SVG copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith("<svg")).toBe(true);
    expect(copied).not.toContain("data-span");
  });

  test("the Paths overlay changes the on-screen plan but leaves the export byte-identical", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const status = await watchStatus(page);

    await page.locator("button[data-pz='copysvg']").click();
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
    await page.locator("button[data-pz='copysvg']").click();
    await status.expectFlash("SVG copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exportBefore);
  });
});
