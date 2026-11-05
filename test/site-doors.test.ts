/**
 * `site-shared/doors.json` is the single source of every door (ChatGPT, claude.ai connector, coding
 * agent, VS Code, playground). This pins its shape, the copy guardrails, the command rules shared
 * with `test/docs-flags.test.ts`, and that the generated blocks in the READMEs and `llms.txt` are
 * what `gen:doors` writes. Later cards extend it to the sites.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";
import { applyDoors, loadDoors, renderDoorsBlock, SURFACES } from "../scripts/gen-doors.js";

const doors = loadDoors();
const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every string in the JSON, flattened. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const KEYS = ["chatgpt", "claudeai", "agent", "vscode", "playground"];
const CHATGPT = doors.doors.chatgpt.url;
const HOSTED = doors.doors.claudeai.url;

describe("doors.json", () => {
  it("has the canonical line and every door", () => {
    expect(doors.canonicalLine).toBe(
      "Floor plans as code. Your AI writes ArchLang; the compiler draws a precise, dimensioned plan and tells it what's wrong.",
    );
    expect(Object.keys(doors.doors).sort()).toEqual([...KEYS].sort());
    expect(doors.todo).toMatch(/deeplink/i);
  });

  it("orders every surface with known doors only", () => {
    for (const k of ["readme", "npmMcp", "vscode", "llms", "docsHome", "playground", "start"]) {
      expect(doors.order[k], k).toBeDefined();
      for (const d of doors.order[k]!) expect(KEYS, `${k}: ${d}`).toContain(d);
    }
  });

  it("uses https URLs only and no UTM parameters", () => {
    const urls = strings({ ...doors, todo: "" }).flatMap((s) => s.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)`"']+/g) ?? []);
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) {
      expect(u, u).toMatch(/^https:\/\//);
      expect(u, u).not.toMatch(/utm_/i);
    }
  });

  it("writes every command as `npx -y` (never a bare `arch`) with declared flags", () => {
    const m = buildManifest("0.0.0");
    const flagsOf = new Map<string, Set<string>>();
    const globals = new Set<string>(["--help", "-h", "--version", "-V"]);
    for (const g of m.globalFlags) {
      globals.add(g.flag);
      if (g.alias) globals.add(g.alias);
    }
    for (const c of m.commands) {
      const f = new Set(globals);
      for (const x of c.flags) {
        f.add(x.flag);
        if (x.alias) f.add(x.alias);
      }
      flagsOf.set(c.name, f);
      for (const a of c.aliases ?? []) flagsOf.set(a, f);
    }
    const invocation = /(?:npx (?:-y )?@chanmeng666\/archlang|\barch(?:lang)?)\s+([a-z][a-z-]*)((?:\s+[^\n`|]*)?)/g;
    const verbs = [...flagsOf.keys(), "help"].join("|");
    const bareArch = new RegExp(String.raw`(?<![\w./@-])arch\s+(?:${verbs}|<cmd>|--help|--version)\b`);
    for (const s of strings(doors)) {
      expect(s, s).not.toMatch(bareArch);
      expect(s, s).not.toMatch(/npx @chanmeng666\/archlang(?![\w-])/);
      for (const hit of s.matchAll(invocation)) {
        const flags = flagsOf.get(hit[1]!);
        if (!flags) continue;
        for (const flag of (hit[2] ?? "").match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? []) {
          expect(flags.has(flag), `${s}: ${flag} is not a flag of ${hit[1]}`).toBe(true);
        }
      }
    }
  });

  it("keeps the copy guardrails (no novelty, hype, counts or 'no signup')", () => {
    const banned: [RegExp, string][] = [
      [/(?<![-\w])first\b/i, "first"],
      [/(?<![-\w])only\b/i, "only"],
      [/seamless|effortless|magic|blazing|revolutionar/i, "hype"],
      [/before you see it/i, "before you see it"],
      [/no.?sign.?up/i, "no signup"],
      [/\b\d[\d,.]*\s*(stars?|downloads?|installs?)\b/i, "traction counts"],
    ];
    const prose = strings({ ...doors, todo: "" }).filter((s) => !/^https?:/.test(s));
    for (const s of prose) for (const [re, why] of banned) expect(re.test(s), `${why}: ${s}`).toBe(false);
  });
});

describe("generated doors blocks", () => {
  it.each(SURFACES)("$file matches gen:doors output", ({ file, order, anchor }) => {
    const text = read(file);
    expect(applyDoors(text, renderDoorsBlock(doors, order), anchor)).toBe(text);
  });

  it.each(SURFACES)("$file carries the ChatGPT and hosted MCP doors", ({ file }) => {
    const text = read(file);
    expect(text).toContain(CHATGPT);
    expect(text).toContain(HOSTED);
  });

  it("the npm MCP README leads with the doors, before the CLI section", () => {
    const text = read("packages/mcp/README.md");
    expect(text.indexOf("<!-- doors:start -->")).toBeLessThan(text.indexOf("## If your agent has a shell"));
    expect(text).not.toContain("## When to prefer the CLI");
  });

  it("the MCP package description is the canonical line", () => {
    expect(JSON.parse(read("packages/mcp/package.json")).description).toBe(doors.canonicalLine);
  });
});
