/**
 * Docs↔manifest flag gate: every `arch <cmd> … --flag` written in a hand-maintained
 * doc must be a flag that command actually DECLARES in `src/manifest.ts`.
 *
 * This exists because of a real bug. `docs-site/agents.md` — the one page an agent
 * reads to learn the self-correction loop — told it to run `arch fix --write`. But
 * `--write` belongs to `fmt`; `fix` never accepted it. The old parser silently
 * swallowed the unknown flag as a positional, so the wrong instruction sat there
 * unnoticed. v1.17 made an undeclared flag a usage error (exit 3), which turned that
 * stale sentence into a hard failure for every agent following the page.
 *
 * The lesson is that prose drifts from the CLI in exactly the way generated files
 * cannot, so the prose needs a gate of its own. `docs/cli-reference.md`, `spec.llm.md`
 * and `llms-full.txt` are generated and covered by `check:drift`; these files are not.
 *
 * Scope note: this checks flag EXISTENCE per command, not whether a value is well-formed
 * — a cheap invariant that catches the whole `--write` class. Deliberately-wrong flags
 * used to demonstrate an error message (e.g. showing what `--jsn` prints) must appear
 * inside an output/error block, not as an `arch …` invocation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildManifest } from "../src/manifest.js";

/** Hand-maintained docs that carry `arch …` invocations. Generated files are covered by `check:drift`. */
const DOCS = [
  "README.md",
  "llms.txt",
  "SKILL.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "docs-site/agents.md",
  "docs-site/guide.md",
  "docs-site/index.md",
  "docs/analysis.md",
  "docs/language-reference.md",
  "docs/intent.md",
  "docs/furniture.md",
  "packages/mcp/README.md",
  ".claude/agents/arch-author.md",
  ".claude/commands/regen.md",
  ".claude/commands/verify-loop.md",
  ".claude/commands/release-check.md",
];

/** command name (and alias) → every flag + alias it accepts, incl. the global ones. */
function declaredFlags(): Map<string, Set<string>> {
  const m = buildManifest("0.0.0");
  const globals = new Set<string>(["--help", "-h", "--version", "-V"]);
  for (const g of m.globalFlags) {
    globals.add(g.flag);
    if (g.alias) globals.add(g.alias);
  }
  const byCommand = new Map<string, Set<string>>();
  for (const c of m.commands) {
    const flags = new Set(globals);
    for (const f of c.flags) {
      flags.add(f.flag);
      if (f.alias) flags.add(f.alias);
    }
    byCommand.set(c.name, flags);
    for (const a of c.aliases ?? []) byCommand.set(a, flags);
  }
  return byCommand;
}

/** Every `arch <cmd> … --flag` in `text` whose flag the command does not declare. */
function undeclaredUsages(file: string, text: string, byCommand: Map<string, Set<string>>): string[] {
  const bad: string[] = [];
  const invocation = /(?:npx @chanmeng666\/archlang|\barch)\s+([a-z][a-z-]*)((?:\s+[^\n`|]*)?)/g;
  text.split("\n").forEach((line, i) => {
    for (const hit of line.matchAll(invocation)) {
      const flags = byCommand.get(hit[1]!);
      if (!flags) continue; // the token isn't a real command — prose, not an invocation
      for (const flag of (hit[2] ?? "").match(/(?<![\w-])--?[a-zA-Z][\w-]*/g) ?? []) {
        if (!flags.has(flag))
          bad.push(`${file}:${i + 1} — \`arch ${hit[1]} … ${flag}\` is not a flag of \`${hit[1]}\``);
      }
    }
  });
  return bad;
}

describe("docs never document a flag the command doesn't take", () => {
  const byCommand = declaredFlags();

  it("catches an undeclared flag (the `arch fix --write` bug this gate exists for)", () => {
    const bad = undeclaredUsages("canary.md", "Run `arch fix plan.arch --write` to apply.", byCommand);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("--write");
  });

  it.each(DOCS)("%s", (file) => {
    if (!existsSync(file)) return; // a doc may legitimately not exist in a partial checkout
    expect(undeclaredUsages(file, readFileSync(file, "utf8"), byCommand)).toEqual([]);
  });
});
