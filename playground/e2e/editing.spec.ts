import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  ARC_RADIUS_ERROR_PLAN,
  AUTOSAVE_KEY,
  BROKEN_PLAN,
  gotoEdit,
  RESIZED_PLAN,
  SIMPLE_PLAN,
  setEditorSource,
} from "./fixtures.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

/**
 * The authoring loop, end to end in the browser: type → debounced recompile →
 * diagnostics as data → apply the machine-applicable fix → clean again. In edit mode
 * (`gotoEdit`), where the editor and the diagnostics drawer are.
 *
 * The fix button routes through the same `rankFixes` → `applyFixes` pair that
 * `arch fix` uses, so this is also the assertion that the page and the CLI make
 * the identical edit.
 */
test.describe("editing", () => {
  test("a typed edit recompiles the preview after the debounce", async ({ page }) => {
    await gotoEdit(page);

    await setEditorSource(page, SIMPLE_PLAN);
    await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).toBeTruthy();
    const first = await page.locator(".pz-stage svg").getAttribute("viewBox");

    // Same plan, 1.5x wider — the viewBox must move, which only a real recompile does.
    await setEditorSource(page, RESIZED_PLAN);
    await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).not.toBe(first);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
  });

  test("surfaces an E_ code in the diagnostics panel and applies its fix", async ({ page }) => {
    await gotoEdit(page);

    await setEditorSource(page, ARC_RADIUS_ERROR_PLAN);

    // Diagnostics are data, not a toast: the panel shows the catalogued code.
    const errors = page.locator("#errors");
    await expect(errors).toHaveClass(/show/);
    const row = errors.locator(".diagrow", { has: page.locator("code", { hasText: "E_ARC_RADIUS" }) });
    await expect(row).toBeVisible();
    await expect(page.locator("#status")).toHaveClass(/err/);
    // The remedy is visible without a click.
    await expect(row.locator(".diag-fix")).toBeVisible();

    // Apply it for real — the same edit `arch fix` would make.
    const apply = row.locator(".diag-apply");
    await expect(apply).toHaveAttribute("title", /minimum radius 2000/);
    await apply.click();

    // Source updated…
    await expect(page.locator(".cm-content")).toContainText("radius 2000");
    // …and the plan is clean: panel hidden, status recovered, plan drawn.
    await expect(errors).not.toHaveClass(/show/);
    await expect(errors.locator(".diagrow")).toHaveCount(0);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    await expect(page.locator(".pz-stage svg")).toBeVisible();
  });

  test("keeps the last good preview while the source is broken", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    const good = await page.locator(".pz-stage svg").getAttribute("viewBox");

    await setEditorSource(page, `plan "E2E" {\n  units mm\n  romo at (0,0) size 4000x3000\n}`);
    await expect(page.locator("#status")).toHaveClass(/err/);
    // main.ts returns early on an error — the stage still shows the last good plan.
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    expect(await page.locator(".pz-stage svg").getAttribute("viewBox")).toBe(good);
  });

  test("a diagnostic row jumps the editor caret to its source span", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, ARC_RADIUS_ERROR_PLAN);

    const row = page.locator("#errors .diagrow").first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-offset", /^\d+$/);
    await row.click();
    // The row discloses its catalogued cause/example…
    await expect(row).toHaveClass(/open/);
    // …and focus lands back in the editor at the offending span.
    await expect(page.locator(".cm-content")).toBeFocused();
  });

  test("the Checks tab's Lint section reports soundness separately from compile errors", async ({ page }) => {
    await gotoEdit(page);
    // A room with no door: reachable-room lint fires, but the plan still COMPILES.
    await setEditorSource(
      page,
      `plan "E2E" {\n  units mm\n  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=a at (0,0) size 6000x4000 label "Bedroom"\n}`,
    );
    await page.locator("#tab-checks").click();
    await expect(page.locator("#checksView")).toHaveClass(/active/);
    await expect(page.locator("#lint")).toBeVisible();
    await expect(page.locator("#lintOutput .lintrow, #lintOutput .ok")).not.toHaveCount(0);
    // Compiling cleanly and being architecturally sound are different questions.
    await expect(page.locator("#status")).not.toHaveClass(/err/);
  });
});

/**
 * Card MP6 (ruling MP-D6): the render's compile, describe and lint run in a Web Worker
 * (compile-worker.ts), so typing never freezes the page; the newest edit's drawing always wins; the
 * worker draws what the page drew, byte for byte; and a browser where the worker cannot run
 * compiles on the page, as before. `html[data-compiler]` says where the last render compiled.
 */
