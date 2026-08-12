import { expect, type Download, type Page, test } from "@playwright/test";
import { AUTOSAVE_KEY, SIMPLE_PLAN, setEditorSource, waitForPlan, watchStatus } from "./fixtures.js";

/** Sloppy but valid — `format()` must rewrite it, which is what makes the test honest. */
const UNFORMATTED = `plan "E2E" {
units mm
    wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
room id=main at (0,0) size 6000x4000 label "Main"
      door at (3000,4000) width 900 wall exterior
}`;

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
    await expect(dialog.locator(".embed-link")).toHaveValue(/editable=1$/);

    await dialog.locator(".embed-copy[data-snippet='iframe']").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("<iframe");
    expect(copied).toContain("embed.html#");
    await expect(dialog).toHaveCount(0); // copying closes it
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
