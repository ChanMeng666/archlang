import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_PROMPT,
  CHAT_NOTE,
  AGENT_TABS,
  playgroundDoors,
  promptWithPlan,
  sheetHtml,
  TOP_ASKS,
} from "../src/make-own.js";
import { NUDGE_AFTER_SWITCHES, shouldNudge } from "../src/nudge.js";

const doors = JSON.parse(readFileSync(new URL("../../site-shared/doors.json", import.meta.url), "utf8"));
const agent = doors.doors.agent;
/** The HTML-escaped form a value takes in the sheet's markup. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("the Make-your-own sheet", () => {
  it("lists the doors in doors.json's playground order", () => {
    expect(playgroundDoors()).toEqual(doors.order.playground);
    const html = sheetHtml();
    const shown = [...html.matchAll(/data-door="([a-z]+)"/g)].map((m) => m[1]);
    expect(shown).toEqual(doors.order.playground);
  });

  it("carries every door's URL from doors.json", () => {
    const html = sheetHtml();
    for (const url of [
      doors.doors.chatgpt.url,
      doors.doors.claudeai.url,
      doors.doors.vscode.marketplace,
      doors.doors.vscode.openVsx,
      agent.skills.url,
    ])
      expect(html).toContain(esc(url));
    expect(TOP_ASKS.map((a) => a.href)).toEqual([doors.links.fromAnImage, doors.links.editOneRoom]);
    for (const a of TOP_ASKS) expect(html).toContain(`href="${a.href}"`);
    expect(html).toContain(`href="${doors.links.agents}"`);
    // Every external link opens a new tab and sends no opener and no referrer, as Tools' links do.
    const anchors = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(anchors.length).toBeGreaterThan(5);
    for (const a of anchors) expect(a, a).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(esc(doors.canonicalLine));
  });

  it("gives ChatGPT a prompt to copy and what comes back, and claude.ai its steps, all from doors.json", () => {
    const html = sheetHtml();
    const door = (k: string) =>
      new RegExp(`<li class="mo-door" data-door="${k}">([\\s\\S]*?)</li>(?=<li class="mo-door"|</ul>)`).exec(
        html,
      )?.[1] ?? "";
    const chatgpt = door("chatgpt");
    expect(chatgpt).toContain(`<code>${esc(doors.doors.chatgpt.example)}</code>`);
    expect(chatgpt).toContain('data-copy="chatgptExample"');
    expect(chatgpt).toContain(esc(doors.doors.chatgpt.returns));
    const claudeai = door("claudeai");
    const steps = [...claudeai.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    expect(steps).toEqual(doors.doors.claudeai.steps.map(esc));
    expect(claudeai).toContain(`<span>${esc(doors.doors.claudeai.plansNote)}</span>`);
    expect(claudeai).toContain(`href="${esc(doors.doors.claudeai.stepsSource)}"`);
  });

  it("copies the agent prompt line for line, and appends the plan's link to it", () => {
    expect(AGENT_PROMPT).toBe(doors.agentPrompt.join("\n"));
    expect(sheetHtml()).toContain(esc(AGENT_PROMPT));
    const link = "https://playground.archlang.uk/s/AbCdEfGh12";
    expect(promptWithPlan(link)).toBe(`${AGENT_PROMPT}\nStart from this plan: ${link}`);
  });

  it("every agent tab's line is a doors.json value", () => {
    expect(AGENT_TABS.map((t) => t.label)).toEqual(["Claude Code", "Codex", "Cursor", "VS Code"]);
    const allowed = new Set<string>([
      agent.claudeCodeHttp,
      agent.claudeCodeLocal,
      agent.plugin.join("\n"),
      agent.skills.command,
      JSON.stringify(agent.mcpConfig, null, 2),
    ]);
    for (const t of AGENT_TABS) for (const r of t.rows) expect(allowed.has(r.text), `${t.label}: ${r.text}`).toBe(true);
  });

  it("says next to the chat links that they put the plan in that site's address", () => {
    const html = sheetHtml();
    expect(CHAT_NOTE).toBe("Opening a chat puts this plan in that site's address (or copies it, if the plan is long).");
    expect(html).toContain(`id="moChatNote">${CHAT_NOTE}<`);
    expect([...html.matchAll(/data-chat-host="[a-z]+" aria-describedby="moChatNote"/g)]).toHaveLength(2);
  });

  it("says, next to Start from this plan, that it stores the plan on a server", () => {
    expect(sheetHtml()).toMatch(/aria-describedby="moStartNote">Start from this plan<\/button>/);
    expect(sheetHtml()).toMatch(/id="moStartNote">[^<]*stores this plan on archlang\.uk's server/);
  });
});

describe("the nudge", () => {
  const at = (switches: number, knobReleased = false, spent = false) => shouldNudge({ switches, knobReleased, spent });
  it("comes after the third plan switch or the first knob let go", () => {
    expect(NUDGE_AFTER_SWITCHES).toBe(3);
    expect(at(0)).toBe(false);
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
    expect(at(0, true)).toBe(true);
  });
  it("never once spent", () => {
    expect(at(3, true, true)).toBe(false);
  });
});
