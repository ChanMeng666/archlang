/**
 * `site-shared/doors.json` is the single source of every door (ChatGPT, claude.ai connector, coding
 * agent, VS Code, playground). This pins its shape, the copy guardrails, the command rules shared
 * with `test/docs-flags.test.ts`, and that the generated blocks in the READMEs and `llms.txt` are
 * what `gen:doors` writes. Later cards extend it to the sites.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";
import { applyDoors, loadDoors, renderDoorsBlock, SURFACES, startDoorUrl } from "../scripts/gen-doors.js";

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

  it("gives the ChatGPT door a prompt to try and what comes back, and the claude.ai door its steps", () => {
    const { chatgpt, claudeai } = doors.doors;
    // A plan brief, phrased for the app; the returns line says what the compile result carries.
    expect(chatgpt.example).toMatch(/ArchLang/);
    expect(chatgpt.example).toMatch(/m²/);
    expect(chatgpt.returns).toMatch(/^What comes back: /);
    // The steps name claude.ai's own menu, as Claude's help page words them, and end on adding it.
    expect(claudeai.steps.length).toBeGreaterThanOrEqual(3);
    expect(claudeai.steps[0]).toContain("Customize > Connectors");
    expect(claudeai.steps.join(" ")).toContain("Add custom connector");
    expect(claudeai.steps.join(" ")).toContain("No sign in");
    // Two Continues, as the page has them: one after the URL, one after the authentication review.
    expect(claudeai.steps.join(" ").match(/\bContinue\b/g)).toHaveLength(2);
    expect(claudeai.stepsSource).toMatch(/^https:\/\/support\.claude\.com\//);
    // The steps are the Pro and Max ones; the note says so and names where Team and Enterprise differ.
    expect(claudeai.plansNote).toMatch(/Pro and Max/);
    expect(claudeai.plansNote).toContain("Organization settings > Connectors");
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

  it.each(SURFACES)("$file has exactly one doors block", ({ file }) => {
    const text = read(file);
    expect(text.split("<!-- doors:start -->").length - 1).toBe(1);
    expect(text.split("<!-- doors:end -->").length - 1).toBe(1);
  });

  it("a second, stale block is refused, not left alone", () => {
    const block = renderDoorsBlock(doors, "llms");
    const twice = `intro\n${block}\nmiddle\n${block.replace(CHATGPT, "https://example.invalid")}\n## Next\n`;
    expect(() => applyDoors(twice, block, "## Next")).toThrow(/more than one doors block/);
  });

  it("bytes outside the block keep their line endings", () => {
    const block = renderDoorsBlock(doors, "llms");
    const mixed = `a\r\nb\n${block.replace(/\n/g, "\r\n")}\r\nc\nd\r\n`;
    const out = applyDoors(mixed, block, "## Next");
    expect(out.slice(0, 5)).toBe("a\r\nb\n");
    expect(out.endsWith("\r\nc\nd\r\n")).toBe(true);
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

describe("the sites and the root README carry the doors.json values", () => {
  it.each(["docs-site/agents.md", "docs-site/mcp.md", "README.md"])("%s spells both URLs out", (file) => {
    const text = read(file);
    expect(text).toContain(CHATGPT);
    expect(text).toContain(HOSTED);
  });

  it("the docs hero reads its two primaries from doors.json, not from retyped strings", () => {
    // PS-D2, docs home: ChatGPT and the agent prompt side by side at equal weight; the
    // claude.ai connector and the rest are one tab away in the doors card.
    const vue = read("docs-site/.vitepress/theme/CompileSeam.vue");
    expect(vue).toContain("site-shared/doors.json");
    expect(vue).toContain("NO_INSTALL.chatgpt.url");
    expect(vue).toContain("NO_INSTALL.chatgpt.note");
    expect(vue).toContain('agentPrompt.join("\\n")');
    expect(vue, "the full doors file would ship to the browser").not.toMatch(/import doorsFile|import doors from/);
  });

  it("the docs doors (/start and the home card) read every door from doors.json", () => {
    const theme = "docs-site/.vitepress/theme";
    const body = read(`${theme}/components/DoorBody.vue`);
    for (const ref of [
      "doors.playground.url",
      "doors.chatgpt.url",
      "doors.claudeai.url",
      "doors.agent.claudeCodeHttp",
      "doors.agent.skills.command",
      "doors.vscode.marketplace",
      "doors.vscode.openVsx",
      "doors.chatgpt.example",
      "doors.chatgpt.returns",
      "doors.claudeai.steps",
      "doors.claudeai.plansNote",
      "doors.claudeai.stepsSource",
      "AGENT_PROMPT",
    ])
      expect(body, ref).toContain(ref);
    expect(read(`${theme}/doors.ts`)).toMatch(/from "\.\.\/\.\.\/\.\.\/site-shared\/doors\.json"/);
    expect(read(`${theme}/components/StartDoors.vue`)).toContain("START_ORDER");
    expect(read(`${theme}/components/DoorsCard.vue`)).toContain("HOME_ORDER");
    const retyped = [
      CHATGPT,
      HOSTED,
      doors.doors.vscode.marketplace,
      doors.doors.agent.skills.command,
      ...doors.agentPrompt,
      doors.doors.chatgpt.example,
      doors.doors.chatgpt.returns,
      ...doors.doors.claudeai.steps,
      doors.doors.claudeai.plansNote,
      doors.doors.claudeai.stepsSource,
    ];
    for (const file of [
      `${theme}/CompileSeam.vue`,
      `${theme}/components/DoorBody.vue`,
      `${theme}/components/DoorsCard.vue`,
      `${theme}/components/StartDoors.vue`,
      `${theme}/door-copy.json`,
      "docs-site/start.md",
      "docs-site/index.md",
    ])
      for (const s of retyped) expect(read(file), `${file}: ${s}`).not.toContain(s);
  });

  it("the docs pages label the ChatGPT door as doors.json does and say 'no install', never 'no signup'", () => {
    for (const file of ["docs-site/agents.md", "docs-site/mcp.md"]) {
      const text = read(file);
      expect(text, file).toContain(`[${doors.doors.chatgpt.label}](${CHATGPT})`);
      expect(text, file).toMatch(/^## No install$/m);
    }
  });

  it("the playground sheet reads the doors from doors.json, not from retyped strings", () => {
    const sheet = read("playground/src/make-own.ts");
    expect(sheet).toMatch(/from "\.\.\/\.\.\/site-shared\/doors\.json"/);
    const retyped = [
      CHATGPT,
      HOSTED,
      doors.doors.vscode.marketplace,
      doors.doors.vscode.openVsx,
      doors.doors.agent.skills.url,
      doors.doors.agent.skills.command,
      doors.doors.agent.claudeCodeHttp,
      ...doors.agentPrompt,
      doors.doors.chatgpt.example,
      doors.doors.chatgpt.returns,
      ...doors.doors.claudeai.steps,
      doors.doors.claudeai.plansNote,
      doors.doors.claudeai.stepsSource,
    ];
    for (const ref of [
      "doors.chatgpt.example",
      "doors.chatgpt.returns",
      "doors.claudeai.steps",
      "doors.claudeai.plansNote",
      "doors.claudeai.stepsSource",
    ])
      expect(sheet, ref).toContain(ref);
    // Nor does the served page or the startup code type a door in: the sheet's body is make-own.ts's.
    for (const file of ["playground/src/make-own.ts", "playground/index.html", "playground/src/shell.ts"])
      for (const s of retyped) expect(read(file), `${file}: ${s}`).not.toContain(s);
    // The doors stay out of the startup chunk: only the lazily loaded sheet imports them.
    for (const file of ["playground/src/main.ts", "playground/src/shell.ts", "playground/src/nudge.ts"])
      expect(read(file), file).not.toMatch(/\bfrom\s+["'][^"']*doors\.json["']|import\(\s*["'][^"']*doors\.json/);
    expect(read("playground/src/shell.ts")).toContain('import("./make-own.js")');
    // The pages the sheet links beside the doors (the two top asks, the agents page) are
    // doors.json's `links` too, read, never typed in. `start` is the generated blocks' (below).
    expect(Object.keys(doors.links).sort()).toEqual(["agents", "editOneRoom", "fromAnImage", "start"]);
    for (const url of Object.values(doors.links)) {
      expect(url).toMatch(/^https:\/\/archlang\.uk\/[a-z-]+$/);
      expect(sheet, url).not.toContain(url);
    }
    for (const key of ["agents", "editOneRoom", "fromAnImage"]) expect(sheet).toContain(`links.${key}`);
  });

  it("the README's Try it is the generated block, right after the card and before the plans (PS-D7)", () => {
    const text = read("README.md");
    const pills = text.indexOf("pill-npm.svg");
    const card = text.indexOf(".github/readme/card.svg");
    const start = text.indexOf("<!-- doors:start -->");
    const grid = text.indexOf("## What you get");
    expect(pills).toBeGreaterThan(0);
    expect(card).toBeGreaterThan(pills);
    expect(start).toBeGreaterThan(card);
    expect(grid).toBeGreaterThan(start);
    // Nothing but the card sits between the pills and the doors, so Try it stays on the first screen.
    expect(text.slice(pills, start).match(/^## /gm)).toBeNull();
    // S2's one-line stopgap is folded into the block, not left beside it.
    expect(text).not.toContain("No install: [");
    expect(text.match(/^## Try it$/gm)).toHaveLength(1);
  });

  it("the README leads its doors with the coding agent's prompt as one copyable block, in README order", () => {
    const text = read("README.md");
    expect(doors.order.readme![0]).toBe("agent");
    expect(text).toContain(["```text", ...doors.agentPrompt, "```"].join("\n"));
    const at = (s: string): number => text.indexOf(s);
    const prompt = at(doors.agentPrompt[0]!);
    const sequence = [
      prompt,
      at(CHATGPT),
      at(`\`${HOSTED}\` as a custom connector`),
      at(doors.doors.vscode.marketplace),
      at(`${doors.doors.playground.url}\n`),
    ];
    for (const p of sequence) expect(p).toBeGreaterThan(0);
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence);
  });

  it("the README's Try it opens with the playground for someone just looking, then the agent prompt", () => {
    const text = read("README.md");
    const block = text.slice(text.indexOf("<!-- doors:start -->"), text.indexOf("<!-- doors:end -->"));
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    expect(lines[1]).toBe("## Try it");
    expect(lines[2]).toBe(`Just looking? [Open the playground](${doors.doors.playground.url}) — no install.`);
    expect(lines[3]).toMatch(/^\*\*Your coding agent:\*\* paste this prompt\.$/);
    // The ChatGPT door carries the prompt to try; the claude.ai door links to /start's steps.
    expect(block).toContain(doors.doors.chatgpt.example);
    expect(block).toContain(`(${startDoorUrl(doors, "claudeai")})`);
  });

  it("the /start link is built from doors.json's links.start and /start's own heading ids, never typed", () => {
    expect(startDoorUrl(doors, "claudeai")).toBe(`${doors.links.start}#door-claudeai`);
    // The anchor is real: StartDoors.vue gives each door's heading the id `door-<key>`.
    expect(read("docs-site/.vitepress/theme/components/StartDoors.vue")).toMatch(/:id="`door-\$\{id\}`"/);
    expect(read("scripts/gen-doors.ts")).not.toContain(doors.links.start);
  });
});

describe("the README's fixed lines", () => {
  const readme = read("README.md");
  it("opens with the ArchLang boilerplate the messaging library approved", () => {
    expect(readme).toContain(
      "ArchLang is an open-source (MIT) DSL for floor plans that compiles `.arch` source to SVG/DXF/PDF with linting and geometric validation — diffable, reproducible, and LLM-writable.",
    );
  });
  it("keeps the one ArchCanvas line verbatim", () => {
    expect(readme).toContain("ArchCanvas is a hosted app built on ArchLang.");
    expect(readme.match(/ArchCanvas/g)?.length).toBe(1);
  });
});
