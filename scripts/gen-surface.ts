/**
 * Generate `docs/agents/public-surface.md`: one row per named export of `src/index.ts` (the
 * package's one public entry), with its kind, the module that declares it (the re-export chain
 * resolved by the TypeScript checker) and the in-repo files that import it through the package.
 *
 * The export list comes from the checker, never a retyped list. Consumers are found by a regex
 * over import statements: `import { a, b as c, type D } from "<spec>"`, `export { a } from "<spec>"`
 * and `import * as ns from "<spec>"` (then `ns.name`), where `<spec>` is the package name
 * (`@chanmeng666/archlang`), the `archlang` alias, or a relative path resolving to
 * `src/index`. Dynamic `import()`, `require`, docs/markdown and a re-export of a namespace are not
 * seen, so a flagged export may still have a consumer the regex cannot read.
 *
 * Deterministic: sorted, no time, no absolute paths.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/agents/public-surface.md");
const ENTRY = resolve(ROOT, "src/index.ts");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".claude",
  "coverage",
  "out",
  "test-results",
  "playwright-report",
  "cache",
  "public",
  ".wrangler",
]);
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".mts", ".vue"]);

const rel = (p: string): string => relative(ROOT, p).split("\\").join("/");

interface Row {
  readonly name: string;
  readonly kind: "value" | "type";
  readonly module: string;
}

function collectExports(): Row[] {
  const cfgPath = resolve(ROOT, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(ENTRY);
  if (!sf) throw new Error("src/index.ts not found");
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error("src/index.ts has no module symbol");
  const rows: Row[] = [];
  for (const exp of checker.getExportsOfModule(mod)) {
    const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    const files = (target.declarations ?? []).map((d) => rel(d.getSourceFile().fileName)).sort();
    rows.push({
      name: exp.name,
      kind: target.flags & ts.SymbolFlags.Value ? "value" : "type",
      module: files[0] ?? "(unresolved)",
    });
  }
  return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.has(name.slice(name.lastIndexOf(".")))) yield full;
  }
}

/** The consumer bucket of a repo file. */
function bucket(file: string): string {
  const r = rel(file);
  if (r.startsWith("src/cli/") || r === "src/cli.ts") return "src/cli";
  if (r.startsWith("src/")) return "src";
  const parts = r.split("/");
  if (parts[0] === "packages") return `packages/${parts[1]}`;
  return parts[0]!;
}

function isPackageSpec(spec: string, file: string): boolean {
  if (spec === "@chanmeng666/archlang" || spec === "archlang") return true;
  if (!spec.startsWith(".")) return false;
  const target = resolve(dirname(file), spec).replace(/\.(js|ts)$/, "");
  return target === resolve(ROOT, "src/index") || target === resolve(ROOT, "src");
}

const IMPORT_RE = /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const NS_RE = /\bimport\s+(?:type\s+)?\*\s+as\s+(\w+)\s+from\s*["']([^"']+)["']/g;

function collectConsumers(names: ReadonlySet<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (name: string, b: string): void => {
    if (!names.has(name)) return;
    let s = out.get(name);
    if (!s) {
      s = new Set();
      out.set(name, s);
    }
    s.add(b);
  };
  for (const file of walk(ROOT)) {
    if (file === ENTRY) continue;
    const text = readFileSync(file, "utf8");
    const b = bucket(file);
    for (const m of text.matchAll(IMPORT_RE)) {
      if (!isPackageSpec(m[2]!, file)) continue;
      for (const part of m[1]!.split(",")) {
        const spec = part
          .replace(/\/\/.*$/gm, "")
          .trim()
          .replace(/^type\s+/, "");
        const orig = spec.split(/\s+as\s+/)[0]!.trim();
        if (orig) add(orig, b);
      }
    }
    for (const m of text.matchAll(NS_RE)) {
      if (!isPackageSpec(m[2]!, file)) continue;
      for (const u of text.matchAll(new RegExp(`\\b${m[1]}\\.(\\w+)`, "g"))) add(u[1]!, b);
    }
  }
  return out;
}

function render(): string {
  const rows = collectExports();
  const consumers = collectConsumers(new Set(rows.map((r) => r.name)));
  const flagged = rows.filter((r) => !consumers.has(r.name));
  const values = rows.filter((r) => r.kind === "value").length;
  const byModule = new Map<string, Row[]>();
  for (const r of rows) (byModule.get(r.module) ?? byModule.set(r.module, []).get(r.module)!).push(r);

  const lines: string[] = [
    "<!-- GENERATED by scripts/gen-surface.ts (npm run gen:surface). Do not edit by hand. -->",
    "",
    "# Public surface map",
    "",
    "Every named export of `src/index.ts` (the package's one public entry), grouped by the module that",
    "declares it, with the in-repo files that import it through the package name, the `archlang` alias",
    "or a relative path to `src/index`. Consumer buckets: `src/cli`, `src`, `packages/*`, `playground`,",
    "`editors`, `docs-site`, `scripts`, `eval`, `dataset`, `test`, and so on.",
    "",
    "A flagged export (consumers `none`) is NOT dead: the public surface is a contract and the",
    "release-compat gate pins it. It only has no in-repo exerciser, so a change to it is proven by",
    "nothing here but that gate. The consumer scan is a regex over import statements (named, re-export",
    "and `import * as ns` forms); dynamic `import()`, `require` and markdown are not read.",
    "",
    `Totals: ${rows.length} exports (${values} values, ${rows.length - values} types), ${flagged.length} flagged (${flagged.filter((r) => r.kind === "value").length} values).`,
    "",
  ];
  for (const mod of [...byModule.keys()].sort()) {
    lines.push(`## \`${mod}\``, "", "| Export | Kind | In-repo consumers |", "| --- | --- | --- |");
    for (const r of byModule.get(mod)!) {
      const c = consumers.get(r.name);
      const cell = c
        ? [...c]
            .sort()
            .map((x) => `\`${x}\``)
            .join(", ")
        : "none";
      lines.push(`| \`${r.name}\` | ${r.kind} | ${cell} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

const text = render();
writeFileSync(OUT, text);
const m = /Totals: (.*)/.exec(text);
process.stdout.write(`wrote docs/agents/public-surface.md: ${m?.[1] ?? ""}\n`);