test.describe("compiling in a worker", () => {
  /** The start offset of the drawing's first annotated element (`data-span="start:end"`). */
  const firstSpan = async (page: Page) =>
    Number(((await page.locator(".pz-stage svg [data-span]").first().getAttribute("data-span")) ?? "").split(":")[0]);

  test("typing 20 characters into Hillside Villa holds the page for no task over 100 ms, and the last edit's drawing wins", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const villa = example("hillside-villa");
    await gotoEdit(page);
    // A comment line first: every character typed into it moves every span after it by one.
    await setEditorSource(page, `#\n${villa}`);
    await expect(page.locator("html")).toHaveAttribute("data-compiler", "worker");
    const before = await firstSpan(page);
    expect(before).toBeGreaterThan(1);
    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[]; __drawn: number[] };
      w.__longTasks = [];
      w.__drawn = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: "longtask" });
      // Every drawing put on the stage, by its first span: an older result never lands after a newer one.
      const stage = document.querySelector(".pz-stage")!;
      new MutationObserver(() => {
        const span = stage.querySelector("svg [data-span]")?.getAttribute("data-span");
        if (span) w.__drawn.push(Number(span.split(":")[0]));
      }).observe(stage, { childList: true });
    });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    const typed = "abcdefghijklmnopqrst";
    // Slower than the 250 ms debounce, so every character asks for a compile of its own.
    await page.keyboard.type(typed, { delay: 300 });
    const final = `#${typed}\n${villa}`;
    await expect
      .poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 60_000 })
      .toBe(final);
    // The drawing on screen is the final source's.
    expect(await firstSpan(page)).toBe(before + typed.length);
    const { longTasks, drawn } = await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[]; __drawn: number[] };
      return { longTasks: w.__longTasks, drawn: w.__drawn };
    });
    expect(drawn.length, "the drawing followed the typing").toBeGreaterThan(0);
    expect(drawn.at(-1)).toBe(before + typed.length);
    for (let i = 1; i < drawn.length; i++)
      expect(drawn[i]!, `drawing ${i} is no older than the one before it: ${drawn.join(", ")}`).toBeGreaterThanOrEqual(
        drawn[i - 1]!,
      );
    expect(
      Math.max(0, ...longTasks),
      `main-thread long tasks while typing: ${longTasks.map(Math.round).join(", ")} ms`,
    ).toBeLessThanOrEqual(100);
  });

  test("the worker draws what the page draws, byte for byte", async ({ browser }) => {
    test.setTimeout(120_000);
    const capture = async (page: Page, source: string) => {
      await setEditorSource(page, source);
      return page.evaluate(() => ({
        svg: document.querySelector(".pz-stage svg")?.outerHTML,
        facts: document.getElementById("facts")?.innerHTML,
        describe: document.getElementById("describe")?.innerHTML,
        lint: document.getElementById("lintOutput")?.innerHTML,
        errors: document.getElementById("errors")?.innerHTML,
        status: document.getElementById("statusText")?.textContent,
      }));
    };
    const inWorker = await browser.newPage();
    const onPage = await browser.newPage();
    // No Worker in this page: every render compiles on the page, as before card MP6.
    await onPage.addInitScript(() => {
      Object.defineProperty(window, "Worker", { value: undefined });
    });
    await gotoEdit(inWorker);
    await gotoEdit(onPage);
    for (const name of ["laneway-house", "townhouse", "hillside-villa"]) {
      const source = example(name);
      const a = await capture(inWorker, source);
      const b = await capture(onPage, source);
      expect(a.svg, `${name} is drawn`).toContain("<svg");
      expect(a, `${name}: the worker's render is the page's`).toEqual(b);
    }
    // A plan that does not compile reports the same errors either way.
    expect(await capture(inWorker, BROKEN_PLAN)).toEqual(await capture(onPage, BROKEN_PLAN));
    await expect(inWorker.locator("html")).toHaveAttribute("data-compiler", "worker");
    await expect(onPage.locator("html")).toHaveAttribute("data-compiler", "page");
    await inWorker.close();
    await onPage.close();
  });

  const failures: [string, () => void][] = [
    [
      "cannot be made",
      () => {
        (window as unknown as { Worker: unknown }).Worker = class {
          constructor() {
            throw new Error("Workers are blocked here");
          }
        };
      },
    ],
    [
      "fails to load",
      () => {
        (window as unknown as { Worker: unknown }).Worker = class extends EventTarget {
          constructor() {
            super();
            setTimeout(() => this.dispatchEvent(new Event("error")), 0);
          }
          postMessage() {}
          terminate() {}
        };
      },
    ],
    [
      // Stuck: loads, takes every request, answers none. The watchdog (WORKER_TIMEOUT_MS) stops it.
      "never answers",
      () => {
        (window as unknown as { Worker: unknown }).Worker = class extends EventTarget {
          postMessage() {}
          terminate() {}
        };
      },
    ],
  ];
  for (const [what, stub] of failures) {
    test(`a worker that ${what} falls back to compiling on the page, and editing still works`, async ({ page }) => {
      if (what === "never answers") test.slow(); // the first render waits out the watchdog
      await page.addInitScript(stub);
      await gotoEdit(page);
      await setEditorSource(page, SIMPLE_PLAN);
      await expect(page.locator("html")).toHaveAttribute("data-compiler", "page");
      const first = await page.locator(".pz-stage svg").getAttribute("viewBox");
      await setEditorSource(page, RESIZED_PLAN);
      await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).not.toBe(first);
      await expect(page.locator("#status")).not.toHaveClass(/err/);
      await setEditorSource(page, BROKEN_PLAN);
      await expect(page.locator("#status")).toHaveClass(/err/);
      await expect(page.locator("#errors .diagrow")).not.toHaveCount(0);
    });
  }
});
