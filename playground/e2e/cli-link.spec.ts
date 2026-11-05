import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { planLinks } from "../../src/cli/link.js";
import { decodePlanHash } from "../../src/cli/share-codec.mjs";
import { chooseLink, waitForPlan, watchStatus } from "./fixtures.js";

/**
 * `archlang link` opens the plan it was minted from.
 *
 * The CLI compresses with Node's zlib at level 9 and the browser decompresses with
 * `DecompressionStream`, so on a plan as long as the studio the bytes differ from what the
 * playground itself would write. The link is minted HERE, at test time, by the same function
 * the CLI and the MCP `link` tool call, from the real `examples/studio.arch`.
 *
 * The editor's text is read back through Copy full link: it re-encodes the editor's whole document
 * (a CodeMirror view only renders the lines on screen, so `.cm-content`'s text is not the
 * document), and decoding that copy must give the example byte for byte.
 */
const STUDIO = readFileSync(new URL("../../examples/studio.arch", import.meta.url), "utf8");
const { playground, embed } = planLinks(STUDIO);

/** The fragment of a minted URL, to load against whichever origin the suite drives. */
const fragment = (url: string): string => new URL(url).hash;

test.describe("archlang link", () => {
  test("the playground link opens examples/studio.arch in the editor, byte for byte", async ({ page }) => {
    // `arch link` mints `#z=<payload>&edit`: the playground opens in edit mode, source beside plan.
    expect(fragment(playground)).toMatch(/^#z=[A-Za-z0-9_-]+&edit$/);
    await page.goto(`/${fragment(playground)}`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator("#sourceToggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toContainText('plan "Studio 1BR" {');
    // No autosave or default example got in first.
    await expect(page.locator(".pz-stage svg")).toContainText("Studio");

    const status = await watchStatus(page);
    await chooseLink(page, "full");
    await status.expectFlash("Link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const hash = new URL(copied).hash;
    // The copy is a link to share: the plan, and no edit-mode flag.
    expect(hash).toMatch(/^#z=[A-Za-z0-9_-]+$/);
    expect(decodePlanHash(hash.slice("#z=".length))).toBe(STUDIO);
  });

  test("the embed link draws the same plan", async ({ page }) => {
    await page.goto(`/embed.html${fragment(embed)}`);
    await waitForPlan(page);
    await expect(page.locator(".pz-stage svg")).toContainText("Studio");
    await expect(page.locator("#embedErr")).toBeHidden();
  });
});
