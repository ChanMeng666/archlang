/**
 * Release-compatibility check: the repo against the LAST PUBLISHED release, additive-only.
 *
 * Four surfaces that downstream code (the MCP shim, the VS Code extension, the web component,
 * ArchCanvas, third-party agents) is keyed on, each compared old → new:
 *
 *   public-types   the declarations `@chanmeng666/archlang` exports (`dist/index.d.ts` of the
 *                  tarball vs `src/index.ts` now, both read with the TypeScript checker)
 *   mcp-schemas    every MCP tool's `inputSchema` (`tools/list` of the published shim vs the
 *                  current `packages/mcp/src`)
 *   plan-schema    the Plan JSON schema (the tarball's `PLAN_JSON_SCHEMA` vs
 *                  `schemas/plan.schema.json`)
 *   error-codes    the `ERROR_CODES` set (a deprecation keeps its key)
 *
 * Removing or narrowing something fails; adding passes. A failure is accepted only when
 * `CHANGELOG.md`'s `## [Unreleased]` section has a line starting `BREAKING:` that names the
 * surface id above or the thing itself (the export, tool, property or code); what was accepted is
 * printed. `public-surface.test.ts` pins nameability and `plan-schema-drift` pins file == generator;
 * neither looks at the previous release, which is what this does.
 *
 *   node scripts/compat-check.mjs                     # against @latest of both packages
 *   node scripts/compat-check.mjs --against 1.56.0 --against-mcp 0.2.39
 *
 * Run by hand it re-executes itself under `tsx` (the current MCP shim and error catalogue are
 * TypeScript) and the current shim resolves its core through node_modules, so `npm run build`
 * first. `test/release-compat.test.ts` runs the same functions in the suite with no build.
 *
 * The tarballs are fetched with `npm pack <pkg>@<version>` and unpacked (gzip + a small tar
 * reader, no `tar` binary) into `node_modules/.cache/archlang-compat/<core>+mcp-<mcp>/node_modules/`,
 * so the published shim imports the core it was released with, and `zod` / the MCP SDK resolve
 * from the repo's node_modules.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CORE_PKG = "@chanmeng666/archlang";
export const MCP_PKG = "@chanmeng666/archlang-mcp";
export const SURFACES = ["public-types", "mcp-schemas", "plan-schema", "error-codes"];

// ---------------------------------------------------------------------------
// registry + tarballs
// ---------------------------------------------------------------------------

function npm(args, cwd = ROOT) {
  // Windows runs npm through its `.cmd` shim, which needs a shell; pass one command string (every
  // argument here is a package spec, a version or a path this script made).
  const win = process.platform === "win32";
  const r = win
    ? spawnSync(`npm ${args.map((a) => `"${a}"`).join(" ")}`, { cwd, encoding: "utf8", shell: true, timeout: 120_000 })
    : spawnSync("npm", args, { cwd, encoding: "utf8", timeout: 120_000 });
  if (r.error) throw new Error(`npm ${args.join(" ")}: ${r.error.message}`);
  if (r.status !== 0)
    throw new Error(`npm ${args.join(" ")} exited ${r.status}: ${(r.stderr || "").trim().slice(0, 400)}`);
  return r.stdout;
}

/** The version `npm view` reports for `pkg@tag` (throws when the registry is unreachable). */
export function publishedVersion(pkg, tag = "latest") {
  const v = npm(["view", `${pkg}@${tag}`, "version"])
    .trim()
    .split(/\s+/)
    .pop();
  if (!v || !/^\d+\.\d+\.\d+/.test(v)) throw new Error(`npm view ${pkg}@${tag} version returned ${JSON.stringify(v)}`);
  return v;
}

/**
 * Unpack a gzipped tarball into `dest`, dropping the leading `package/` component. Handles ustar
 * prefixes, pax `path` records and GNU long names; refuses absolute paths and `..`.
 */
