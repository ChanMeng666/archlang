/**
 * The `/3d` page (public-surfaces card X6): every plan the 3D manifest lists, each its drawing
 * beside its 3D preview (PS-D12), the replay behind its poster, the GLB as a download, and a
 * playground link that opens the pictured plan on the 3D preview (`&3d`). The plans and files are
 * read from `docs-site/public/3d/manifest.json` the way sync-docs.mjs reads them.
 *
 * UNTAGGED: it clicks (the replay facade), which is not the read-only shape `@prod` is for.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { srcFromHash } from "../../playground/src/share.js";
import { previewLines, ROOT, threeDAssets, VIEW3D_PARAM } from "./fixtures.js";

const ASSETS = threeDAssets(ROOT);
const source = (name: string) => readFileSync(join(ROOT, "examples", `${name}.arch`), "utf8").replace(/\r\n/g, "\n");

test.describe("the /3d page", () => {
  test("carries the package's two lines", async ({ page }) => {
    const lines = previewLines(ROOT);
    await page.goto("/3d");
    await expect(page.locator(".preview-line").first()).toHaveText(`${lines.lead} ${lines.rest} ${lines.download}`);
    await expect(page.locator(".preview-line--limits")).toHaveText(lines.limits);
  });

  test("shows every manifest plan beside its drawing, with its replay, GLB and links", async ({ page }) => {
    await page.goto("/3d");
    const items = page.locator(".plans3d__item");
    await expect(items).toHaveCount(ASSETS.length);
    for (let i = 0; i < ASSETS.length; i++) {
      const a = ASSETS[i]!;
      const item = items.nth(i);
      await expect(item.locator("h3")).toHaveText(`${a.name}.arch`);
      await expect(item.locator(".plans3d__frame > img")).toHaveAttribute("src", `/examples/${a.name}.svg`);
      await expect(item.locator("picture source")).toHaveAttribute("srcset", a.poster.webp);
      await expect(item.locator("picture img")).toHaveAttribute("src", a.poster.png);
      await expect(item.locator("picture img")).toHaveAttribute("loading", "lazy");
      // Poster first: no video element until the visitor asks for it.
      await expect(item.locator("video")).toHaveCount(0);
      if (a.video) await expect(item.locator(".plans3d__facade")).toHaveAttribute("href", a.video.mp4);
      else {
        // A plan published without a replay shows its poster alone, and no MP4 link.
        await expect(item.locator(".plans3d__facade")).toHaveCount(0);
        await expect(item.locator(".plans3d__mp4")).toHaveCount(0);
      }
      const glb = item.getByRole("link", { name: /^Download GLB \(\d+ kB\)$/ });
      await expect(glb).toHaveAttribute("href", a.glb.href);
      await expect(glb).toHaveAttribute("download", `${a.name}.glb`);
      const open = item.getByRole("link", { name: "Open in the playground (3D)" });
      const href = (await open.getAttribute("href")) ?? "";
      expect(href.startsWith("https://playground.archlang.uk/#z=")).toBe(true);
      expect(href.endsWith(`&${VIEW3D_PARAM}`)).toBe(true);
      expect((await srcFromHash(href.slice(href.indexOf("#"))))?.replace(/\r\n/g, "\n")).toBe(source(a.name));
      await expect(item.getByRole("link", { name: "Plan source" })).toHaveAttribute("href", `/examples/${a.name}.arch`);
    }
  });

  test("pressing play puts the replay in place of its poster", async ({ page }) => {
    await page.goto("/3d");
    const item = page.locator(".plans3d__item").first();
    await item.locator(".plans3d__facade").click();
    const video = item.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute("src", ASSETS[0]!.video!.mp4);
    await expect(video).toHaveAttribute("controls", "");
    // The link to the file stays under the frame, now a plain link.
    const link = item.locator(".plans3d__mp4");
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Play the replay (MP4)");
    await expect(link).toHaveAttribute("href", ASSETS[0]!.video!.mp4);
  });

  test("a replay that cannot play puts its poster back, with the link to the MP4", async ({ page }) => {
    await page.goto("/3d");
    const item = page.locator(".plans3d__item").first();
    await item.locator(".plans3d__facade").click();
    await item.locator("video").dispatchEvent("error");
    await expect(item.locator("video")).toHaveCount(0);
    await expect(item.locator(".plans3d__facade picture img")).toBeVisible();
    await expect(item.locator(".plans3d__mp4")).toHaveAttribute("href", ASSETS[0]!.video!.mp4);
    // After a failure the poster is a plain link to the file; it does not try the video again.
    await expect(item.locator(".plans3d__facade")).toHaveAttribute("href", ASSETS[0]!.video!.mp4);
  });

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`no horizontal overflow at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/3d");
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});
