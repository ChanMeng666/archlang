/**
 * The skills under `skills/<name>/SKILL.md`: the umbrella skill `archlang` and the task skills
 * beside it. The repo root holds no `SKILL.md`: the `skills` CLI (`npx skills add`) stops at a root
 * one and installs the whole repository as the one skill, so every skill lives here.
 *
 * Each is a short workflow an agent loads for one job. Two things about them can rot without
 * any build noticing, and this file is the gate for both:
 *
 * 1. THE FORMAT. A skill a client cannot parse is invisible: the Agent Skills specification
 *    (https://agentskills.io/specification) requires `name` (1-64 chars, lowercase letters,
 *    digits and single hyphens, equal to the directory name) and `description` (1-1024 chars),
 *    and recommends a body under 500 lines.
 * 2. THE COMMANDS. A skill is a list of `archlang` invocations. Every command it names must exist
 *    and every flag must be one that command declares in `src/manifest.ts`; an undeclared flag
 *    is a usage error (exit 3) for every agent that follows the skill.
 *
 * 3. THE COMMAND NAME. A skill writes `archlang <cmd>` (the global install) or
 *    `npx -y @chanmeng666/archlang <cmd>`, never a bare `arch <cmd>`: coreutils ships an `arch`
 *    on Linux, macOS and Git Bash, so a bare `arch` runs the wrong program, and the unscoped npm
 *    name `archlang` is another publisher's package.
 *
 * A skill carries no language reference of its own. It sends the agent to `archlang spec` and
 * `archlang <cmd> --help`, exactly as the umbrella skill does, so there is one copy of the language.
 *
 * The umbrella skill is the long agent workflow (the `llms-full.txt` workflow section), so it is
 * exempt, by name, from the two rules that make a task skill short: the line limit and `## Steps`.
 * It also states the `npx` fallback in its own setup section rather than in the task skills' line.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";
import { LEAD_EXAMPLE } from "../scripts/gen-llm-spec.js";

const DIR = "skills";
const names = readdirSync(DIR)
  .filter((d) => statSync(join(DIR, d)).isDirectory())
  .sort();
const read = (name: string): string => readFileSync(join(DIR, name, "SKILL.md"), "utf8");
/** The umbrella skill: the full workflow, which lists the task skills. */
const UMBRELLA = "archlang";
const tasks = names.filter((n) => n !== UMBRELLA);

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
/** Every way an invocation can name the CLI: the global bin, its alias, or the scoped package via npx. */
const CLI = /^(?:archlang|arch|npx (?:-y )?@chanmeng666\/archlang)(?=\s)/;

/** Flag tokens (`--long`, `-x`) written anywhere in a piece of prose. */
const flagTokens = (text: string): string[] => text.match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? [];

/**
 * Every `archlang …`, `arch …` or `npx [-y] @chanmeng666/archlang …` invocation written in code.
 * A fenced line's trailing `# comment` is prose, but a flag it names is still checked: its tokens
 * are appended to the invocation, so they must belong to the command on that line. In an inline
 * code span `lint|validate` names two commands and is split in two; in a fence `|` is a pipe.
 */
function invocations(body: string): string[] {
  const out: string[] = [];
  for (const fence of body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    for (const line of fence[1]!.split("\n")) {
      const [code = "", ...comment] = line.split(/\s+#\s/);
      const c = code.trim();
      if (CLI.test(c)) out.push([c, ...flagTokens(comment.join(" # "))].join(" "));
    }
  }
  for (const m of body.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)) {
    const c = m[1]!.trim();
    if (!CLI.test(c)) continue;
    const words = c.split(/\s+/);
    const at = CLI.exec(c)![0].split(" ").length;
    const alt = words[at] ?? "";
    if (/^[a-z-]+(\|[a-z-]+)+$/.test(alt)) {
      for (const one of alt.split("|")) out.push([...words.slice(0, at), one, ...words.slice(at + 1)].join(" "));
    } else out.push(c);
  }
  return out;
}

