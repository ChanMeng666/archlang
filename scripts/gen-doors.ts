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
    chatgpt: { label: string; url: string; note: string };
    claudeai: { label: string; url: string; note: string };
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
  /** Pages the surfaces link to next to the doors (the two top asks, the agents page). */
  links: { fromAnImage: string; editOneRoom: string; agents: string };
  agentPrompt: string[];
  order: Record<string, string[]>;
}

export const loadDoors = (): Doors =>
  JSON.parse(readFileSync(resolve(ROOT, "site-shared/doors.json"), "utf8")) as Doors;

/** One surface: the file, its order key, and the heading to insert before on the first run. */
export const SURFACES = [
  { file: "packages/mcp/README.md", order: "npmMcp", anchor: "## If your agent has a shell" },
  { file: "editors/vscode/README.md", order: "vscode", anchor: "## Features" },
  { file: "llms.txt", order: "llms", anchor: "## Key documents" },
] as const;

function bullet(d: Doors, key: string, compact: boolean): string {
  const x = d.doors;
  switch (key) {
    case "chatgpt":
      return `- **ChatGPT, ${x.chatgpt.note}:** [${x.chatgpt.label}](${x.chatgpt.url})`;
    case "claudeai":
      return `- **claude.ai, ${x.claudeai.note.split(";")[0]}:** add \`${x.claudeai.url}\` as a custom connector`;
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

export function renderDoorsBlock(d: Doors, orderKey: string): string {
  const order = d.order[orderKey];
  if (!order) throw new Error(`doors.json has no order "${orderKey}"`);
  const compact = orderKey === "llms";
  const lines = order.map((k) => bullet(d, k, compact));
  return `${START}\n## Try it\n\n${d.canonicalLine}\n\n${lines.join("\n")}\n${END}`;
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
