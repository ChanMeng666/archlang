/**
 * The task skills under `skills/<name>/SKILL.md`, beside the root `SKILL.md` (`name: archlang`).
 *
 * Each is a short workflow an agent loads for one job. Two things about them can rot without
 * any build noticing, and this file is the gate for both:
 *
 * 1. THE FORMAT. A skill a client cannot parse is invisible: the Agent Skills specification
 *    (https://agentskills.io/specification) requires `name` (1-64 chars, lowercase letters,
 *    digits and single hyphens, equal to the directory name) and `description` (1-1024 chars),
 *    and recommends a body under 500 lines.
 * 2. THE COMMANDS. A skill is a list of `arch` invocations. Every command it names must exist
 *    and every flag must be one that command declares in `src/manifest.ts`; an undeclared flag
 *    is a usage error (exit 3) for every agent that follows the skill.
 *
 * A skill carries no language reference of its own. It sends the agent to `arch spec` and
 * `arch <cmd> --help`, exactly as the root skill does, so there is one copy of the language.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";

const DIR = "skills";
const names = readdirSync(DIR)
  .filter((d) => statSync(join(DIR, d)).isDirectory())
  .sort();
const read = (name: string): string => readFileSync(join(DIR, name, "SKILL.md"), "utf8");

/** The YAML frontmatter as flat `key: value` pairs (the skills use no nested or multi-line values). */
function frontmatter(text: string): { fields: Map<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("SKILL.md does not open with a `---` frontmatter block");
  const fields = new Map<string, string>();
  for (const line of m[1]!.split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`frontmatter line is not a flat \`key: value\`: ${JSON.stringify(line)}`);
    fields.set(kv[1]!, kv[2]!);
  }
  return { fields, body: m[2]! };
}

const manifest = buildManifest("0.0.0");
const globals = new Set<string>(["--help", "-h", "--version", "-V"]);
for (const g of manifest.globalFlags) {
  globals.add(g.flag);
  if (g.alias) globals.add(g.alias);
}
/** command name (and alias) → every flag and flag alias it accepts, including the global ones. */
const flagsOf = new Map<string, Set<string>>();
for (const c of manifest.commands) {
  const flags = new Set(globals);
  for (const f of c.flags) {
    flags.add(f.flag);
    if (f.alias) flags.add(f.alias);
  }
  flagsOf.set(c.name, flags);
  for (const a of c.aliases ?? []) flagsOf.set(a, flags);
}

/** Every `arch …` invocation written in code: inline code spans and fenced blocks. */
function invocations(body: string): string[] {
  const code = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].flatMap((m) => m[1]!.split("\n"));
  for (const m of body.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)) code.push(m[1]!);
  return code.map((c) => c.trim()).filter((c) => /^(arch|npx @chanmeng666\/archlang)\s/.test(c));
}

/** What is wrong with one invocation, or nothing. `<cmd>` is the documented placeholder for any command. */
function faults(invocation: string): string[] {
  const words = invocation.replace(/^npx @chanmeng666\/archlang/, "arch").split(/\s+/);
  const cmd = words[1]!;
  if (cmd === "<cmd>") return [];
  if (cmd.startsWith("-")) return globals.has(cmd) ? [] : [`\`${cmd}\` is not a global flag`];
  const flags = flagsOf.get(cmd);
  if (!flags) return [`\`${cmd}\` is not an arch command`];
  return words
    .slice(2)
    .filter((w) => /^--?[a-zA-Z]/.test(w) && !flags.has(w))
    .map((w) => `\`${w}\` is not a flag of \`arch ${cmd}\``);
}

describe("the invocation check itself", () => {
  it("accepts a real command with its real flags", () => {
    expect(faults("arch finish plan.arch --reissue -o issued.arch")).toEqual([]);
    expect(faults("arch <cmd> --help")).toEqual([]);
  });

  it("catches an unknown command and an undeclared flag", () => {
    expect(faults("arch furnish plan.arch")).toEqual(["`furnish` is not an arch command"]);
    expect(faults("arch fix plan.arch --write")).toEqual(["`--write` is not a flag of `arch fix`"]);
    expect(invocations("Run `arch fix plan.arch --write` now.")).toEqual(["arch fix plan.arch --write"]);
  });
});

describe("skills/", () => {
  it("holds a few task skills, each a directory with one SKILL.md", () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const name of names) expect(readdirSync(join(DIR, name))).toEqual(["SKILL.md"]);
  });

  it("does not shadow the root skill's name", () => {
    const root = frontmatter(readFileSync("SKILL.md", "utf8")).fields.get("name");
    expect(root).toBe("archlang");
    expect(names).not.toContain(root);
  });

  it("is listed, skill for skill, by the root SKILL.md and the docs agents page", () => {
    for (const file of ["SKILL.md", "docs-site/agents.md"]) {
      const listed = [...readFileSync(file, "utf8").matchAll(/^- `(archlang-[a-z0-9-]+)`:/gm)].map((m) => m[1]).sort();
      expect(listed, file).toEqual(names);
    }
  });
});

describe.each(names)("skills/%s/SKILL.md", (name) => {
  const { fields, body } = frontmatter(read(name));

  it("has valid Agent Skills frontmatter", () => {
    expect(fields.get("name")).toBe(name);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(name.length).toBeLessThanOrEqual(64);
    const description = fields.get("description") ?? "";
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(1024);
    // A description says when to use the skill, not only what it is.
    expect(description).toMatch(/^Use when /);
    expect((fields.get("compatibility") ?? "x").length).toBeLessThanOrEqual(500);
    const known = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
    expect([...fields.keys()].filter((k) => !known.has(k))).toEqual([]);
  });

  it("is a short workflow: well under 500 lines, with steps", () => {
    expect(read(name).split("\n").length).toBeLessThan(150);
    expect(body).toMatch(/^## Steps$/m);
  });

  it("sends the agent to the CLI for the language instead of restating it", () => {
    expect(body).toContain("`arch spec`");
    expect(body).toContain("--help`");
    // No grammar of its own: a fenced ArchLang block would be a second copy of the language.
    expect(body).not.toMatch(/^```arch/m);
  });

  it("names only commands and flags the CLI declares", () => {
    const found = invocations(body);
    expect(found.length, "the skill names no `arch` invocation at all").toBeGreaterThan(3);
    expect(found.flatMap((inv) => faults(inv).map((f) => `${inv} — ${f}`))).toEqual([]);
  });
});
