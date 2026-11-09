/**
 * Generate `docs/agents/module-map.md`: one row per source module (the files the tracked-file list
 * returns under `src/`, `packages/<pkg>/src/`, `playground/src/` and `playground/worker/`), taken
 * from each module's own header comment, so the map cannot disagree with the code.
 *
 * Per module: the header's first paragraph (comment markers stripped, newlines joined, capped at
 * `SUMMARY_CAP` characters), the optional header tags `@budget <text>`, `@reads <modules>` and
 * `@readBy <modules>`, and three derived facts: whether the code calls `chargeSteps(` (so it charges
 * the step meter), its line count, and its in-repo importer count. A module with no first paragraph
 * FAILS the generator with its path: give it a one-sentence header.
 *
 * Importers: distinct tracked source files (including tests and scripts) whose relative `import`,
 * `export ... from`, `import()` or `require()` specifier resolves to the module. A regex scan, so
 * imports through the package name or an alias are not counted.
 *
 * Deterministic: sorted, no time, no absolute paths. Derived from `git ls-files`, so a new file
 * appears once it is tracked (`git add`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/agents/module-map.md");
export const SUMMARY_CAP = 240;
// `:(glob)` pathspecs: a plain pathspec with a double-star directory would miss the files directly under `src/`.
export const MODULE_GLOBS = [
  ":(glob)src/**/*.ts",
  ":(glob)src/**/*.mjs",
  ":(glob)packages/*/src/**/*.ts",
  ":(glob)playground/src/*.ts",
  ":(glob)playground/worker/*.ts",
] as const;
const IMPORTER_GLOBS = ["*.ts", "*.tsx", "*.mts", "*.mjs", "*.js", "*.vue"] as const;

function lsFiles(globs: readonly string[]): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...globs], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  return out.split("\0").filter(Boolean).sort();
}

/** The modules the map covers. Shared with `test/module-map.test.ts`. */
export function moduleFiles(): string[] {
  return lsFiles(MODULE_GLOBS).filter((f) => !f.endsWith(".d.ts") && !f.endsWith(".test.ts"));
}

/** The module's leading comment as plain lines (markers stripped), or [] when it has none. */
function headerLines(text: string): string[] {
  const t = text
    .replace(/^#![^\n]*\n/, "")
    .replace(/^﻿/, "")
    .trimStart();
  if (t.startsWith("/*")) {
    const end = t.indexOf("*/");
    if (end < 0) return [];
    return t
      .slice(2, end)
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\*+ ?/, "").trimEnd());
  }
  const lines: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("//")) break;
    lines.push(line.replace(/^\s*\/\/+ ?/, "").trimEnd());
  }
  return lines;
}

interface Header {
  summary: string;
  budget: string;
  reads: string;
  readBy: string;
}

export function parseHeader(text: string): Header {
  const lines = headerLines(text);
  const tag = (name: string): string => {
    for (const l of lines) {
      const m = new RegExp(`^@${name}\\s+(.*\\S)`).exec(l);
      if (m) return m[1]!.trim();
    }
    return "";
  };
  const para: string[] = [];
  let started = false;
  for (const l of lines) {
    if (l.trim() === "") {
      if (started) break;
      continue;
    }
    if (/^@(budget|reads|readBy)\b/.test(l)) continue;
    started = true;
    para.push(l.trim());
  }
  let summary = para.join(" ").replace(/\s+/g, " ");
  if (summary.length > SUMMARY_CAP) {
    const cut = summary.slice(0, SUMMARY_CAP - 1);
    const sp = cut.lastIndexOf(" ");
    summary = `${(sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:(]+$/, "")}…`;
  }
  return { summary, budget: tag("budget"), reads: tag("reads"), readBy: tag("readBy") };
}

