/**
 * Boundary: a workspace reaches the core (or another workspace) only through a declared package
 * name, except at the seams listed in ALLOW (`workspace-seams.allow.ts`). The root `exports` map has
 * only `.` and `./link`, yet workspaces reach past it. This scans every workspace for a reach into
 * the core's `src/`/`dist/` or ANOTHER workspace's `src/`/`dist/` by
 *   - a relative import/export/`import(` specifier (a template literal too, constants substituted);
 *   - an alias entry (`alias: {}` in a Vite/vitest/esbuild/wrangler config, `paths` in a tsconfig),
 *     the root `vitest.config.ts` included, which every workspace's source resolves through in tests;
 *   - a tsconfig `include`/`files` entry;
 *   - a path a script builds: `new URL("../x", import.meta.url)`, `resolve(__dirname, "../x")`,
 *     `join(REPO, "packages", "mcp", "src", ...)`, `join(repo, CONST)` with literal/constant args.
 *     Paths computed at run time (`join(REPO, rel)`) cannot be seen; paths inside an alias block are
 *     reported once, as the alias.
 * Every hit must be an ALLOW row `{ file, specifier, why }`; an unlisted hit fails, and so does a row
 * with no hit (stale). Test code (`test/`, `e2e/`, `*.test.*`, `*.spec.*`, `*.e2e.*`) is not scanned:
 * it is not shipped, and reading a source under test is its job. The last test parses the table in
 * `docs/agents/architecture.md` back and compares it to ALLOW row by row.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLOW, seamTable } from "./workspace-seams.allow.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The root package.json `workspaces`, a trailing `/*` expanded through the file system. */
function readWorkspaces(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { workspaces?: string[] };
  const out: string[] = [];
  for (const w of pkg.workspaces ?? []) {
    if (w.endsWith("/*")) {
      const base = w.slice(0, -2);
      for (const n of readdirSync(join(ROOT, base)).sort()) {
        if (statSync(join(ROOT, base, n)).isDirectory()) out.push(`${base}/${n}`);
      }
    } else out.push(w);
  }
  return out;
}

const WORKSPACES = readWorkspaces();
/** Root-level configs whose alias block is a seam of its own. */
const ROOT_CONFIGS = ["vitest.config.ts"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".claude",
  "worktrees",
  "dist",
  "build",
  "cache",
  ".astro",
  ".wrangler",
  "coverage",
  "test-results",
  "playwright-report",
  ".vite",
]);
const TEST_DIRS = new Set(["test", "tests", "e2e", "__tests__"]);
const TEST_FILE = /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/;
const CODE = /\.(?:[cm]?[jt]sx?|vue|astro)$/;
const CONFIG = /\.(?:[cm]?[jt]s|jsonc?)$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'`])(\.{1,2}\/[^"'`\n]*)\1/g;

const norm = (p: string) => p.split(sep).join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !TEST_DIRS.has(name)) walk(p, out);
    } else if (!TEST_FILE.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Blank comments (keeping newlines). A `//` inside a string literal blanks the rest of its line (accepted). */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/.*$/gm, (m) => " ".repeat(m.length));
}

/** A repo-relative path that lands in a `src/` or `dist/` of the core or a workspace, else null. */
function seamTarget(rel: string): { owner: string } | null {
  if (/^(?:src|dist)(?:\/|$)/.test(rel)) return { owner: "." };
  for (const ws of WORKSPACES) if (rel.startsWith(`${ws}/src/`) || rel.startsWith(`${ws}/dist/`)) return { owner: ws };
  return null;
}

const wsOf = (rel: string) => WORKSPACES.find((w) => rel.startsWith(`${w}/`)) ?? ".";
const lineAt = (text: string, index: number | undefined) => text.slice(0, index).split("\n").length;

interface Hit {
  file: string;
  line: number;
  specifier: string;
}

/** `const NAME = "literal"` (exported or not) in a file, to resolve `${NAME}` and bare-identifier args. */
function constants(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\n]*)\2/g))
    out.set(m[1] ?? "", m[3] ?? "");
  return out;
}

/** Substitute `${NAME}` from known constants; null while one stays unresolved. */
function fill(s: string, consts: Map<string, string>): string | null {
  const r = s.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (all, n: string) => consts.get(n) ?? all);
  return r.includes("${") ? null : r;
}

function importHits(abs: string, rel: string, text: string, consts: Map<string, string>): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(SPECIFIER)) {
    const spec = fill(m[2] ?? "", consts);
    if (spec === null) continue;
    const target = seamTarget(norm(relative(ROOT, resolve(dirname(abs), spec))));
    if (!target || target.owner === wsOf(rel)) continue;
    hits.push({ file: rel, line: lineAt(text, m.index), specifier: m[2] ?? "" });
  }
  return hits;
}

