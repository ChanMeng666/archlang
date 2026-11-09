/**
 * Generate `test/INDEX.md`: for every `src` module the tests that import it, and for every test file
 * the first sentence of its header, so a reader (or an agent) finds the test for a module, and the
 * modules no test imports, without grepping 500 flat files (card EH3.4).
 *
 * What "imports" means: a test file reaches a `src` module when it imports it, or imports a
 * non-test file under `test/` (`test/helpers/`, `test/tables/`, a baseline) that does, transitively.
 * The walk STOPS at `src`: `src/index.ts` is a barrel, so following it would make every test
 * "import" every module and the index would say nothing. A module reached by no test path is
 * exercised only through `compile()` and appears in the last section. The import resolver is a copy of
 * the one in `scripts/check-quick.mjs` (static `from`, `import(...)`, bare `import "x"`; plus the
 * `archlang` package aliases `vitest.config.ts` adds); keep the two in step.
 *
 * Only the root `test/` suite is indexed; the workspaces' tests (`playground/test`, `packages/*\/test`,
 * `editors/vscode/test`) reach the core through the package name and are not listed here.
 *
 * A test file with no header comment FAILS the generator: the first sentence of its leading comment
 * is the index entry, so a file without one is a file nobody can find. {@link buildIndex} is pure
 * (file texts in, markdown out) so `test/test-index.test.ts` can regenerate in memory.
 * Run `npm run gen:test-index`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "test/INDEX.md";

/** The package specifiers `vitest.config.ts` aliases to a `src` file. */
const ALIAS: Record<string, string> = {
  archlang: "src/index.ts",
  "archlang/share": "src/share.ts",
  "@chanmeng666/archlang": "src/index.ts",
  "@chanmeng666/archlang/link": "src/cli/link.ts",
  "@chanmeng666/archlang/share": "src/share.ts",
};
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** The tracked files the index reads, with their text: `src/**\/*.ts` and every `.ts` under `test/`. */
export type FileTexts = ReadonlyMap<string, string>;

/** Resolve a relative or aliased specifier from `from` to a tracked file, or null. */
function resolveSpec(from: string, spec: string, files: FileTexts): string | null {
  if (ALIAS[spec]) return ALIAS[spec];
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  const stem = base.replace(/\.(js|mjs|cjs|ts)$/, "");
  for (const cand of [base, `${stem}.ts`, `${stem}.tsx`, `${base}/index.ts`]) if (files.has(cand)) return cand;
  return null;
}

const isTest = (f: string): boolean => /^test\/.*\.test\.ts$/.test(f);
const isSrc = (f: string): boolean => f.startsWith("src/") && f.endsWith(".ts") && !f.endsWith(".d.ts");

/**
 * The first sentence of a file's leading comment (a block comment or a run of `//` lines before any
 * code), whitespace collapsed; null when the file starts with code. A `{@link x}` or backtick span
 * is kept as written.
 */
export function headerSentence(text: string): string | null {
  const t = text.replace(/^﻿/, "").replace(/^#!.*\n/, "");
  let body: string | null = null;
  const block = /^\s*\/\*+([\s\S]*?)\*\//.exec(t);
  if (block)
    body = (block[1] ?? "")
      .split("\n")
      .map((l) => l.replace(/^\s*\*+ ?/, ""))
      .join(" ");
  else {
    const m = /^(\s*\/\/[^\n]*\n)+/.exec(t);
    if (m)
      body = m[0]
        .split("\n")
        .map((l) => l.replace(/^\s*\/\/+ ?/, ""))
        .join(" ");
  }
  if (body === null) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  // First sentence: up to the first ". " / ".\n" / end; a "e.g." or "i.e." inside does not end it.
  const m = /^(.*?(?<!\be\.g|\bi\.e|\betc|\bvs|\bcf)[.!?])(?=\s|$)/.exec(flat);
  const first = m?.[1] ?? flat;
  return first.length > 220 ? `${first.slice(0, 217).trimEnd()}...` : first;
}

export interface IndexInput {
  /** Every tracked `src/**\/*.ts` and `test/**\/*.ts` file with its text. */
  files: FileTexts;
}

/** Tests per `src` module, nearest first (a direct import before one through a helper). */
export function testsBySrc(files: FileTexts): Map<string, { test: string; distance: number }[]> {
  const edges = new Map<string, string[]>();
  for (const [f, text] of files) {
    if (!f.startsWith("test/")) continue;
    const out: string[] = [];
    for (const m of text.matchAll(SPEC)) {
      const r = resolveSpec(f, m[1] as string, files);
      if (r) out.push(r);
    }
    edges.set(f, out);
  }
  const result = new Map<string, { test: string; distance: number }[]>();
  for (const f of files.keys()) if (isSrc(f)) result.set(f, []);
  for (const t of [...files.keys()].filter(isTest).sort()) {
    const dist = new Map<string, number>([[t, 0]]);
    let frontier = [t];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const to of edges.get(f) ?? []) {
          if (dist.has(to)) continue;
          const d = (dist.get(f) ?? 0) + 1;
          dist.set(to, d);
          if (isSrc(to)) result.get(to)?.push({ test: t, distance: d });
          else if (to.startsWith("test/")) next.push(to);
        }
      }
      frontier = next;
    }
  }
  for (const list of result.values()) list.sort((a, b) => a.distance - b.distance || (a.test < b.test ? -1 : 1));
  return result;
}

