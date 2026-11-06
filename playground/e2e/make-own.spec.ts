import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { pickPlan, shareHash, waitForPlan } from "./fixtures.js";

/**
 * Make your own (card P5): the sheet of doors, read from `site-shared/doors.json` in its
 * `order.playground`, at equal weight; the two top-ask links; "Start from this plan", the one
 * control here that sends the plan to a server, and only when clicked; and the one quiet nudge.
 * Every expected value below is read from doors.json itself, never retyped. Untagged (no
 * `@prod`): a deploy lag on the live site is no bug.
 */

const doors = JSON.parse(readFileSync(new URL("../../site-shared/doors.json", import.meta.url), "utf8"));
const PROMPT: string = doors.agentPrompt.join("\n");
const agent = doors.doors.agent;
/** Each agent tab's copy buttons, in order, and the doors.json value each must copy. */
const TABS: [string, string[]][] = [
  ["Claude Code", [agent.claudeCodeHttp, agent.plugin.join("\n")]],
  ["Codex", [agent.skills.command]],
  ["Cursor", [agent.skills.command, JSON.stringify(agent.mcpConfig, null, 2)]],
  ["VS Code", [agent.skills.command]],
];
const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

const sheet = (page: Page) => page.getByRole("dialog", { name: "Make your own plan" });
/** The clipboard's text (a Windows clipboard hands multi-line text back with CRLF). */
const clipboard = async (page: Page) =>
  (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");

async function openSheet(page: Page) {
  await page.locator("#makeOwn").click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator(".mo-door")).toHaveCount(doors.order.playground.length);
}

/**
 * Every request the page makes that could carry the plan off it: any `/api/*` call (the short-link
 * API and anything added beside it) and anything to another host. Static assets from this origin
 * (the lazy chunks, the thumbnails) are neither.
 */
function watchShare(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    const here = new URL(page.url()).origin;
    if (url.pathname.startsWith("/api/") || (here !== "null" && url.origin !== here))
      seen.push(`${r.method()} ${r.url()}`);
  });
  return seen;
}