export function extractTgz(buf, dest) {
  const tar = gunzipSync(buf);
  const str = (b, s, n) => {
    const raw = b.subarray(s, s + n);
    const z = raw.indexOf(0);
    return raw.subarray(0, z === -1 ? raw.length : z).toString("utf8");
  };
  let off = 0;
  let longName = null;
  const written = [];
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = Number.parseInt(str(h, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      if (m) longName = m[1];
      continue;
    }
    if (type === "L") {
      longName = str(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    let name = longName ?? (str(h, 345, 155) ? `${str(h, 345, 155)}/${str(h, 0, 100)}` : str(h, 0, 100));
    longName = null;
    if (type !== "0" && type !== "\0" && type !== "7") continue;
    name = name
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .replace(/^package\//, "");
    if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.split("/").includes("..")) {
      throw new Error(`tarball entry escapes its directory: ${name}`);
    }
    const out = join(dest, ...name.split("/"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, body);
    written.push(name);
  }
  return written;
}

/** `npm pack pkg@version` into a temp dir, unpacked to `dest`. */
function fetchPackage(pkg, version, dest) {
  const tmp = mkdtempSync(join(ROOT, "node_modules", ".cache", "archlang-compat", ".pack-"));
  try {
    npm(["pack", `${pkg}@${version}`, "--pack-destination", tmp, "--silent"], tmp);
    const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error(`npm pack ${pkg}@${version} wrote no tarball`);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    extractTgz(readFileSync(join(tmp, tgz)), dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The published pair, unpacked once and cached. `against` / `againstMcp` default to `latest`.
 * Returns the two versions and their package directories.
 */
export function loadRelease({ against = "latest", againstMcp = "latest", cacheRoot } = {}) {
  const coreVersion = /^\d+\.\d+\.\d+/.test(against) ? against : publishedVersion(CORE_PKG, against);
  const mcpVersion = /^\d+\.\d+\.\d+/.test(againstMcp) ? againstMcp : publishedVersion(MCP_PKG, againstMcp);
  const base = cacheRoot ?? join(ROOT, "node_modules", ".cache", "archlang-compat");
  mkdirSync(base, { recursive: true });
  const dir = join(base, `${coreVersion}+mcp-${mcpVersion}`);
  const coreDir = join(dir, "node_modules", "@chanmeng666", "archlang");
  const mcpDir = join(dir, "node_modules", "@chanmeng666", "archlang-mcp");
  const marker = join(dir, ".complete");
  if (!existsSync(marker)) {
    fetchPackage(CORE_PKG, coreVersion, coreDir);
    fetchPackage(MCP_PKG, mcpVersion, mcpDir);
    writeFileSync(marker, `${coreVersion} ${mcpVersion}\n`);
  }
  return { coreVersion, mcpVersion, dir, coreDir, mcpDir };
}

/** The published core's runtime module (zero runtime deps, so it imports standalone). */
export async function importReleaseCore(release) {
  return import(pathToFileURL(join(release.coreDir, "dist", "index.js")).href);
}

/** The published shim's `createServer` (it resolves the published core beside it). */
export async function importReleaseMcp(release) {
  return import(pathToFileURL(join(release.mcpDir, "dist", "server.js")).href);
}

// ---------------------------------------------------------------------------
// overrides
// ---------------------------------------------------------------------------

/** The `BREAKING:` lines of CHANGELOG's `## [Unreleased]` section (a list bullet is allowed). */
export function breakingLines(changelog) {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) {
    const t = lines[i].replace(/^\s*[-*]\s+/, "").trim();
    if (t.startsWith("BREAKING:")) out.push(t);
  }
  return out;
}

const word = (s) => new RegExp(`(^|[^A-Za-z0-9_$])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_$])`);

/** Split findings into failures and those a `BREAKING:` line accepts (surface id or the thing's name). */
export function applyOverrides(findings, lines) {
  const failures = [];
  const accepted = [];
  for (const f of findings) {
    const by = lines.find((l) => word(f.surface).test(l) || word(f.name).test(l));
    if (by) accepted.push({ ...f, by });
    else failures.push(f);
  }
  return { failures, accepted };
}

export function formatFinding(f) {
  const where = f.path ? `${f.name} ${f.path}` : f.name;
  const diff =
    f.old !== undefined || f.new !== undefined
      ? `\n      old: ${f.old ?? "(none)"}\n      new: ${f.new ?? "(none)"}`
      : "";
  return `[${f.surface}] ${f.kind}: ${where}${diff}`;
}

// ---------------------------------------------------------------------------
// (a) public types
// ---------------------------------------------------------------------------

const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  esModuleInterop: true,
  resolveJsonModule: true,
};

/**
 * A printed type in canonical form: bundler renames (`Point$1`) and `import("…").` qualifiers
 * removed, well-known symbol keys named stably, and every union's members sorted at every nesting
 * level (the checker prints a union in type-id order, which differs from program to program).
 */
export function normType(s) {
  return canonUnions(
    s
      .replace(/import\("[^"]*"\)\./g, "")
      .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\$\d+\b/g, "$1")
      .replace(/__@([A-Za-z]+)@\d+/g, "[Symbol.$1]"),
  );
}

const OPEN = { "(": ")", "[": "]", "{": "}", "<": ">" };

function canonUnions(s) {
  let i = 0;
  // `|` binds looser than nothing else we meet, so a union runs between two of these separators
  // (or brackets) at one nesting level: sort each such run, keep the separators in place.
  const level = (closer) => {
    const pieces = [];
    let segs = [];
    let cur = "";
    const endRun = (sep) => {
      segs.push(cur.trim());
      const run = segs.filter(Boolean);
      pieces.push((run.length > 1 ? run.sort().join(" | ") : (run[0] ?? "")) + sep);
      segs = [];
      cur = "";
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1;
        cur += s.slice(i, j + 1);
        i = j + 1;
      } else if (c in OPEN) {
        i++;
        const inner = level(OPEN[c]);
        cur += c + inner + OPEN[c];
      } else if (c === closer && !(c === ">" && s[i - 1] === "=")) {
        i++;
        break;
      } else if (c === "|") {
        segs.push(cur.trim());
        cur = "";
        i++;
      } else if (c === "=" && s[i + 1] === ">") {
        endRun(" => ");
        i += 2;
      } else if (c === ";" || c === "," || c === ":") {
        endRun(c === ":" ? ": " : `${c} `);
        i++;
      } else {
        cur += c;
        i++;
      }
    }
    endRun("");
    return pieces.join("").trim();
  };
  return level(null);
}

/** Split a printed type on a top-level separator character (outside brackets and quotes). */
function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\") cur += s[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c) && !(c === ">" && s[i - 1] === "=")) depth--;
    if (c === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** The top-level members of a printed union (one member for a non-union). */
export function unionMembers(s) {
  return splitTop(s, "|");
}

/**
 * The flattened, normalised declaration list of a module: `{ exportName: { key: printed } }`.
 * Keys: `kind`; `.a.b` for (nested, anonymous) object members, `?` prefix on optional ones;
 * `[]` for a tuple (the sorted set of its element types); `sigN.required` / `sigN.pJ` /
 * `sigN.returns` for call signatures; `newN.*` for construct signatures; `type` for any other
 * alias or value (unions sorted).
 */
export function typeSurface(entryFile) {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entryFile);
  if (!sf) throw new Error(`cannot read ${entryFile}`);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`${entryFile} is not a module`);
  const print = (t) => normType(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation));
  const printAlias = (t) =>
    normType(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));

  const isAnonObject = (t) =>
    !!(t.flags & ts.TypeFlags.Object) &&
    !!(t.objectFlags & (ts.ObjectFlags.Anonymous | ts.ObjectFlags.Mapped)) &&
    !t.aliasSymbol &&
    t.getCallSignatures().length === 0 &&
    t.getConstructSignatures().length === 0 &&
    t.getProperties().length > 0;

  function sigs(out, prefix, list) {
    list.forEach((s, i) => {
      let required = 0;
      s.getParameters().forEach((p, j) => {
        const decl = p.valueDeclaration;
        const optional = decl && ts.isParameter(decl) && (!!decl.questionToken || !!decl.initializer);
        const rest = decl && ts.isParameter(decl) && !!decl.dotDotDotToken;
        if (!optional && !rest) required++;
        let printed = print(checker.getTypeOfSymbol(p));
        // `x?: T` reads `T | undefined` from a declaration file and `T` from `x: T = d` in source.
        if (optional)
          printed = unionMembers(printed)
            .filter((m) => m !== "undefined")
            .join(" | ");
        out[`${prefix}${i}.p${j}`] = `${rest ? "..." : optional ? "?" : ""}${printed}`;
      });
      out[`${prefix}${i}.required`] = String(required);
      out[`${prefix}${i}.returns`] = print(s.getReturnType());
    });
  }

  function members(out, prefix, type, depth, seen) {
    if (depth > 16 || seen.has(type)) {
      out[prefix || "type"] = print(type);
      return;
    }
    const next = new Set(seen).add(type);
    if (checker.isTupleType(type)) {
      // An `as const` list (keyword tables, enum values) is read as the set of its element types,
      // so an entry inserted mid-list passes and a removed one fails.
      const els = [...new Set(checker.getTypeArguments(type).map(print))].sort();
      out[`${prefix}[]`] = els.join(" | ") || "never";
      return;
    }
    for (const p of type.getProperties()) {
      const optional = !!(p.flags & ts.SymbolFlags.Optional);
      const key = `${prefix}.${optional ? "?" : ""}${p.getName().replace(/^__@([A-Za-z]+)@\d+$/, "[Symbol.$1]")}`;
      leaf(out, key, checker.getTypeOfSymbol(p), depth + 1, next);
    }
  }

  function leaf(out, key, t, depth, seen) {
    if (isAnonObject(t) || (checker.isTupleType(t) && !t.aliasSymbol)) members(out, key, t, depth, seen);
    else out[key] = print(t);
  }

  const surface = {};
  for (const exp of checker.getExportsOfModule(mod)) {
    const sym = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    const f = sym.flags;
    const kinds = [];
    const out = {};
    if (f & ts.SymbolFlags.Function) kinds.push("function");
    if (f & ts.SymbolFlags.Class) kinds.push("class");
    if (f & ts.SymbolFlags.Interface) kinds.push("interface");
    if (f & ts.SymbolFlags.TypeAlias) kinds.push("type");
    if (f & ts.SymbolFlags.Enum) kinds.push("enum");
    if (f & ts.SymbolFlags.Variable) kinds.push("const");
    if (f & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) kinds.push("namespace");
    out.kind = kinds.join(",");
    if (f & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class)) {
      const vt = checker.getTypeOfSymbol(sym);
      const calls = vt.getCallSignatures();
      const ctors = vt.getConstructSignatures();
      if (calls.length) sigs(out, "sig", calls);
      if (ctors.length) sigs(out, "new", ctors);
      if (!calls.length && !ctors.length) {
        if (isAnonObject(vt) || checker.isTupleType(vt)) members(out, "", vt, 0, new Set());
        else out.type = print(vt);
      }
    }
    if (f & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) {
      members(out, "", checker.getDeclaredTypeOfSymbol(sym), 0, new Set());
    } else if (f & ts.SymbolFlags.TypeAlias) {
      const t = checker.getDeclaredTypeOfSymbol(sym);
      if (t.isUnion()) out.type = t.types.map(print).sort().join(" | ");
      else if (t.getProperties().length && !(t.flags & ts.TypeFlags.Primitive) && t.getCallSignatures().length === 0) {
        members(out, "", t, 0, new Set());
      } else out.type = printAlias(t);
    } else if (f & ts.SymbolFlags.Enum) {
      for (const m of checker.getExportsOfModule(sym)) {
        out[`.${m.getName()}`] = print(checker.getTypeOfSymbol(m));
      }
    }
    surface[exp.getName()] = out;
  }
  return surface;
}

