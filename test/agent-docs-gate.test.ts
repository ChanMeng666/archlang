/** agent docs name no blocked command. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Agent-facing docs never tell an agent to run a command the local-gate hook blocks.
 *
 * The blocked patterns are `HEAVY` in `.claude/hooks/local-gate.mjs`. The hook does not export
 * them (exporting is a hook edit, high tier), so this test PARSES the regex literals out of the
 * hook's source: every `[/pattern/flags, "label"],` row of the `const HEAVY = [ … ];` block. A new
 * row in the hook is enforced here with no second edit; a changed hook shape fails
 * `parseHeavy` loudly rather than passing on an empty list.
 *
 * A line that names a blocked command passes only when the same line says whose job it is:
 * `#allow-local-heavy`, "CI runs", "CI's", "CI only" or "owner". Rewrite the sentence as "CI runs X;
 * read its result" rather than adding the words to a bare instruction.
 *
 * Recipes are referred to as files to read (`.claude/commands/x.md`), never as `/x` (EH-D3: the
 * owner's settings turn skills off), so a `/<recipe>` slash-invocation is a hit too.
 */

const ROOT = join(__dirname, "..");
const HOOK = join(ROOT, ".claude", "hooks", "local-gate.mjs");

function parseHeavy(source: string): [RegExp, string][] {
  const start = source.indexOf("const HEAVY = [");
  const end = source.indexOf("\n];", start);
  expect(start, "`const HEAVY = [` not found in the hook").toBeGreaterThanOrEqual(0);
  expect(end, "end of the HEAVY block not found in the hook").toBeGreaterThan(start);
  const rows: [RegExp, string][] = [];
  for (const line of source.slice(start, end).split("\n")) {
    const m = /^\s*\[\/(.+)\/([a-z]*),\s*"([^"]+)"\],?\s*$/.exec(line);
    if (m) rows.push([new RegExp(m[1] as string, m[2]), m[3] as string]);
  }
  return rows;
}

function markdownUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "worktrees" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markdownUnder(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const SCANNED = [
  ...markdownUnder(join(ROOT, "docs", "agents")),
  ...markdownUnder(join(ROOT, ".claude")),
  join(ROOT, "docs", "backlog.md"),
  join(ROOT, "REVIEW.md"),
];
// Not scanned: CONTRIBUTING.md (written for human contributors, who may run the suite) and
// AGENTS.md (high tier, owner-edited; it states the CI-only rule itself).

/**
 * The command invocations on a line: inline code spans (or the unclosed tail of one that wraps)
 * and lines of a fenced block that start like a shell command. A bare mention such as "`check:drift`
 * is green" is prose, not an instruction, and is not a hit; `npm run check:drift` is.
 */
const COMMAND = /^(?:\$ )?(?:[A-Z0-9_]+=\S+ )*(?:npm|npx|pnpm|yarn|vitest|playwright|node|tsx)(?=\s+\S)/;
function invocations(line: string, fenced: boolean): string[] {
  const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
  const open = /`([^`]*)$/.exec(line.replace(/`[^`]*`/g, ""));
  if (open?.[1]) spans.push(open[1]);
  if (fenced && COMMAND.test(line.trim())) spans.push(line.trim());
  return spans.filter((s) => COMMAND.test(s.trim()));
}

const OWNED = /#allow-local-heavy|CI runs|CI's|CI only|owner/;

/** The HEAVY label a line invokes without saying whose job it is, or undefined. */
function flagged(text: string, fenced: boolean, heavy: [RegExp, string][]): string | undefined {
  if (OWNED.test(text)) return undefined;
  for (const cmd of invocations(text, fenced)) {
    const hit = heavy.find(([re]) => re.test(cmd));
    if (hit) return hit[1];
  }
  return undefined;
}

describe("agent docs name no blocked command", () => {
  const heavy = parseHeavy(readFileSync(HOOK, "utf8"));

  it("parses every HEAVY row of the hook", () => {
    expect(heavy.length).toBeGreaterThanOrEqual(7);
    expect(heavy.map(([, label]) => label)).toContain("typecheck:all");
  });

  it("positive control: every HEAVY form is flagged, and the owned or mention-only forms are not", () => {
    const forms = [
      "run `npx vitest run test/x.test.ts` now",
      "run `npm test` now",
      "run `npm run check` now",
      "run `npm run check:drift` now",
      "run `npm run typecheck:all` now",
      "run `npm run check:3d` now",
      "run `npm run e2e:playground` now",
      "run `npm run bench` now",
      "run `E2E_PROD=1 E2E_BASE_URL=https://x npx playwright test -c docs-site` now",
    ];
    for (const form of forms) expect(flagged(form, false, heavy), form).toBeDefined();
    expect(flagged("npm test", true, heavy), "fenced line").toBeDefined();
    expect(flagged("CI runs `npm run check:drift`", false, heavy)).toBeUndefined();
    expect(flagged("the owner runs `npx vitest run x` #allow-local-heavy", false, heavy)).toBeUndefined();
    expect(flagged("`check:drift` is green", false, heavy), "a bare mention").toBeUndefined();
  });

  it("a blocked command in an agent doc says it is CI's or the owner's", () => {
    const hits: string[] = [];
    for (const file of SCANNED) {
      let fenced = false;
      let ownedTable = false;
      let prevTable = false;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, i) => {
          if (/^\s*```/.test(text)) fenced = !fenced;
          // A table whose header row says whose job it is covers every row below it.
          const table = text.startsWith("|");
          if (table && !prevTable) ownedTable = OWNED.test(text);
          prevTable = table;
          if (table && ownedTable) return;
          const label = flagged(text, fenced, heavy);
          if (label)
            hits.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${i + 1} [${label}] ${text.trim().slice(0, 100)}`);
        });
    }
    expect(
      hits,
      `blocked command without "CI runs"/"CI's"/"owner"/#allow-local-heavy on the line:\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  it("recipes are named as files, never as a /slash invocation", () => {
    const recipes = readdirSync(join(ROOT, ".claude", "commands"))
      .filter((n) => n.endsWith(".md"))
      .map((n) => n.slice(0, -3));
    expect(recipes.length).toBeGreaterThan(0);
    const slash = new RegExp(`(?<![\\w./-])/(?:${recipes.join("|")})(?![\\w-])`);
    const hits: string[] = [];
    for (const file of SCANNED) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, i) => {
          if (slash.test(text))
            hits.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${i + 1} ${text.trim().slice(0, 100)}`);
        });
    }
    expect(hits, `read \`.claude/commands/x.md\` instead of \`/x\`:\n${hits.join("\n")}`).toEqual([]);
  });
});