/** The text of the `{ ... }` block opening at `open` (a `{` index), brace-balanced, strings aware. */
function block(text: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

const ENTRY = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(.*)$/;
const PATHISH = /(?:^|[^\w])(?:src|dist)(?:\/|["'`])/;
const ALIAS_OPENER = /(?:\balias|"paths")["']?\s*:\s*\{/g;

function aliasHits(rel: string, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const o of text.matchAll(ALIAS_OPENER)) {
    const kind = o[0].includes("paths") ? "paths" : "alias";
    const open = (o.index ?? 0) + o[0].length - 1;
    const base = lineAt(text, open);
    // Drop the opening brace, so an entry on the opener's own line (`alias: { k: v },`) parses.
    block(text, open)
      .slice(1)
      .split("\n")
      .forEach((ln, i) => {
        const m = ENTRY.exec(ln.replace(/\}\s*,?\s*$/, ""));
        if (!m) return;
        const key = m[1] ?? m[2] ?? m[3];
        if (key === "alias" || key === "paths") return;
        let value = m[4] ?? "";
        // `alias: { k: someVar }`: look the variable up (`const someVar = join(..., "dist", ...)`).
        const ident = /^([A-Za-z_$][\w$]*)\s*,?\s*$/.exec(value.trim())?.[1];
        if (ident) value = new RegExp(`(?:const|let|var)\\s+${ident}\\s*=([^;\\n]*)`).exec(text)?.[1] ?? value;
        // A bare `"dist"` path segment (join(REPO, "dist", "index.js")) counts as dist/.
        if (PATHISH.test(value) || /["'](?:src|dist)["']/.test(value)) {
          hits.push({ file: rel, line: base + i, specifier: `${kind} ${key}` });
        }
      });
  }
  return hits;
}

/** `include`/`files` string entries of a tsconfig that land in another workspace's (or the core's) src/dist. */
function includeHits(abs: string, rel: string, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/"(?:include|files)"\s*:\s*\[([^\]]*)\]/g)) {
    for (const e of (m[1] ?? "").matchAll(/"([^"]+)"/g)) {
      const entry = e[1] ?? "";
      const target = seamTarget(norm(relative(ROOT, resolve(dirname(abs), entry))));
      if (!target || target.owner === wsOf(rel)) continue;
      hits.push({ file: rel, line: lineAt(text, (m.index ?? 0) + (e.index ?? 0)), specifier: `include ${entry}` });
    }
  }
  return hits;
}

const STR = String.raw`(?:"[^"\n]*"|'[^'\n]*'|\x60[^\x60\n]*\x60|[A-Za-z_$][\w$]*)`;
const PATH_CALL = new RegExp(String.raw`\b(new URL|resolve|join)\(\s*(${STR}(?:\s*,\s*${STR})*)`, "g");
const ROOT_IDENT = /^(?:REPO|repo|ROOT|root)$/;
const DIR_IDENT = /^(?:__dirname|HERE|here)$/;