/** What is wrong with one invocation, or nothing. `<cmd>` is the documented placeholder for any command. */
function faults(invocation: string): string[] {
  const words = invocation.replace(CLI, "arch").split(/\s+/);
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
    expect(faults("archlang finish plan.arch --reissue -o issued.arch")).toEqual([]);
    expect(faults("npx -y @chanmeng666/archlang finish plan.arch --reissue")).toEqual([]);
    expect(invocations("Run `archlang lint|validate --code W_X`.")).toEqual([
      "archlang lint --code W_X",
      "archlang validate --code W_X",
    ]);
    // A fenced comment's prose is ignored; a flag it names is not.
    expect(invocations("```bash\narchlang compile p.arch -f txt   # also `preview --ascii`\n```")).toEqual([
      "archlang compile p.arch -f txt --ascii",
    ]);
  });

  it("catches an unknown command and an undeclared flag", () => {
    expect(faults("arch furnish plan.arch")).toEqual(["`furnish` is not an arch command"]);
    expect(faults("arch fix plan.arch --write")).toEqual(["`--write` is not a flag of `arch fix`"]);
    expect(invocations("Run `arch fix plan.arch --write` now.")).toEqual(["arch fix plan.arch --write"]);
    // Every spelling of the command is checked, not only the alias.
    expect(faults("archlang fix plan.arch --write")).toEqual(["`--write` is not a flag of `arch fix`"]);
    expect(faults("npx -y @chanmeng666/archlang furnish plan.arch")).toEqual(["`furnish` is not an arch command"]);
    expect(invocations("Run `archlang fix plan.arch --write` now.")).toEqual(["archlang fix plan.arch --write"]);
    expect(invocations("Run `npx -y @chanmeng666/archlang spec`.")).toEqual(["npx -y @chanmeng666/archlang spec"]);
    // An inline alternation checks every command it names; in a fence `|` is a pipe, not an alternation.
    expect(invocations("`archlang lint|finish --code W_X`").flatMap(faults)).toEqual([
      "`--code` is not a flag of `arch finish`",
    ]);
    expect(invocations("`archlang lint|furnish p.arch`").flatMap(faults)).toEqual(["`furnish` is not an arch command"]);
    expect(invocations("```bash\narchlang lint|validate p.arch\n```").flatMap(faults)).toEqual([
      "`lint|validate` is not an arch command",
    ]);
    // A bogus flag in a fenced comment fails; `help` is not a manifest command.
    expect(invocations("```bash\narchlang fix p.arch   # not --write\n```").flatMap(faults)).toEqual([
      "`--write` is not a flag of `arch fix`",
    ]);
    expect(faults("archlang help finish")).toEqual(["`help` is not an arch command"]);
  });
});

describe("skills/", () => {
  it("holds the umbrella skill and a few task skills, each a directory with one SKILL.md", () => {
    expect(names).toContain(UMBRELLA);
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    for (const name of names) expect(readdirSync(join(DIR, name))).toEqual(["SKILL.md"]);
  });

  it("is the only home of a skill: the repo root holds no SKILL.md", () => {
    // A root SKILL.md makes the `skills` CLI install the whole repository as one skill.
    expect(readdirSync(".").filter((f) => f.toLowerCase() === "skill.md")).toEqual([]);
  });

  it("confines every tracked SKILL.md to skills/<name>/ or a plugin's skills/<name>/", () => {
    // The `skills` CLI walks the root's children, so a SKILL.md anywhere else (a `.claude/skills`
    // dev skill, say) would ship to every user who runs `npx skills add`.
    const tracked = execFileSync("git", ["ls-files", "-z", "--", "*SKILL.md"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    const allowed = /^(?:skills|plugins\/archlang(?:-cursor)?\/skills)\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/;
    expect(tracked.filter((f) => !allowed.test(f))).toEqual([]);
  });

  it("lists every task skill, skill for skill, in the umbrella skill and the docs agents page", () => {
    for (const file of [join(DIR, UMBRELLA, "SKILL.md"), "docs-site/agents.md"]) {
      const listed = [...readFileSync(file, "utf8").matchAll(/^- `(archlang-[a-z0-9-]+)`:/gm)].map((m) => m[1]).sort();
      expect(listed, file).toEqual(tasks);
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

  it.skipIf(name === UMBRELLA)("is a short workflow: well under 500 lines, with steps", () => {
    expect(read(name).split("\n").length).toBeLessThan(150);
    expect(body).toMatch(/^## Steps$/m);
  });

  it("stays under the specification's recommended 500 lines", () => {
    expect(read(name).split("\n").length).toBeLessThan(500);
  });

  it("sends the agent to the CLI for the language instead of restating it", () => {
    expect(body).toContain("`archlang spec`");
    expect(body).toContain("--help`");
    // No grammar of its own: a fenced ArchLang block would be a second copy of the language.
    // The one exception is the umbrella's lead example (ADR 0028 §7), which is not a second
    // copy but the SAME text as the spec's `LEAD_EXAMPLE`, pinned verbatim by
    // test/spec-forms.test.ts; any other fence, there or in a task skill, still fails here.
    const fences = [...body.replace(/\r\n/g, "\n").matchAll(/^```arch\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
    expect(fences).toEqual(name === UMBRELLA ? [LEAD_EXAMPLE] : []);
    expect(body.match(/^```arch/gm)?.length ?? 0).toBe(fences.length);
  });

  it("names only commands and flags the CLI declares", () => {
    const found = invocations(body);
    expect(found.length, "the skill names no `archlang` invocation at all").toBeGreaterThan(3);
    expect(found.flatMap((inv) => faults(inv).map((f) => `${inv} — ${f}`))).toEqual([]);
  });

  it("writes the command as `archlang` or `npx -y @chanmeng666/archlang`, never a bare `arch`", () => {
    const found = invocations(body);
    expect(found.filter((inv) => /^arch\s/.test(inv))).toEqual([]);
    expect(found.filter((inv) => /^npx @chanmeng666/.test(inv))).toEqual([]);
    // The fallback guard is about `archlang`: coreutils puts an `arch` on the path, so a guard
    // that asks whether `arch` is there never fires. The umbrella skill states it in its setup.
    if (name === UMBRELLA) expect(body).toContain("write `npx -y @chanmeng666/archlang <cmd>`");
    else expect(body).toContain("If `archlang` is not on the path, write `npx -y @chanmeng666/archlang`");
    expect(body).not.toContain("If `arch` is not on the path");
  });
});
