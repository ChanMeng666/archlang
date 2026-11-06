/**
 * Generate the "Try it" doors block into the surfaces that cannot import `site-shared/doors.json`
 * (READMEs, `llms.txt`). The JSON is the single source of every door URL and command; the block
 * sits between `<!-- doors:start -->` and `<!-- doors:end -->`. On the first run (no markers yet) it
 * is inserted before the surface's anchor heading. {@link renderDoorsBlock} and {@link applyDoors}
 * are pure so `test/site-doors.test.ts` can regenerate in memory.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export const START = "<!-- doors:start -->";
export const END = "<!-- doors:end -->";

export interface Doors {
  canonicalLine: string;
  todo: string;
  doors: {
    /** `example` is a prompt to try in the app; `returns` says in one line what comes back. */
    chatgpt: { label: string; url: string; note: string; example: string; returns: string };
    /**
     * `steps` add the connector in claude.ai, worded as `stepsSource` (Claude's help page) has them
     * for Pro and Max; `plansNote` says so and where Team and Enterprise differ.
     */
    claudeai: { label: string; url: string; note: string; steps: string[]; plansNote: string; stepsSource: string };
    agent: {
      label: string;
      claudeCodeHttp: string;
      claudeCodeLocal: string;
      plugin: string[];
      skills: { command: string; url: string };
      mcpConfig: unknown;
    };
    vscode: { label: string; marketplace: string; openVsx: string };
    playground: { label: string; url: string; note: string };
  };
  /** Pages the surfaces link to next to the doors (the two top asks, the agents page, /start). */
  links: { fromAnImage: string; editOneRoom: string; agents: string; start: string };
  agentPrompt: string[];
  order: Record<string, string[]>;
}

/**
 * One door's section on /start: `links.start` plus the heading id StartDoors.vue gives each door
 * (`door-<key>`). The longer blocks link the claude.ai steps there rather than repeat them.
 */
export const startDoorUrl = (d: Doors, key: keyof Doors["doors"]): string => `${d.links.start}#door-${key}`;

export const loadDoors = (): Doors =>
  JSON.parse(readFileSync(resolve(ROOT, "site-shared/doors.json"), "utf8")) as Doors;

/** One surface: the file, its order key, and the heading to insert before on the first run. */
export const SURFACES = [
  { file: "README.md", order: "readme", anchor: "## What you get" },
  { file: "packages/mcp/README.md", order: "npmMcp", anchor: "## If your agent has a shell" },
  { file: "editors/vscode/README.md", order: "vscode", anchor: "## Features" },
  { file: "llms.txt", order: "llms", anchor: "## Key documents" },
] as const;

function bullet(d: Doors, key: string, compact: boolean): string {
  const x = d.doors;
  switch (key) {
    case "chatgpt": {
      const door = `- **ChatGPT, ${x.chatgpt.note}:** [${x.chatgpt.label}](${x.chatgpt.url})`;
      return compact ? door : `${door}, then ask, for example: "${x.chatgpt.example}"`;
    }
    case "claudeai": {
      const door = `- **claude.ai, ${x.claudeai.note.split(";")[0]}:** add \`${x.claudeai.url}\` as a custom connector`;
      return compact ? door : `${door} ([the steps](${startDoorUrl(d, "claudeai")}))`;
    }
    case "agent":
      return compact
        ? `- **Coding agent:** \`${x.agent.claudeCodeHttp}\`, or \`${x.agent.skills.command}\``
        : `- **Coding agent:** \`${x.agent.claudeCodeHttp}\`; locally, \`${x.agent.claudeCodeLocal}\`; skills, \`${x.agent.skills.command}\` ([skills.sh](${x.agent.skills.url}))`;
    case "vscode":
      return `- **VS Code:** [Marketplace](${x.vscode.marketplace}) or [Open VSX](${x.vscode.openVsx})`;
    case "playground":
      return `- **Playground, ${x.playground.note}:** ${x.playground.url}`;
    default:
      throw new Error(`doors.json order names an unknown door "${key}"`);
  }
}

/**
 * The coding-agent door as the root README shows it: the prompt to paste as a copyable block, then
 * the MCP commands and the skills listing. The README is the npm page and the one surface where a
 * developer with an agent lands first (PS-D2), so it gets the whole prompt rather than one line.
 */
function agentPromptDoor(d: Doors): string {
  const a = d.doors.agent;
  return [
    `**${a.label}:** paste this prompt.`,
    "",
    "```text",
    ...d.agentPrompt,
    "```",
    "",
    `Or add the MCP server: \`${a.claudeCodeHttp}\` (locally, \`${a.claudeCodeLocal}\`). The skills are listed on [skills.sh](${a.skills.url}).`,
  ].join("\n");
}

export function renderDoorsBlock(d: Doors, orderKey: string): string {
  const order = d.order[orderKey];
  if (!order) throw new Error(`doors.json has no order "${orderKey}"`);
  const compact = orderKey === "llms";
  // The root README opens with the 25-word boilerplate (PS-D1), so its block carries the doors only;
  // every other surface states the canonical line under its heading.
  const readme = orderKey === "readme";
  // Consecutive bullets form one list; the README's agent prompt is a chunk of its own between them.
  const chunks: string[][] = [];
  for (const k of order) {
    if (readme && k === "agent") chunks.push([agentPromptDoor(d)], []);
    else {
      if (chunks.length === 0) chunks.push([]);
      chunks[chunks.length - 1]!.push(bullet(d, k, compact));
    }
  }
  const body = chunks
    .filter((c) => c.length > 0)
    .map((c) => c.join("\n"))
    .join("\n\n");
  // The README's block opens instead with the door for someone who is just looking; the agent
  // prompt still comes straight after it.
  const intro = readme
    ? `Just looking? [Open the playground](${d.doors.playground.url}) — no install.\n\n`
    : `${d.canonicalLine}\n\n`;
  return `${START}\n## Try it\n\n${intro}${body}\n${END}`;
}

/** `text` with the doors block replaced between the markers, or inserted before `anchor`. */
export function applyDoors(text: string, block: string, anchor: string): string {
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  // A second block (a merge leftover, a paste) would sit outside the span we rewrite and keep its
  // old URLs while this check stayed green, so more than one marker of either kind is an error.
  if (text.indexOf(START, s + 1) >= 0 || text.indexOf(END, e + 1) >= 0)
    throw new Error("more than one doors block: keep exactly one <!-- doors:start --> … <!-- doors:end -->");
  if (s >= 0 !== e >= 0 || (s >= 0 && e < s)) throw new Error("unpaired doors markers");
  // Only the block's own bytes take the file's line ending; everything outside it is left as found.
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const b = block.replace(/\n/g, eol);
  if (s >= 0) return text.slice(0, s) + b + text.slice(e + END.length);
  const at = text.indexOf(`\n${anchor}`);
  if (at < 0) throw new Error(`anchor "${anchor}" not found`);
  return `${text.slice(0, at + 1)}${b}${eol}${text.slice(at)}`;
}

function main(): void {
  const d = loadDoors();
  for (const s of SURFACES) {
    const path = resolve(ROOT, s.file);
    writeFileSync(path, applyDoors(readFileSync(path, "utf8"), renderDoorsBlock(d, s.order), s.anchor));
    process.stdout.write(`✓ doors block in ${s.file}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