// Code with line-leading block comments and `//` comments removed (an inline block comment stays).
function stripComments(text: string): string {
  return text.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const SPEC_RE = /\b(?:from|import|require)\s*\(?\s*["'](\.[^"']*)["']/g;

/** The repo path a relative specifier from `file` names, among `known` files, or null. */
function resolveSpec(file: string, spec: string, known: ReadonlySet<string>): string | null {
  const base = posix.normalize(posix.join(posix.dirname(file), spec));
  const stem = base.replace(/\.(js|mjs|ts|tsx)$/, "");
  for (const c of [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.mts`,
    `${stem}.mjs`,
    `${stem}.js`,
    `${base}/index.ts`,
    `${base}/index.js`,
  ]) {
    if (known.has(c)) return c;
  }
  return null;
}

/** Table-cell escapes, character by character (no regex replace, so no character is left half-escaped). */
const CELL_ESC: Record<string, string> = { "|": "\\|", "\\": "\\\\", "\r": " ", "\n": " " };
const esc = (s: string): string => Array.from(s, (c) => CELL_ESC[c] ?? c).join("");

function render(): { text: string; count: number } {
  const modules = moduleFiles();
  const known = new Set(lsFiles(IMPORTER_GLOBS));
  const importers = new Map<string, Set<string>>();
  for (const f of known) {
    if (f.includes("node_modules/")) continue;
    const text = stripComments(readFileSync(resolve(ROOT, f), "utf8"));
    for (const m of text.matchAll(SPEC_RE)) {
      const target = resolveSpec(f, m[1]!, known);
      if (!target || target === f) continue;
      (importers.get(target) ?? importers.set(target, new Set()).get(target)!).add(f);
    }
  }

  const failures: string[] = [];
  const byDir = new Map<string, string[]>();
  for (const f of modules) {
    const text = readFileSync(resolve(ROOT, f), "utf8");
    const h = parseHeader(text);
    if (!h.summary) {
      failures.push(f);
      continue;
    }
    const charges = /\bchargeSteps\(/.test(stripComments(text));
    const budget = [charges ? "charges the step meter" : "", h.budget].filter(Boolean).join("; ") || "none";
    const rel = [h.reads ? `reads ${h.reads}` : "", h.readBy ? `read by ${h.readBy}` : ""].filter(Boolean).join("; ");
    const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    const dir = posix.dirname(f);
    const row = `| \`${posix.basename(f)}\` | ${lines} | ${importers.get(f)?.size ?? 0} | ${esc(h.summary)}${rel ? ` (${esc(rel)})` : ""} | ${esc(budget)} |`;
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(row);
  }
  if (failures.length) {
    throw new Error(
      `gen-module-map: no header paragraph (give each a one-sentence header comment):\n  ${failures.join("\n  ")}`,
    );
  }

  const out: string[] = [
    "<!-- GENERATED by scripts/gen-module-map.ts (npm run gen:module-map). Do not edit by hand. -->",
    "",
    "# Module map",
    "",
    "Every source module (`src/`, `packages/<pkg>/src/`, `playground/src/*.ts`, `playground/worker/*.ts`),",
    "one table per directory: the first paragraph of the module's own header comment (cut at 240",
    "characters), its line count, how many in-repo files import it, and what it charges. To change a",
    "row, edit the module's header, then run `npm run gen:module-map`; a module with no header fails",
    "the generator. A header may carry the tags `@budget <text>`, `@reads <modules>` and `@readBy <modules>`.",
    "",
    '"Charges the step meter" is derived from a `chargeSteps(` call in the code, never from the prose.',
    "Importers are counted by a regex over relative `import` (a type-only `import type` counts),",
    "`export ... from`, `import()` and `require()` specifiers across tracked sources, tests and scripts,",
    "with comments removed first; an import through the package name or an alias is not counted, so a",
    "low count is a hint, not proof a module is unused. A summary is cut at a word boundary; the",
    "module's remaining facts are in its own header.",
    "",
    "[`architecture.md`](architecture.md) holds the pipeline, the conventions and the cross-module",
    "invariants; this file holds every module. The exports of `src/index.ts` are in the sibling",
    "[`public-surface.md`](public-surface.md).",
    "",
    `Totals: ${modules.length} modules in ${byDir.size} directories.`,
    "",
  ];
  for (const dir of [...byDir.keys()].sort()) {
    out.push(
      `## \`${dir}/\``,
      "",
      "| Module | Lines | Importers | Summary | Budget |",
      "| --- | ---: | ---: | --- | --- |",
      ...byDir.get(dir)!,
      "",
    );
  }
  return { text: out.join("\n"), count: modules.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, count } = render();
  writeFileSync(OUT, text);
  process.stdout.write(`wrote docs/agents/module-map.md: ${count} modules\n`);
}