test.describe("make your own", () => {
  test("shows every door, in doors.json's playground order, at equal weight", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    const order = await sheet(page)
      .locator(".mo-door")
      .evaluateAll((ls) => ls.map((l) => (l as HTMLElement).dataset.door));
    expect(order).toEqual(doors.order.playground);
    // Equal weight: every door is the same card, its title the same size, none the redline fill.
    const looks = await sheet(page)
      .locator(".mo-door")
      .evaluateAll((ls) =>
        ls.map((l) => {
          const c = getComputedStyle(l);
          const h = getComputedStyle(l.querySelector("h3")!);
          return [c.backgroundColor, c.borderTopWidth, c.borderTopColor, c.paddingTop, h.fontSize, h.fontWeight].join();
        }),
      );
    expect(new Set(looks).size, looks.join(" | ")).toBe(1);
    await expect(sheet(page)).toContainText(doors.canonicalLine);
  });

  test("each copy button copies the doors.json value", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    const s = sheet(page);
    await s.locator('[data-door="claudeai"] button[data-copy]').click();
    expect(await clipboard(page)).toBe(doors.doors.claudeai.url);
    await expect(s.locator('[data-door="claudeai"] code')).toHaveText(doors.doors.claudeai.url);
    await expect(s.locator('[data-door="claudeai"] .mo-steps li')).toHaveText(doors.doors.claudeai.steps);
    await expect(s.locator('[data-door="claudeai"]')).toContainText(doors.doors.claudeai.plansNote);
    await s.locator('[data-door="chatgpt"] button[data-copy]').click();
    expect(await clipboard(page)).toBe(doors.doors.chatgpt.example);
    await expect(s.locator('[data-door="chatgpt"] code')).toHaveText(doors.doors.chatgpt.example);
    await s.getByRole("button", { name: "Copy prompt" }).click();
    expect(await clipboard(page)).toBe(PROMPT);
    await expect(s.locator("#moPrompt")).toHaveText(PROMPT);
    for (const [tab, values] of TABS) {
      await s.getByRole("tab", { name: tab }).click();
      const panel = s.getByRole("tabpanel", { name: tab });
      // By attribute, not name: a clicked button reads "Copied" for a moment.
      const buttons = panel.locator("button[data-copy]");
      await expect(buttons).toHaveCount(values.length);
      for (const [i, value] of values.entries()) {
        await buttons.nth(i).click();
        expect(await clipboard(page), `${tab} #${i}`).toBe(value);
      }
    }
  });

  test("external links open a new tab with noopener, and name the doors.json URLs", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    const links = sheet(page).locator('a[href^="http"]');
    const all = await links.evaluateAll((as) =>
      as.map((a) => ({ href: a.getAttribute("href")!, target: a.getAttribute("target"), rel: a.getAttribute("rel") })),
    );
    expect(all.length).toBeGreaterThan(5);
    for (const a of all) {
      expect(a.target, a.href).toBe("_blank");
      expect(a.rel, a.href).toMatch(/\bnoopener\b/);
      expect(a.rel, a.href).toMatch(/\bnoreferrer\b/);
    }
    const hrefs = all.map((a) => a.href);
    for (const url of [
      doors.doors.chatgpt.url,
      doors.doors.vscode.marketplace,
      doors.doors.vscode.openVsx,
      agent.skills.url,
      doors.links.fromAnImage,
      doors.links.editOneRoom,
      doors.links.agents,
    ])
      expect(hrefs).toContain(url);
    await expect(sheet(page).getByRole("link", { name: "Starting from a photo or PDF? →" })).toBeVisible();
    await expect(sheet(page).getByRole("link", { name: "Change one room only? →" })).toBeVisible();
    // "Continue this plan with your AI" (ruling PG-D5): the page's one home for the chat links and
    // Copy for LLM. The links say, next to them, that they put the plan in the chat host's URL, and
    // which of Share's two links keeps it off every server.
    const ask = sheet(page).getByRole("region", { name: "Continue this plan with your AI" });
    await expect(ask.getByRole("button", { name: "Copy for LLM" })).toHaveId("copyLlm");
    for (const name of ["Open in Claude ↗", "Open in ChatGPT ↗"]) {
      const chat = ask.getByRole("link", { name });
      await expect(chat).toHaveAccessibleDescription(
        "These links put this plan in the chat host's URL, so the host's servers receive it, and the host may send it as your first message. A plan too long for a URL is copied instead, for you to paste. To keep the plan off every server, use Copy full link in Share; Copy short link stores it on archlang.uk's server.",
      );
      await expect(chat).toHaveAttribute("data-ready", "true");
      await expect(chat).toHaveAttribute("href", /\?q=/);
    }
  });

  test("no /api call and no other host until Start from this plan is clicked", async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, "answers /api/share through local routing");
    const seen = watchShare(page);
    await page.route("**/api/share", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "AbCdEfGh12" }) }),
    );
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    // Every other control in the sheet, and a plan switch behind it: none of them asks the server.
    const s = sheet(page);
    await s.getByRole("button", { name: "Copy prompt" }).click();
    for (const [tab] of TABS) await s.getByRole("tab", { name: tab }).click();
    await s.locator('[data-door="claudeai"] button[data-copy]').click();
    await s.getByRole("link", { name: "Open in Claude ↗" }).hover();
    await page.keyboard.press("Escape");
    await pickPlan(page, "Two-bed flat");
    await openSheet(page);
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);

    await s.getByRole("button", { name: "Start from this plan" }).click();
    await expect(s.locator("#moStatus")).toHaveText("Prompt copied, with a short link to this plan");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^POST \S+\/api\/share$/);
    const origin = new URL(page.url()).origin;
    const withLink = `${PROMPT}\nStart from this plan: ${origin}/s/AbCdEfGh12`;
    expect(await clipboard(page)).toBe(withLink);
    await expect(s.locator("#moPrompt")).toHaveText(withLink);
    // Opened again, the prompt is the plain one: the link named the plan as it was then.
    await page.keyboard.press("Escape");
    await openSheet(page);
    await expect(s.locator("#moPrompt")).toHaveText(PROMPT);
  });

  test("with no short link, Start from this plan adds the full link instead", async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, "refuses /api/share through local routing");
    await page.route("**/api/share", (route) => route.abort());
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Start from this plan" }).click();
    await expect(sheet(page).locator("#moStatus")).toHaveText(
      "Short link unavailable: prompt copied with the full link",
    );
    const copied = await clipboard(page);
    const origin = new URL(page.url()).origin;
    expect(copied.startsWith(`${PROMPT}\nStart from this plan: ${origin}/#z=`)).toBe(true);
    expect(copied).not.toContain("&edit");
  });

  test("works from the keyboard: focus stays inside, the tabs take arrows, Escape returns focus", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#makeOwn").focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).locator(".mo-door")).toHaveCount(doors.order.playground.length);
    // Tab right round the sheet and further: focus never leaves it.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => !!document.activeElement?.closest("#makeOwnDialog"));
      expect(inside, `focus left the sheet after ${i + 1} Tab presses`).toBe(true);
    }
    // The agent tabs are one tab stop; arrows move between them.
    const first = sheet(page).getByRole("tab", { name: TABS[0]![0] });
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const second = sheet(page).getByRole("tab", { name: TABS[1]![0] });
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(sheet(page).getByRole("tabpanel", { name: TABS[1]![0] })).toBeVisible();
    await page.keyboard.press("End");
    await expect(sheet(page).getByRole("tab", { name: TABS.at(-1)![0] })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator("#makeOwn")).toBeFocused();
  });

  test("fits a phone: no sideways scroll in the sheet or the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForPlan(page);
    await openSheet(page);
    // The widest tab's text (Cursor's JSON) is on screen too.
    await sheet(page).getByRole("tab", { name: "Cursor" }).click();
    const over = await page.evaluate(() => {
      const d = document.getElementById("makeOwnDialog")!;
      const r = d.getBoundingClientRect();
      return {
        sheet: d.scrollWidth - d.clientWidth,
        page: document.documentElement.scrollWidth - window.innerWidth,
        left: r.left,
        right: window.innerWidth - r.right,
      };
    });
    expect(over.sheet, "the sheet scrolls sideways").toBeLessThanOrEqual(0);
    expect(over.page, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(over.left).toBeGreaterThanOrEqual(0);
    expect(over.right).toBeGreaterThanOrEqual(0);
    await expect(sheet(page).getByRole("button", { name: "Close" })).toBeInViewport();
  });

  test("one quiet nudge after the third plan switch, never again once shown", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const nudge = page.locator(".nudge");
    for (const [i, label] of ["Two-bed flat", "Laneway House", "Two-bed flat"].entries()) {
      await expect(nudge, `before switch ${i + 1}`).toHaveCount(0);
      await pickPlan(page, label);
    }
    await expect(nudge).toBeVisible();
    await expect(nudge).toHaveAttribute("role", "status");
    // Quiet: no modal, and the focus is where the visitor left it.
    await expect(sheet(page)).toBeHidden();
    await expect(nudge.locator(":focus")).toHaveCount(0);
    await nudge.getByRole("button", { name: "Make your own" }).click();
    await expect(sheet(page)).toBeVisible();
    await expect(nudge).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.reload();
    await waitForPlan(page);
    for (const label of ["Two-bed flat", "Laneway House", "Two-bed flat", "Laneway House"]) await pickPlan(page, label);
    await page.waitForTimeout(300);
    await expect(nudge).toHaveCount(0);
  });

  test("the first knob let go earns the nudge too", async ({ page }) => {
    await page.goto(`/${await shareHash(example("knob-flat"))}`);
    await waitForPlan(page);
    await expect(page.locator(".nudge")).toHaveCount(0);
    await page.locator('details.knobs input[type="range"][data-knob="DEPTH"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".nudge")).toBeVisible();
    await page.locator(".nudge").getByRole("button", { name: "Dismiss" }).click();
    await expect(page.locator(".nudge")).toHaveCount(0);
  });
});
