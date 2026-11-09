/**
 * Boundary: a workspace reaches the core (or another workspace) only through a declared package
 * name, except at the seams listed in ALLOW below. The root `exports` map has only `.` and `./link`,
 * yet workspaces reach past it by relative path and by build alias. This scans every workspace for
 *   (a) a relative import/export/`import(` specifier that lands in the core's `src/` or `dist/`,
 *   (b) one that lands in ANOTHER workspace's `src/` or `dist/`,
 *   (c) an alias entry (`alias: {}` in a Vite/vitest/esbuild/wrangler config, `paths` in a
 *       tsconfig) mapping a package name to a `src/` or `dist/` path.
 * Every hit must be an ALLOW row `{ file, specifier, why }`; a hit with no row fails, and a row with
 * no hit fails too (stale). Test code (`test/`, `e2e/`, `*.test.*`, `*.spec.*`, `*.e2e.*`) is not
 * scanned: it is not shipped, and reading a source under test is its job. `docs/agents/architecture.md`
 * § "Seams between workspaces and the core" tabulates this list; the last test pins that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface Seam {
  /** Repo-relative, forward slashes. */
  file: string;
  /** The import specifier, or `alias <name>` / `paths <name>` for a config entry. */
  specifier: string;
  why: string;
}

const CORE_SHARE = "the shared-link codec is a core CLI file with no package export";

