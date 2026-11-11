/**
 * Keeps `docs/says-no.md` true: every output the page shows is produced here, from the plan or the
 * file the page runs the CLI on, and `test/docs-says-no.test.ts` fails when the page differs from
 * what this renders.
 *
 * The page is a sequence of fences. A `bash` fence whose first line starts with `archlang ` is a
 * command; a `json` fence right after it is the output of that command, reduced to the fields the
 * page says it keeps ({@link reduce}). The command runs in-process (`runCli`, the same dispatch the
 * binary runs) against:
 *   - `plan.arch`, written from the nearest `arch static` fence above it into a temporary
 *     directory, so the command line on the page is the command a reader types; or
 *   - any other path, resolved from the repository root (`examples/studio.arch`).
 * A second line `# exit N` in the bash fence is rewritten to the real exit code.
 *
 * Between `<!-- says-no:profiles:start -->` and `<!-- says-no:profiles:end -->` the page carries a
 * table of numbers read from `LINT_PROFILES` and `DEFAULT_RULESET` (`src/lint/ruleset.ts`), never
 * retyped: {@link PROFILE_ROWS} names the ruleset field of each row.
 *
 *   npx tsx scripts/says-no.ts            check: print a diff summary, exit 1 when the page is stale
 *   npx tsx scripts/says-no.ts --write    rewrite the generated parts of docs/says-no.md
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CliIo } from "../src/cli/io.js";
import { runCli } from "../src/cli/run.js";
import { DEFAULT_RULESET, LINT_PROFILES, type LintRuleset, resolveRuleset } from "../src/lint/ruleset.js";

export const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
export const PAGE = "docs/says-no.md";

export const PROFILES_START = "<!-- says-no:profiles:start -->";
export const PROFILES_END = "<!-- says-no:profiles:end -->";

/** The profile columns, in the order the repo lists them: the defaults, then `LINT_PROFILES`. */
const COLUMNS: readonly string[] = ["default", ...Object.keys(LINT_PROFILES)];

type Row = {
  label: string;
  /** Reads one number (or null: the profile sets none) out of a resolved ruleset. */
  read: (r: LintRuleset) => number | null | undefined;
  field: string;
};

/** The rows of the profile table: a ruleset field each, so every number is read, never typed. */
export const PROFILE_ROWS: readonly Row[] = [
  { label: "Least door width (mm)", field: "minDoorWidthMm", read: (r) => r.minDoorWidthMm },
  { label: "Least room area, generic floor (m²)", field: "minRoomAreaM2", read: (r) => r.minRoomAreaM2 },
  {
    label: "Least bedroom area, set per use (m²)",
    field: "minRoomAreaByUseM2.bedroom",
    read: (r) => r.minRoomAreaByUseM2.bedroom,
  },
  { label: "Stair riser, at most (mm)", field: "stairMaxRiseMm", read: (r) => r.stairMaxRiseMm },
  { label: "Stair going, at least (mm)", field: "stairMinGoingMm", read: (r) => r.stairMinGoingMm },
  { label: "WC centre to side wall, at least (mm)", field: "wcSideClearanceMm", read: (r) => r.wcSideClearanceMm },
];