/** A leaf that only widened: equal, or every old union member is a member of the new one. */
function widened(oldS, newS) {
  if (oldS === newS) return true;
  const nm = unionMembers(newS);
  const n = new Set(nm);
  return unionMembers(oldS).every((m) => n.has(m) || nm.some((x) => arrayWidened(m, x) || objectWidened(m, x)));
}

/** `{a: X; b: Y;}` → `{a: X; b: Y; c?: Z;}`: every old field kept (widened), every new one optional. */
function objectWidened(o, n) {
  const fields = (s) => {
    if (!s.startsWith("{") || !s.endsWith("}")) return null;
    const m = new Map();
    for (const f of splitTop(s.slice(1, -1), ";")) {
      const at = splitTop(f, ":");
      if (at.length < 2) return null;
      m.set(at[0], at.slice(1).join(": "));
    }
    return m;
  };
  const a = fields(o);
  const b = fields(n);
  if (!a || !b) return false;
  for (const [k, t] of a) if (!b.has(k) || !widened(t, b.get(k))) return false;
  for (const k of b.keys()) if (!a.has(k) && !k.endsWith("?")) return false;
  return true;
}

/** `readonly (A | B)[]` → `readonly (A | B | C)[]` (or `A[]` → `(A | B)[]`): the element type widened. */
function arrayWidened(o, n) {
  const el = (s) => /^(readonly )?(?:\((.+)\)|([^\s|()]+))\[\]$/.exec(s);
  const a = el(o);
  const b = el(n);
  return !!a && !!b && (a[1] ?? "") === (b[1] ?? "") && widened(a[2] ?? a[3], b[2] ?? b[3]);
}