const SHOWN = 8;
const short = (t: string): string => t.slice("test/".length).replace(/\.test\.ts$/, "");

/** The generated markdown. Throws when a test file has no header comment. */
export function buildIndex({ files }: IndexInput): string {
  const tests = [...files.keys()].filter(isTest).sort();
  const headers = new Map<string, string>();
  const missing: string[] = [];
  for (const t of tests) {
    const h = headerSentence(files.get(t) ?? "");
    if (h) headers.set(t, h);
    else missing.push(t);
  }
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} test file(s) have no header comment (the index quotes its first sentence); add one:\n  ${missing.join("\n  ")}`,
    );
  }
  const bySrc = testsBySrc(files);
  const srcs = [...bySrc.keys()].sort();
  const unimported = srcs.filter((s) => (bySrc.get(s) ?? []).length === 0);

  const lines: string[] = [
    "<!-- Generated by scripts/gen-test-index.ts (npm run gen:test-index). Do not edit; edit the test headers and src imports. -->",
    "",
    "# Test index",
    "",
    "Where the tests of a `src` module are, and what each test file is for. Generated; `npm run check:drift`",
    "fails when it is stale. How to add a test: `docs/testing.md` § 4.",
    "",
    `${tests.length} test files in \`test/\`, ${srcs.length} \`src\` modules, ${unimported.length} modules no test imports.`,
    "",
    "## `src` module → tests that import it",
    "",
    "A test reaches a module by importing it, or by importing a non-test file under `test/` (a helper, a table, a",
    "baseline) that does; the walk stops at `src`, so the `src/index.ts` barrel does not count as importing everything.",
    "Nearest first, then by name; `(+n)` is the rest. Test names are `test/<name>.test.ts`.",
    "",
  ];
  for (const s of srcs) {
    const list = bySrc.get(s) ?? [];
    if (list.length === 0) continue;
    const shown = list.slice(0, SHOWN).map((e) => `\`${short(e.test)}\``);
    const more = list.length > SHOWN ? ` (+${list.length - SHOWN})` : "";
    lines.push(`- \`${s}\` (${list.length}) — ${shown.join(", ")}${more}`);
  }
  lines.push("", "## Test files", "", "The first sentence of each file's header comment.", "");
  for (const t of tests) lines.push(`- \`${t}\` — ${headers.get(t)}`);
  lines.push(
    "",
    "## `src` modules no test imports",
    "",
    "Reached only through `compile()` (or not at all by the root `test/` suite). A reviewable list: a module here",
    "is covered by a pipeline test or by none; adding a direct test removes it.",
    "",
  );
  for (const s of unimported) lines.push(`- \`${s}\``);
  lines.push("");
  return lines.join("\n");
}

function gitFiles(...specs: string[]): string[] {
  return execFileSync("git", ["ls-files", ...specs], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\n")
    .filter(Boolean);
}

/** The tracked `src/**\/*.ts` and `test/**\/*.ts` files with their text, in a stable order. */
export function readFiles(): Map<string, string> {
  const names = gitFiles(":(glob)src/**/*.ts", ":(glob)test/**/*.ts").sort();
  return new Map(names.map((f) => [f, readFileSync(resolve(ROOT, f), "utf8")] as const));
}

function main(): void {
  const md = buildIndex({ files: readFiles() });
  writeFileSync(resolve(ROOT, OUT), md);
  process.stdout.write(`✓ generated ${OUT} (${md.split("\n").length} lines)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