/** Paths a script builds from literals: new URL(rel, import.meta.url), resolve(__dirname, rel), join(REPO, ...). */
function pathHits(abs: string, rel: string, text: string, consts: Map<string, string>): Hit[] {
  const hits: Hit[] = [];
  // An alias block already reports its paths, as the alias.
  let masked = text;
  for (const o of text.matchAll(ALIAS_OPENER)) {
    const open = (o.index ?? 0) + o[0].length - 1;
    const b = block(text, open);
    masked = masked.slice(0, open) + b.replace(/[^\n]/g, " ") + masked.slice(open + b.length);
  }
  for (const m of masked.matchAll(PATH_CALL)) {
    const fn = m[1];
    const args = (m[2] ?? "").split(/\s*,\s*/);
    const lit = (a: string): string | null => {
      if (/^["'`]/.test(a)) return fill(a.slice(1, -1), consts);
      return consts.get(a) ?? null;
    };
    let from: string;
    let rest: string[];
    if (fn === "new URL") {
      if (!/import\.meta\.url/.test(masked.slice(m.index, (m.index ?? 0) + (m[0]?.length ?? 0) + 60))) continue;
      from = dirname(abs);
      rest = args.slice(0, 1).map((a) => lit(a) ?? "\0");
    } else if (args[0] !== undefined && DIR_IDENT.test(args[0])) {
      from = dirname(abs);
      rest = args.slice(1).map((a) => lit(a) ?? "\0");
    } else if (fn === "join" && args[0] !== undefined && ROOT_IDENT.test(args[0])) {
      from = ROOT;
      rest = args.slice(1).map((a) => lit(a) ?? "\0");
    } else continue;
    if (rest.length === 0 || rest.some((r) => r.includes("\0"))) continue;
    const target = norm(relative(ROOT, fn === "new URL" ? resolve(from, rest[0] ?? "") : resolve(from, ...rest)));
    const seam = seamTarget(target);
    if (!seam || seam.owner === wsOf(rel)) continue;
    hits.push({ file: rel, line: lineAt(text, m.index), specifier: `path ${target}` });
  }
  return hits;
}

function scanFile(abs: string, includeCode: boolean): Hit[] {
  const rel = norm(relative(ROOT, abs));
  const text = stripComments(readFileSync(abs, "utf8"));
  const hits: Hit[] = [];
  if (includeCode && CODE.test(abs)) {
    const consts = constants(text);
    hits.push(...importHits(abs, rel, text, consts), ...pathHits(abs, rel, text, consts));
  }
  if (CONFIG.test(abs) && /alias|"paths"/.test(text)) hits.push(...aliasHits(rel, text));
  if (/tsconfig[^/]*\.json$/.test(abs)) hits.push(...includeHits(abs, rel, text));
  return hits;
}

function scan(): Hit[] {
  const all: Hit[] = [];
  for (const ws of WORKSPACES) for (const abs of walk(join(ROOT, ws))) all.push(...scanFile(abs, true));
  for (const f of ROOT_CONFIGS) all.push(...scanFile(join(ROOT, f), false));
  return all.sort((a, b) => (a.file + a.specifier).localeCompare(b.file + b.specifier) || a.line - b.line);
}

const key = (s: { file: string; specifier: string }) => `${s.file}  ${s.specifier}`;

describe("workspace seams are an allow-list", () => {
  const hits = scan();

  it("reads the workspaces from the root package.json", () => {
    expect(WORKSPACES).toContain("packages/mcp-worker");
    expect(WORKSPACES).toContain("playground");
    expect(hits.length).toBeGreaterThan(10);
  });

  it("every hit is an ALLOW row", () => {
    const allowed = new Set(ALLOW.map(key));
    const unlisted = [...new Map(hits.filter((h) => !allowed.has(key(h))).map((h) => [key(h), h])).values()];
    expect(
      unlisted.map((h) => `${h.file}:${h.line} ${h.specifier}`),
      "a workspace reached the core's (or another workspace's) src/ or dist/ outside the package exports.\n" +
        "Import by package name, or add a row {file, specifier, why} to ALLOW in test/workspace-seams.allow.ts " +
        "and paste `npx tsx test/workspace-seams.allow.ts` into docs/agents/architecture.md:",
    ).toEqual([]);
  });

  it("every ALLOW row still has a hit (no stale rows)", () => {
    const seen = new Set(hits.map(key));
    const stale = ALLOW.filter((s) => !seen.has(key(s))).map(key);
    expect(stale, "ALLOW rows with no matching hit; delete them:").toEqual([]);
  });

  it("ALLOW has no duplicate rows, a reason on each, and no table-breaking pipe", () => {
    expect(new Set(ALLOW.map(key)).size).toBe(ALLOW.length);
    expect(ALLOW.filter((s) => s.why.trim().length < 20).map(key)).toEqual([]);
    expect(ALLOW.filter((s) => `${s.file}${s.specifier}${s.why}`.includes("|")).map(key)).toEqual([]);
  });

  it("architecture.md's seam table is ALLOW, row for row", () => {
    const doc = readFileSync(join(ROOT, "docs/agents/architecture.md"), "utf8");
    const at = doc.indexOf("## Seams between workspaces and the core");
    expect(at, "docs/agents/architecture.md lacks the 'Seams between workspaces and the core' section").toBeGreaterThan(
      -1,
    );
    const section = doc.slice(at).split(/\n## /)[0] ?? "";
    const rows = section.split("\n").filter((l) => l.startsWith("| "));
    expect(rows.join("\n"), "regenerate: npx tsx test/workspace-seams.allow.ts").toBe(seamTable());
  });
});

/**
 * A second `makeNodeWorld` (a `World` over the file system) is a second import-read policy: the
 * core CLI's (`src/cli/io.ts`) is rooted, and a copy that is not roots nothing. The ones known to
 * be unrooted are listed here with the reason, so the gap stays visible; a new copy fails until it
 * is rooted or listed, and a listed one that is gone or renamed fails until its row is deleted.
 */
const CORE_WORLD = "src/cli/io.ts";
const KNOWN_UNROOTED_WORLDS: { file: string; why: string }[] = [
  { file: "packages/archlang-3d/src/node.ts", why: "follow-up: root it like src/cli/io.ts (EH1.16d)" },
];

describe("every makeNodeWorld is rooted or listed", () => {
  const declares = walk(ROOT)
    .map((f) => relative(ROOT, f).split(sep).join("/"))
    .filter((f) => /\.(ts|mts|js|mjs)$/.test(f))
    .filter((f) => /\b(?:function|(?:export\s+)?(?:const|let|var))\s+makeNodeWorld\b/.test(readFileSync(join(ROOT, f), "utf8")))
    .sort();

  it("the core CLI's is the one rooted copy; every other copy is in KNOWN_UNROOTED_WORLDS", () => {
    expect(declares).toContain(CORE_WORLD);
    expect(
      declares.filter((f) => f !== CORE_WORLD),
      "a makeNodeWorld outside src/cli/io.ts: root it like src/cli/io.ts or list it in KNOWN_UNROOTED_WORLDS",
    ).toEqual(KNOWN_UNROOTED_WORLDS.map((w) => w.file).sort());
  });

  it("the 3D package's unrooted copy is listed with its follow-up", () => {
    const row = KNOWN_UNROOTED_WORLDS.find((w) => w.file === "packages/archlang-3d/src/node.ts");
    expect(row?.why).toBe("follow-up: root it like src/cli/io.ts (EH1.16d)");
  });
});
