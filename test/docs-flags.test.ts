/**
 * Docs↔manifest flag gate: every `arch <cmd> … --flag` written in a hand-maintained
 * doc must be a flag that command actually DECLARES in `src/manifest.ts`.
 *
 * This exists because of a real bug. `docs-site/agents.md` — the one page an agent
 * reads to learn the self-correction loop — told it to run `arch fix --write`. But
 * `--write` belongs to `fmt`; `fix` never accepted it. The old parser silently
 * swallowed the unknown flag as a positional, so the wrong instruction sat there
 * unnoticed. An undeclared flag is now a usage error (exit 3), which turned that
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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { buildManifest } from "../src/manifest.js";

/** Hand-maintained docs that carry `arch …` invocations. Generated files are covered by `check:drift`. */
const DOCS = [
  "README.md",
  "docs/overview.md",
  "llms.txt",
  "skills/archlang/SKILL.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agents/commands.md",
  "docs/agents/gotchas.md",
  "docs/agents/iron-laws.md",
  "CONTRIBUTING.md",
  "docs-site/agents.md",
  "docs-site/guide.md",
  "docs-site/index.md",
  "docs-site/start.md",
  "docs-site/examples.md",
  "docs-site/gallery.md",
  "docs-site/floor-plans-as-code.md",
  "docs-site/floor-plan-dsl.md",
  "docs-site/mcp.md",
  "docs-site/javascript.md",
  "docs-site/vs-mermaid.md",
  "docs-site/floor-plan-tools-for-ai-agents.md",
  "docs-site/floor-plan-with-a-coding-agent.md",
  "docs-site/text-to-dxf-floor-plan.md",
  "docs-site/check-a-floor-plan.md",
  "docs-site/3d.md",
  "docs/analysis.md",
  "docs/axonometric.md",
  "docs/language-reference.md",
  "docs/showcase.md",
  "docs/intent.md",
  "docs/furniture.md",
  "packages/mcp/README.md",
  ".claude/agents/arch-author.md",
  ".claude/commands/regen.md",
  ".claude/commands/verify-loop.md",
  ".claude/commands/release-check.md",
  "llms-install.md",
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
  // Every spelling of the command: the scoped package via npx (with or without `-y`), the global
  // `archlang` bin, and its `arch` alias.
  const invocation = /(?:npx (?:-y )?@chanmeng666\/archlang|\barch(?:lang)?)\s+([a-z][a-z-]*)((?:\s+[^\n`|]*)?)/g;
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

  it("checks every spelling of the command, not only the `arch` alias", () => {
    for (const cli of ["archlang", "npx -y @chanmeng666/archlang", "npx @chanmeng666/archlang"]) {
      const bad = undeclaredUsages("canary.md", `Run \`${cli} fix plan.arch --write\` to apply.`, byCommand);
      expect(bad, cli).toHaveLength(1);
      expect(bad[0]).toContain("--write");
    }
  });

  it.each(DOCS)("%s", (file) => {
    if (!existsSync(file)) return; // a doc may legitimately not exist in a partial checkout
    expect(undeclaredUsages(file, readFileSync(file, "utf8"), byCommand)).toEqual([]);
  });
});

/**
 * Agent-facing docs write the command as `archlang <cmd>` or `npx -y @chanmeng666/archlang <cmd>`.
 *
 * A bare `arch <cmd>` runs the coreutils `arch` on Linux, macOS and Git Bash (`arch: extra operand`),
 * and the unscoped npm name `archlang` belongs to another publisher, so neither may be what an
 * agent copies. `arch` stays a working alias bin, and the generated spec keeps it under one line
 * that says what it means; these hand-written pages do not use it. A plain `npx @chanmeng666/archlang`
 * (no `-y`) is not written either: npx prompts only when stdin is a TTY (a person, or an agent
 * harness with a PTY); `-y` makes every case non-interactive.
 */