/** The table, as the page carries it between its two markers. */
export function renderProfileTable(): string {
  const rulesets = COLUMNS.map((c) =>
    c === "default" ? resolveRuleset({}, {}) : resolveRuleset(LINT_PROFILES[c]!, {}),
  );
  // Guard: the "default" column is DEFAULT_RULESET itself, so a change to it moves the table.
  if (rulesets[0]!.minDoorWidthMm !== DEFAULT_RULESET.minDoorWidthMm)
    throw new Error("default column is not DEFAULT_RULESET");
  const cell = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : String(v));
  const head = `| Setting | ${COLUMNS.map((c) => (c === "default" ? "default" : `\`${c}\``)).join(" | ")} |`;
  const rule = `| --- | ${COLUMNS.map(() => "---:").join(" | ")} |`;
  const body = PROFILE_ROWS.map((row) => `| ${row.label} | ${rulesets.map((r) => cell(row.read(r))).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

type Json = Record<string, unknown>;

const pick = (o: unknown, keys: readonly string[]): Json => {
  const out: Json = {};
  if (o && typeof o === "object") for (const k of keys) if (k in (o as Json)) out[k] = (o as Json)[k];
  return out;
};

/**
 * What the page keeps of a command's `--json` output; the page says so in prose. Diagnostics keep
 * their code, message and position; the byte `span`, the long `fix` text, the `hints` and the
 * `coverage` block are left out. `impact` keeps the broken keeps and the lock.
 */
export function reduce(verb: string, full: Json, args: readonly string[] = []): Json {
  if (verb === "lint" || verb === "validate") {
    const out: Json = pick(full, ["summary", "ok", "strict"]);
    // A `--profile` run keeps the code and position only: the page quotes the message in prose.
    const keep = args.includes("--profile") ? ["code", "line", "col"] : ["code", "message", "line", "col"];
    out.diagnostics = ((full.diagnostics as unknown[]) ?? []).map((d) => pick(d, keep));
    if (verb === "validate" && Array.isArray(full.keeps)) {
      out.keeps = full.keeps.map((k) => pick(k, ["keep", "grade", "holds", "residual_mm"]));
    }
    return out;
  }
  if (verb === "impact") {
    const lock = full.lock as Json | undefined;
    const keeps = full.keeps as Json | undefined;
    const out: Json = {};
    if (keeps) {
      out.keeps_broke = ((keeps.broke as unknown[]) ?? []).map((k) =>
        pick(k, ["keep", "grade", "residual_mm", "changed"]),
      );
    }
    if (lock) {
      out.lock = {
        ...pick(lock, ["ok", "locked"]),
        violations: ((lock.violations as unknown[]) ?? []).map((v) =>
          pick(v, ["code", "id", "kind", "change", "message"]),
        ),
      };
    }
    return out;
  }
  throw new Error(`says-no: no reduction for \`archlang ${verb}\``);
}

interface RunResult {
  status: number;
  stdout: string;
}

async function runArchlang(args: readonly string[], cwd: string): Promise<RunResult> {
  const out: Buffer[] = [];
  const sink = (to: Buffer[]): CliIo["stdout"] => ({
    write: (chunk) => {
      to.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
    },
  });
  const io: CliIo = {
    stdout: sink(out),
    stderr: sink([]),
    readStdin: () => Buffer.alloc(0),
    cwd: () => cwd,
    env: process.env,
  };
  const home = process.cwd();
  process.chdir(cwd);
  try {
    const status = await runCli(args, io);
    if (typeof status !== "number") throw new Error(`says-no: \`archlang ${args.join(" ")}\` stayed resident`);
    return { status, stdout: Buffer.concat(out).toString("utf8") };
  } finally {
    process.chdir(home);
  }
}

interface Fence {
  /** Line index of the opening fence. */
  open: number;
  /** Line index of the closing fence. */
  close: number;
  lang: string;
  info: string;
  lines: string[];
}

function fences(lines: readonly string[]): Fence[] {
  const out: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^```(\S*)\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j]!)) j++;
    out.push({ open: i, close: j, lang: m[1]!, info: m[2]!.trim(), lines: lines.slice(i + 1, j) });
    i = j;
  }
  return out;
}

/** One command on the page and what running it gave. */
export interface Demo {
  command: string;
  plan: string | undefined;
  status: number;
  reduced: Json;
}

/** The page with every generated part regenerated, and the demos it ran. */
export async function renderSaysNo(md: string): Promise<{ text: string; demos: Demo[] }> {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const fs = fences(lines);
  const demos: Demo[] = [];
  const edits: Array<{ from: number; to: number; replacement: string[] }> = [];
  let plan: string | undefined;
  const scratch = mkdtempSync(join(tmpdir(), "says-no-"));
  try {
    for (let k = 0; k < fs.length; k++) {
      const f = fs[k]!;
      if (f.lang === "arch" && f.info === "static") {
        plan = `${f.lines.join("\n")}\n`;
        continue;
      }
      if (f.lang !== "bash" || !f.lines[0]?.startsWith("archlang ")) continue;
      const next = fs[k + 1];
      if (next?.lang !== "json") throw new Error(`says-no: line ${f.open + 1}: a command needs a json fence after it`);
      const command = f.lines[0]!;
      const args = command.split(/\s+/).slice(1);
      const verb = args[0]!;
      const usesPlan = args.includes("plan.arch");
      if (usesPlan && plan === undefined)
        throw new Error(`says-no: line ${f.open + 1}: plan.arch with no arch static fence above`);
      if (usesPlan) writeFileSync(join(scratch, "plan.arch"), plan!, "utf8");
      const run = await runArchlang(args, usesPlan ? scratch : REPO);
      const reduced = reduce(verb, JSON.parse(run.stdout) as Json, args);
      demos.push({ command, plan: usesPlan ? plan : undefined, status: run.status, reduced });
      edits.push({ from: f.open + 1, to: f.close, replacement: [command, `# exit ${run.status}`] });
      edits.push({ from: next!.open + 1, to: next!.close, replacement: JSON.stringify(reduced, null, 2).split("\n") });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  // Apply from the bottom up so earlier indexes stay valid.
  for (const e of edits.sort((a, b) => b.from - a.from)) lines.splice(e.from, e.to - e.from, ...e.replacement);
  let text = lines.join("\n");
  const a = text.indexOf(PROFILES_START);
  const b = text.indexOf(PROFILES_END);
  if (a < 0 || b < a) throw new Error(`says-no: ${PAGE} lacks the ${PROFILES_START} … ${PROFILES_END} markers`);
  text = `${text.slice(0, a + PROFILES_START.length)}\n\n${renderProfileTable()}\n\n${text.slice(b)}`;
  return { text, demos };
}

async function main(): Promise<void> {
  const file = join(REPO, PAGE);
  const current = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const { text } = await renderSaysNo(current);
  if (process.argv.includes("--write")) {
    writeFileSync(file, text, "utf8");
    process.stdout.write(`${PAGE}: ${text === current ? "already current" : "rewritten"}\n`);
  } else if (text !== current) {
    process.stderr.write(`${PAGE} is stale; run: npx tsx scripts/says-no.ts --write\n`);
    process.exit(1);
  } else {
    process.stdout.write(`${PAGE}: current\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