/** A single string/number literal type (`"…"`, `1`), the value of a `const` member. */
const isLiteral = (s) => /^("([^"\\]|\\.)*"|-?\d+(\.\d+)?|true|false)$/.test(s);

/** Additive-only diff of two {@link typeSurface} results. */
export function compareTypeSurfaces(oldS, newS) {
  const findings = [];
  const surface = "public-types";
  for (const name of Object.keys(oldS).sort()) {
    const o = oldS[name];
    const n = newS[name];
    if (!n) {
      findings.push({ surface, kind: "removed export", name, old: o.kind });
      continue;
    }
    // An optional member keeps its key under `?name`; became-optional is a widening.
    const nKeys = new Map(Object.keys(n).map((k) => [k.replace(/\.\?/g, "."), k]));
    for (const k of Object.keys(o)) {
      const nk = k in n ? k : nKeys.get(k.replace(/\.\?/g, "."));
      if (nk === undefined) {
        findings.push({ surface, kind: k === "kind" ? "removed kind" : "removed member", name, path: k, old: o[k] });
        continue;
      }
      const optionals = (s) => (s.match(/\.\?/g) ?? []).length;
      if (optionals(nk) < optionals(k)) {
        findings.push({ surface, kind: "member became required", name, path: nk, old: o[k], new: n[nk] });
        continue;
      }
      if (k === "kind") {
        // `interface X` ↔ `type X = {…}` is one kind to a consumer (its members are compared).
        const kinds = (s) => s.split(",").map((x) => (x === "interface" ? "type" : x));
        const nk2 = new Set(kinds(n.kind));
        const lost = kinds(o.kind).filter((x) => x && !nk2.has(x));
        if (lost.length) findings.push({ surface, kind: "removed kind", name, old: o.kind, new: n.kind });
      } else if (/\.required$/.test(k)) {
        if (Number(n[nk]) > Number(o[k])) {
          findings.push({ surface, kind: "new required parameter", name, path: k, old: o[k], new: n[nk] });
        }
      } else if (o.kind === "const" && n.kind === "const" && isLiteral(o[k]) && isLiteral(n[nk])) {
        // A constant's VALUE changed (a schema description, a version string): not a type
        // contract. The Plan schema's own `const`s are checked as JSON by `plan-schema`.
      } else if (!widened(o[k].replace(/^(\?|\.\.\.)/, ""), n[nk].replace(/^(\?|\.\.\.)/, ""))) {
        // (A parameter's `?` / `...` marker is compared by the loop below.)
        findings.push({ surface, kind: "changed type", name, path: k, old: o[k], new: n[nk] });
      }
    }
    // A parameter that was optional and is now required at the same position.
    for (const k of Object.keys(o)) {
      const m = /^(sig|new)(\d+)\.p(\d+)$/.exec(k);
      if (m && o[k].startsWith("?") && n[k] && !n[k].startsWith("?") && !n[k].startsWith("...")) {
        findings.push({ surface, kind: "parameter became required", name, path: k, old: o[k], new: n[k] });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// (b) + (c) JSON schemas
// ---------------------------------------------------------------------------

const asSet = (v) => new Set(Array.isArray(v) ? v : v === undefined ? [] : [v]);
const show = (v) => JSON.stringify(v);

/** Additive-only diff of two JSON schemas; `name` labels the findings. */
export function compareJsonSchemas(oldS, newS, { surface, name, path = "" }) {
  const out = [];
  const walk = (o, n, p) => {
    if (!o || typeof o !== "object") return;
    if (!n || typeof n !== "object") {
      out.push({ surface, kind: "removed schema", name, path: p || "/", old: show(o) });
      return;
    }
    if (o.type !== undefined) {
      const nt = asSet(n.type);
      if (
        n.type === undefined ||
        ![...asSet(o.type)].every((t) => nt.has(t) || (t === "integer" && nt.has("number")))
      ) {
        out.push({ surface, kind: "changed type", name, path: p || "/", old: show(o.type), new: show(n.type) });
      }
    }
    if (Array.isArray(o.enum)) {
      const ne = new Set((n.enum ?? []).map(show));
      const lost = n.enum === undefined ? [] : o.enum.filter((v) => !ne.has(show(v)));
      if (lost.length)
        out.push({ surface, kind: "narrowed enum", name, path: p || "/", old: show(o.enum), new: show(n.enum) });
    } else if (Array.isArray(n.enum) && o.const === undefined) {
      out.push({ surface, kind: "narrowed enum", name, path: p || "/", old: "(any)", new: show(n.enum) });
    }
    if (o.const !== undefined && show(o.const) !== show(n.const)) {
      out.push({ surface, kind: "changed const", name, path: p || "/", old: show(o.const), new: show(n.const) });
    }
    if (o.const === undefined && n.const !== undefined && o.enum === undefined) {
      out.push({ surface, kind: "narrowed to const", name, path: p || "/", old: "(any)", new: show(n.const) });
    }
    if (o.$ref !== undefined && o.$ref !== n.$ref) {
      out.push({ surface, kind: "changed $ref", name, path: p || "/", old: o.$ref, new: n.$ref });
    }
    const oReq = asSet(o.required);
    for (const r of asSet(n.required)) {
      if (!oReq.has(r)) out.push({ surface, kind: "new required property", name, path: `${p}/${r}` });
    }
    for (const key of ["properties", "$defs", "definitions", "patternProperties"]) {
      if (!o[key]) continue;
      for (const [k, v] of Object.entries(o[key])) {
        if (!n[key] || !(k in n[key])) {
          out.push({
            surface,
            kind: key === "properties" ? "removed property" : "removed definition",
            name,
            path: `${p}/${k}`,
          });
        } else walk(v, n[key][k], `${p}/${k}`);
      }
    }
    for (const key of ["items", "additionalProperties", "not", "contains"]) {
      if (o[key] && typeof o[key] === "object") walk(o[key], n[key], `${p}/${key}`);
    }
    if (o.additionalProperties !== false && n.additionalProperties === false && o.additionalProperties !== undefined) {
      out.push({ surface, kind: "closed additionalProperties", name, path: p || "/" });
    }
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      if (!Array.isArray(o[key])) continue;
      if (!Array.isArray(n[key]) || n[key].length < o[key].length) {
        out.push({
          surface,
          kind: `fewer ${key} branches`,
          name,
          path: p || "/",
          old: String(o[key].length),
          new: String(n[key]?.length ?? 0),
        });
      } else
        o[key].forEach((b, i) => {
          walk(b, n[key][i], `${p}/${key}[${i}]`);
        });
    }
  };
  walk(oldS, newS, path);
  return out;
}

/** `tools/list` of a server built by `createServer`, in process (no transport but the SDK's in-memory pair). */
export async function listMcpTools(createServer) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverT);
  const client = new Client({ name: "archlang-compat-check", version: "0.0.0" });
  await client.connect(clientT);
  try {
    const { tools } = await client.listTools();
    return Object.fromEntries(tools.map((t) => [t.name, t.inputSchema ?? {}]));
  } finally {
    await client.close();
    await server.close();
  }
}

/** Additive-only diff of two `{ toolName: inputSchema }` maps. */
export function compareMcpTools(oldT, newT) {
  const out = [];
  for (const name of Object.keys(oldT).sort()) {
    if (!(name in newT)) out.push({ surface: "mcp-schemas", kind: "removed tool", name });
    else out.push(...compareJsonSchemas(oldT[name], newT[name], { surface: "mcp-schemas", name }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// (d) error codes
// ---------------------------------------------------------------------------

export function compareErrorCodes(oldCodes, newCodes) {
  const n = new Set(newCodes);
  return [...oldCodes].filter((c) => !n.has(c)).map((c) => ({ surface: "error-codes", kind: "removed code", name: c }));
}

// ---------------------------------------------------------------------------
// one call per surface (the test calls these; the CLI calls all four)
// ---------------------------------------------------------------------------

export function checkPublicTypes(release, currentEntry = join(ROOT, "src", "index.ts")) {
  const oldEntry = join(release.coreDir, "dist", "index.d.ts");
  const oldS = typeSurface(oldEntry);
  const newS = typeSurface(currentEntry);
  return {
    findings: compareTypeSurfaces(oldS, newS),
    note: `${Object.keys(oldS).length} exports in ${CORE_PKG}@${release.coreVersion}, ${Object.keys(newS).length} now`,
  };
}

export async function checkMcpSchemas(release, currentCreateServer) {
  const old = await listMcpTools((await importReleaseMcp(release)).createServer);
  const now = await listMcpTools(currentCreateServer);
  return {
    findings: compareMcpTools(old, now),
    note: `${Object.keys(old).length} tools in ${MCP_PKG}@${release.mcpVersion}, ${Object.keys(now).length} now`,
  };
}

/** The released Plan schema: the core's `PLAN_JSON_SCHEMA`, else the shim's baked copy. */
export async function releasePlanSchema(release) {
  const core = await importReleaseCore(release);
  if (core.PLAN_JSON_SCHEMA)
    return { schema: core.PLAN_JSON_SCHEMA, from: `${CORE_PKG}@${release.coreVersion} PLAN_JSON_SCHEMA` };
  const baked = join(release.mcpDir, "dist", "plan.schema.json");
  if (existsSync(baked))
    return {
      schema: JSON.parse(readFileSync(baked, "utf8")),
      from: `${MCP_PKG}@${release.mcpVersion} dist/plan.schema.json`,
    };
  return null;
}

export async function checkPlanSchema(release, currentFile = join(ROOT, "schemas", "plan.schema.json")) {
  const old = await releasePlanSchema(release);
  if (!old) return { findings: [], skipped: "neither published package carries the Plan JSON schema" };
  const now = JSON.parse(readFileSync(currentFile, "utf8"));
  return {
    findings: compareJsonSchemas(old.schema, now, { surface: "plan-schema", name: "plan.schema.json" }),
    note: `against ${old.from}`,
  };
}

export async function checkErrorCodes(release, currentCodes) {
  const core = await importReleaseCore(release);
  if (!Array.isArray(core.ERROR_CODES))
    return { findings: [], skipped: `${CORE_PKG}@${release.coreVersion} exports no ERROR_CODES` };
  return {
    findings: compareErrorCodes(core.ERROR_CODES, currentCodes),
    note: `${core.ERROR_CODES.length} codes in ${release.coreVersion}, ${currentCodes.length} now`,
  };
}

/** The `BREAKING:` lines of this checkout's CHANGELOG. */
export function repoBreakingLines() {
  return breakingLines(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  // The current shim and catalogue are TypeScript: re-run under tsx once.
  if (!process.env.ARCHLANG_COMPAT_TSX) {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, ARCHLANG_COMPAT_TSX: "1" },
      },
    );
    process.exit(r.status ?? 1);
  }
  const t0 = Date.now();
  let release;
  try {
    release = loadRelease({ against: arg("--against"), againstMcp: arg("--against-mcp") });
  } catch (e) {
    console.error(`compat-check: cannot fetch the published release (${e.message})`);
    process.exit(2);
  }
  console.log(`compat-check: ${CORE_PKG}@${release.coreVersion} + ${MCP_PKG}@${release.mcpVersion} -> this checkout`);
  const { ERROR_CODES } = await import(pathToFileURL(join(ROOT, "src", "error-catalog.ts")).href);
  const { createServer } = await import(pathToFileURL(join(ROOT, "packages", "mcp", "src", "server.ts")).href);
  const lines = repoBreakingLines();
  const results = {
    "public-types": checkPublicTypes(release),
    "mcp-schemas": await checkMcpSchemas(release, createServer),
    "plan-schema": await checkPlanSchema(release),
    "error-codes": await checkErrorCodes(release, ERROR_CODES),
  };
  let failed = 0;
  for (const s of SURFACES) {
    const r = results[s];
    if (r.skipped) {
      console.log(`  ${s}: SKIPPED (${r.skipped})`);
      continue;
    }
    const { failures, accepted } = applyOverrides(r.findings, lines);
    console.log(
      `  ${s}: ${failures.length ? "FAIL" : "pass"} (${r.note}; ${failures.length} failure(s), ${accepted.length} accepted)`,
    );
    for (const a of accepted) console.log(`    accepted by "${a.by}": ${formatFinding(a)}`);
    for (const f of failures) console.log(`    ${formatFinding(f)}`);
    failed += failures.length;
  }
  console.log(
    `compat-check: ${failed ? `${failed} breaking change(s)` : "additive-only"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