const ALLOW: readonly Seam[] = [
  // playground
  {
    file: "playground/src/glb-export.ts",
    specifier: "../../packages/archlang-3d/src/glb/write.js",
    why: "writeGlb is exported only from archlang-3d's Node entry, but the writer is browser-agnostic; read from source",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths archlang",
    why: "mirrors the Vite alias: a root node_modules/archlang symlink points at the vscode extension",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths archlang/review",
    why: "types for the review sheet come from src/: the build emits no declaration for dist/cli/review.js",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths @chanmeng666/archlang-3d",
    why: "mirrors the Vite alias: archlang-3d is read from source, its published exports name a dist/ that may not be built",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths @chanmeng666/archlang-3d/browser",
    why: "mirrors the Vite alias for the browser entry",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias archlang",
    why: "the playground consumes the built core (dist/index.js), keeping one import path",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias archlang/review",
    why: "Checks overlay reads the review sheet, a CLI file with no export; listed before the bare name (prefix match)",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang",
    why: "archlang-3d imports the core by its published name; same built file so the lazy chunk shares the core",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang-3d",
    why: "archlang-3d is read from source: its published exports name a dist/ the build has no reason to need",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang-3d/browser",
    why: "the browser entry of archlang-3d, from source; longer key first",
  },
  {
    file: "playground/wrangler.jsonc",
    specifier: "alias archlang",
    why: "the short-link Worker bundles the built core by name",
  },
  // docs-site
  {
    file: "docs-site/.vitepress/config.ts",
    specifier: "alias archlang",
    why: "examples compile client-side against the built core, the same alias the playground uses",
  },
  {
    file: "docs-site/tsconfig.json",
    specifier: "paths archlang",
    why: "mirrors the VitePress alias to the built core",
  },
  // packages
  {
    file: "packages/archlang-3d/vitest.e2e.config.ts",
    specifier: "alias @chanmeng666/archlang",
    why: "heavy e2e tests run against the core's source, as the root vitest config does",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "alias @chanmeng666/archlang",
    why: "the Worker bundles THIS checkout's built core, so a stale installed core cannot ship",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "alias @chanmeng666/archlang/link",
    why: "the same, for the link helper (the root exports map's ./link, built to dist/cli/link.js)",
  },
  {
    file: "packages/mcp-worker/scripts/measure-cpu.mjs",
    specifier: "../../../src/cli/share-codec.mjs",
    why: `CPU measurement script encodes a plan hash; ${CORE_SHARE}`,
  },
  {
    file: "packages/mcp-worker/src/app.ts",
    specifier: "../../../src/cli/share-codec.web.mjs",
    why: `the Worker decodes #z= payloads with the Web-stream codec; ${CORE_SHARE}`,
  },
  {
    file: "packages/mcp-worker/src/env.d.ts",
    specifier: "../../mcp/src/tools.js",
    why: "types the virtual:archlang-resources module by the stdio server's ResourceName",
  },
  {
    file: "packages/mcp-worker/src/server.ts",
    specifier: "../../mcp/src/tools.js",
    why: "the hosted server serves the stdio server's tool set, so it registers the same tools from source (mcp is not published as a library)",
  },
  {
    file: "packages/mcp-worker/tsconfig.json",
    specifier: "paths @chanmeng666/archlang",
    why: "types come from the same built core that scripts/build.mjs bundles",
  },
  {
    file: "packages/mcp-worker/tsconfig.json",
    specifier: "paths @chanmeng666/archlang/link",
    why: "types for the link helper, from the built core",
  },
  {
    file: "packages/web-component/tsconfig.json",
    specifier: "paths @chanmeng666/archlang",
    why: "the core is a peer dependency; in the monorepo it is the root's source, typechecking without a build",
  },
];

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACES = [
  "playground",
  "docs-site",
  "editors/vscode",
  ...readdirSync(join(ROOT, "packages"))
    .sort()
    .map((p) => `packages/${p}`),
];
const SKIP_DIRS = new Set([
  "node_modules",
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
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])(\.{1,2}\/[^"'\n]*)\1/g;

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

interface Hit {
  file: string;
  line: number;
  specifier: string;
}

function importHits(abs: string, rel: string, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(SPECIFIER)) {
    const target = seamTarget(norm(relative(ROOT, resolve(dirname(abs), m[2] ?? ""))));
    if (!target || target.owner === wsOf(rel)) continue;
    hits.push({ file: rel, line: text.slice(0, m.index).split("\n").length, specifier: m[2] ?? "" });
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

function aliasHits(rel: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const opener = /(?:\balias|"paths")["']?\s*:\s*\{/g;
  for (const o of text.matchAll(opener)) {
    const kind = o[0].includes("paths") ? "paths" : "alias";
    const open = (o.index ?? 0) + o[0].length - 1;
    const base = text.slice(0, open).split("\n").length;
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

function scan(): Hit[] {
  const all: Hit[] = [];
  for (const ws of WORKSPACES) {
    for (const abs of walk(join(ROOT, ws))) {
      const rel = norm(relative(ROOT, abs));
      const raw = readFileSync(abs, "utf8");
      const text = stripComments(raw);
      if (CODE.test(abs)) all.push(...importHits(abs, rel, text));
      if (CONFIG.test(abs) && /alias|"paths"/.test(text)) all.push(...aliasHits(rel, text));
    }
  }
  return all.sort((a, b) => (a.file + a.specifier).localeCompare(b.file + b.specifier) || a.line - b.line);
}

const key = (s: { file: string; specifier: string }) => `${s.file}  ${s.specifier}`;

describe("workspace seams are an allow-list", () => {
  const hits = scan();

  it("scans the workspaces", () => {
    expect(WORKSPACES).toContain("packages/mcp-worker");
    expect(hits.length).toBeGreaterThan(10);
  });

  it("every hit is an ALLOW row", () => {
    const allowed = new Set(ALLOW.map(key));
    const unlisted = [...new Map(hits.filter((h) => !allowed.has(key(h))).map((h) => [key(h), h])).values()];
    expect(
      unlisted.map((h) => `${h.file}:${h.line} ${h.specifier}`),
      "a workspace reached the core's (or another workspace's) src/ or dist/ outside the package exports.\n" +
        "Import by package name, or add a row {file, specifier, why} to ALLOW in test/workspace-seams.test.ts and docs/agents/architecture.md:",
    ).toEqual([]);
  });

  it("every ALLOW row still has a hit (no stale rows)", () => {
    const seen = new Set(hits.map(key));
    const stale = ALLOW.filter((s) => !seen.has(key(s))).map(key);
    expect(stale, "ALLOW rows with no matching hit; delete them:").toEqual([]);
  });

  it("ALLOW has no duplicate rows and a reason on each", () => {
    expect(new Set(ALLOW.map(key)).size).toBe(ALLOW.length);
    expect(ALLOW.filter((s) => s.why.trim().length < 20).map(key)).toEqual([]);
  });

  it("architecture.md tabulates every ALLOW row", () => {
    const doc = readFileSync(join(ROOT, "docs/agents/architecture.md"), "utf8");
    const at = doc.indexOf("## Seams between workspaces and the core");
    expect(at, "docs/agents/architecture.md lacks the 'Seams between workspaces and the core' section").toBeGreaterThan(
      -1,
    );
    const section = doc.slice(at).split(/\n## /)[0] ?? "";
    const missing = ALLOW.filter(
      (s) => !section.includes(`\`${s.file}\``) || !section.includes(`\`${s.specifier}\``),
    ).map(key);
    expect(missing, "ALLOW rows missing from the architecture.md seam table:").toEqual([]);
  });
});