describe("agent-facing docs never tell an agent to run a bare `arch` or a prompting npx", () => {
  const AGENT_DOCS = [
    "README.md",
    "llms.txt",
    "docs/overview.md",
    "docs-site/agents.md",
    "docs-site/guide.md",
    "docs-site/index.md",
    "docs-site/start.md",
    "docs-site/examples.md",
    "docs-site/gallery.md",
    "docs-site/floor-plans-as-code.md",
    "docs-site/floor-plan-dsl.md",
    "docs-site/mcp.md",
    "docs-site/javascript.md",
    "docs-site/vs-mermaid.md",
    "docs-site/floor-plan-tools-for-ai-agents.md",
    "docs-site/floor-plan-with-a-coding-agent.md",
    "docs-site/text-to-dxf-floor-plan.md",
    "docs-site/check-a-floor-plan.md",
    "docs-site/3d.md",
    "llms-install.md",
    // The reference pages the docs site syncs from `docs/` (the generated spec is exempt: it keeps
    // `arch <cmd>` under its one alias line).
    "docs/language-reference.md",
    "docs/analysis.md",
    "docs/intent.md",
    "docs/furniture.md",
    "docs/showcase.md",
    "docs/axonometric.md",
    ...readdirSync("skills").map((d) => `skills/${d}/SKILL.md`),
  ];
  const verbs = [...declaredFlags().keys(), "help"].join("|");
  const bareArch = new RegExp(String.raw`(?<![\w./@-])arch\s+(?:${verbs}|<cmd>|--help|--version)\b`, "g");
  const promptingNpx = /npx @chanmeng666\/archlang(?![\w-])/g;
  const offenders = (file: string, text: string): string[] => {
    const bad: string[] = [];
    text.split("\n").forEach((line, i) => {
      for (const hit of line.matchAll(bareArch)) bad.push(`${file}:${i + 1} — bare \`${hit[0]}\``);
      for (const hit of line.matchAll(promptingNpx)) bad.push(`${file}:${i + 1} — \`${hit[0]}\` without -y`);
    });
    return bad;
  };

  it("catches a bare `arch` call and an npx without -y (the canaries)", () => {
    expect(offenders("canary.md", "Run `arch context` first.")).toHaveLength(1);
    expect(offenders("canary.md", "Run `npx @chanmeng666/archlang spec`.")).toHaveLength(1);
    expect(offenders("canary.md", "Run `archlang context`, or `npx -y @chanmeng666/archlang spec`.")).toEqual([]);
    expect(offenders("canary.md", "A plan file is `plan.arch` and `examples/studio.arch`.")).toEqual([]);
  });

  it.each(AGENT_DOCS)("%s", (file) => {
    expect(offenders(file, readFileSync(file, "utf8"))).toEqual([]);
  });
});

/**
 * Docs↔suggest gate: a `door`/`window` example that reads as an `arch suggest`
 * candidate must NEVER reference a wall by its positional auto-id (`on partition_3`).
 *
 * `suggestTopology` composes every candidate's `insertText` from a STABLE
 * ref only — an author-declared id, else a unique category, else absolute `at (x, y)` —
 * because a positional id (`<category>_<n>`) re-indexes when a later same-category wall
 * is inserted, silently corrupting a suggestion a downstream product persisted. The code
 * golden (`test/suggest.test.ts`'s `noPositionalId`) pins the output; this pins the prose,
 * so a doc can't teach the re-bindable form the CLI stopped emitting. Same `on \w+_\d+`
 * idiom as that golden. Author ids like `wall_hall_bath` (no trailing digits) don't match.
 */
describe("docs never show a suggest candidate that names a wall by a positional auto-id", () => {
  /** Every `door|window on <cat>_<n> …` in `text` (the re-bindable positional form). */
  const positionalRefs = (file: string, text: string): string[] => {
    const bad: string[] = [];
    text.split("\n").forEach((line, i) => {
      for (const hit of line.matchAll(/\b(?:door|window) on (\w+_\d+)\b/g)) {
        bad.push(`${file}:${i + 1} — suggest example names wall by positional id \`${hit[1]}\``);
      }
    });
    return bad;
  };

  it("catches a positional-id suggest example (the re-binding hazard this gate exists for)", () => {
    const bad = positionalRefs("canary.md", "Insert `door on partition_3 at 50% width 900`.");
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("partition_3");
  });

  it.each(DOCS)("%s", (file) => {
    if (!existsSync(file)) return;
    expect(positionalRefs(file, readFileSync(file, "utf8"))).toEqual([]);
  });
});
