/**
 * Release-compatibility check: the repo against the LAST PUBLISHED release, additive-only.
 *
 * Four surfaces that downstream code (the MCP shim, the VS Code extension, the web component,
 * ArchCanvas, third-party agents) is keyed on, each compared old → new:
 *
 *   public-types   the declarations `@chanmeng666/archlang` exports (`dist/index.d.ts` of the
 *                  tarball vs `src/index.ts` now, both read with the TypeScript checker)
 *   mcp-schemas    every MCP tool's `inputSchema` and `outputSchema` (`tools/list` of the
 *                  published shim vs the current `packages/mcp/src`)
 *   plan-schema    the Plan JSON schema (the tarball's `PLAN_JSON_SCHEMA` vs
 *                  `schemas/plan.schema.json`)
 *   error-codes    the `ERROR_CODES` set (a deprecation keeps its key)
 *
 * Types are compared by variance: what a caller BUILDS (a parameter, an input type's member) may
 * only widen, what it READS (a return, an output type's member) may only narrow; each finding
 * prints the classification it used. Enum-like sets are append-only in both roles: a union of
 * literals, an `as const` list, and a tagged union (object variants told apart by a literal
 * discriminant such as `kind`), whose variant may be added (a new element kind is a minor) but not
 * removed, while a variant on both sides keeps the strict variance of its role. A constant keyed by
 * a set (`Readonly<Record<K, V>>`) is read one member per key, like an `as const` object: a key may
 * be added, not removed. Schemas and code sets are additive-only. A failure is
 * accepted only by a line under `CHANGELOG.md`'s `## [Unreleased]` of the form
 * `BREAKING: <surface>: item, item` (the items it names) or `BREAKING: <surface> (all)`; what was
 * accepted is printed. `public-surface.test.ts` pins nameability and `plan-schema-drift` pins
 * file == generator; neither looks at the previous release, which is what this does.
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

/**
 * One `BREAKING:` line as a waiver: `BREAKING: <surface>: a, b` waives the items it names (an
 * export, tool, code, or a schema path such as `/rooms`); `BREAKING: <surface> (all)` waives the
 * whole surface. A line without a `<surface>` prefix waives nothing: prose that happens to mention
 * a name is not a waiver. Text after an item's first word (` — why`) is ignored.
 */
export function parseWaiver(line) {
  const m = new RegExp(`^BREAKING:\\s*\`?(${SURFACES.join("|")})\`?\\s*(\\(all\\)|:(.*))`).exec(line);
  if (!m) return null;
  if (m[2] === "(all)") return { surface: m[1], all: true, items: [] };
  const items = m[3]
    .split(",")
    .map((s) => /^\s*`?([^\s`,;]+?)`?(?:[\s.;:]|$)/.exec(s)?.[1])
    .filter(Boolean);
  return { surface: m[1], all: false, items };
}

/** Split findings into failures and those a `BREAKING:` waiver accepts ({@link parseWaiver}). */
export function applyOverrides(findings, lines) {
  const waivers = lines.map((l) => ({ line: l, w: parseWaiver(l) })).filter((x) => x.w);
  const failures = [];
  const accepted = [];
  for (const f of findings) {
    const hit = waivers.find(
      ({ w }) => w.surface === f.surface && (w.all || w.items.includes(f.name) || (f.path && w.items.includes(f.path))),
    );
    if (hit) accepted.push({ ...f, by: hit.line });
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
  const role = f.role ? ` (${f.role}; ${f.why})` : "";
  return `[${f.surface}] ${f.kind}: ${where}${role}${diff}`;
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
 * alias or value (unions sorted). Beside a key whose type is a spelled-out tagged union,
 * `@variants<key>` records its variants; a constant typed by a mapped type over a literal key set
 * is expanded like an `as const` object and marked `@record`. (`@` keys are not compared as members.)
 */
export function typeSurface(entryFile) {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entryFile);
  if (!sf) throw new Error(`cannot read ${entryFile}`);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`${entryFile} is not a module`);
  // A literal-union alias the module does not export (`KindsWith<"opening">`, a mapped-type helper
  // in `src/elements/facets.ts`) is not a name a consumer can see, and the published `.d.ts` may
  // print the same type as its literals: print such an alias as its members (inside an array too,
  // `readonly (…)[]`), so a derived literal union compares as its literals. A lib alias (`Record`,
  // `Partial`) and an alias of anything but literals keep their name; a type with no hidden
  // literal alias in it prints exactly as before.
  const exported = new Set(
    checker.getExportsOfModule(mod).map((s) => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s)),
  );
  const raw = (t) => checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
  const LITERAL =
    ts.TypeFlags.StringLiteral |
    ts.TypeFlags.NumberLiteral |
    ts.TypeFlags.BigIntLiteral |
    ts.TypeFlags.BooleanLiteral |
    ts.TypeFlags.EnumLiteral |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null;
  const hidden = (t) =>
    !!t.aliasSymbol &&
    (t.isUnion() ? t.types : [t]).every((u) => !!(u.flags & LITERAL)) &&
    !exported.has(t.aliasSymbol) &&
    !(t.aliasSymbol.declarations ?? []).some((d) => {
      const file = d.getSourceFile();
      return program.isSourceFileDefaultLibrary(file) || program.isSourceFileFromExternalLibrary(file);
    });
  const expand = (t, depth) => {
    if (depth > 8) return null;
    if (checker.isArrayType(t) && !t.aliasSymbol) {
      const el = checker.getTypeArguments(t)[0];
      const inner = el && expand(el, depth + 1);
      if (inner === null || inner === undefined) return null;
      const ro = t.symbol?.getName() === "ReadonlyArray" ? "readonly " : "";
      return `${ro}${/[\s|&]/.test(inner) ? `(${inner})` : inner}[]`;
    }
    if (t.isUnion() && !t.aliasSymbol) {
      const parts = t.types.map((u) => expand(u, depth + 1));
      if (parts.every((p) => p === null)) return null;
      return t.types.map((u, i) => parts[i] ?? raw(u)).join(" | ");
    }
    if (hidden(t)) {
      const ms = (t.isUnion() ? t.types : [t]).map(raw);
      // The checker prints `true | false` as `boolean`; so does this.
      const out =
        ms.includes("true") && ms.includes("false")
          ? [...ms.filter((m) => m !== "true" && m !== "false"), "boolean"]
          : ms;
      return out.join(" | ");
    }
    return null;
  };
  const print = (t) => normType(expand(t, 0) ?? raw(t));
  const printAlias = (t) =>
    normType(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));

  const isAnonObject = (t) =>
    !!(t.flags & ts.TypeFlags.Object) &&
    !!(t.objectFlags & (ts.ObjectFlags.Anonymous | ts.ObjectFlags.Mapped)) &&
    !t.aliasSymbol &&
    t.getCallSignatures().length === 0 &&
    t.getConstructSignatures().length === 0 &&
    t.getProperties().length > 0;
  // A constant typed by a mapped type over a literal key set (`Readonly<Record<ElementKind, …>>`)
  // has the same members as an `as const` object, so it is read the same way: one member per key.
  const isKeyedRecord = (t) =>
    !!(t.flags & ts.TypeFlags.Object) &&
    !!(t.objectFlags & ts.ObjectFlags.Mapped) &&
    checker.getIndexInfosOfType(t).length === 0 &&
    t.getCallSignatures().length === 0 &&
    t.getConstructSignatures().length === 0 &&
    t.getProperties().length > 0;

  // A TAGGED UNION: every member (give or take `undefined` / `null`) an object type, told apart by
  // a discriminant, a non-optional property present in every member with a single literal type
  // (the one with the most distinct values; ties by name). Members that share its value are told
  // apart by a further discriminant among themselves (`KeepNode`'s `kind: "keep"` variants by
  // `form`). Each variant is recorded with its tag (`kind="wall"`, `kind="keep",form="align"`), the
  // discriminant pairs the tag spells, every single-literal property it has (`lits`, which match it
  // to its twin on the other side, {@link variantDiff}) and its printed type; `null` when the union
  // is not cleanly discriminated.
  const SINGLE_LITERAL =
    ts.TypeFlags.StringLiteral |
    ts.TypeFlags.NumberLiteral |
    ts.TypeFlags.BigIntLiteral |
    ts.TypeFlags.BooleanLiteral |
    ts.TypeFlags.EnumLiteral;
  const literalProp = (u, name) => {
    const p = checker.getPropertyOfType(u, name);
    if (!p || p.flags & ts.SymbolFlags.Optional) return null;
    const pt = checker.getTypeOfSymbol(p);
    return pt.flags & SINGLE_LITERAL && !pt.isUnion() ? raw(pt) : null;
  };
  const propNames = (u) =>
    checker
      .getPropertiesOfType(u)
      .map((p) => p.getName())
      .sort();
  const discriminate = (group, depth) => {
    if (group.length === 1) return [[[], group[0]]];
    if (depth > 4) return null;
    let best = null;
    for (const name of propNames(group[0])) {
      const vals = group.map((u) => literalProp(u, name));
      if (vals.some((v) => v === null)) continue;
      const distinct = new Set(vals).size;
      if (distinct > 1 && (!best || distinct > best.distinct)) best = { name, vals, distinct };
    }
    if (!best) return null;
    const out = [];
    for (const v of [...new Set(best.vals)].sort()) {
      const sub = discriminate(
        group.filter((_, i) => best.vals[i] === v),
        depth + 1,
      );
      if (!sub) return null;
      for (const [pairs, u] of sub) out.push([[[best.name, v], ...pairs], u]);
    }
    return out;
  };
  const variants = (t) => {
    if (!t.isUnion()) return null;
    const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null;
    const objs = t.types.filter((u) => !(u.flags & NULLISH));
    if (objs.length < 2 || !objs.every((u) => u.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return null;
    const tagged = discriminate(objs, 0);
    if (!tagged) return null;
    const list = tagged.map(([pairs, u]) => {
      const lits = {};
      for (const name of propNames(u)) {
        const v = literalProp(u, name);
        if (v !== null) lits[name] = v;
      }
      return { tag: pairs.map(([k, v]) => `${k}=${v}`).join(","), pairs, lits, type: print(u) };
    });
    const rest = t.types.filter((u) => u.flags & NULLISH).map(print).sort().join(" | ") || "never";
    return JSON.stringify({ variants: list, rest });
  };
  /**
   * `out[key]` printed, plus `out["@variants" + key]` when it is a tagged union ({@link variantDiff})
   * printed as its members: a union that prints a named union among its members (`Expr |
   * undefined`) keeps its name's comparison.
   */
  const record = (out, key, t, printed) => {
    out[key] = printed;
    const v = variants(t);
    if (!v) return;
    const spelled = unionMembers(printed)
      .filter((m) => m !== "undefined" && m !== "null")
      .sort();
    const tagged = JSON.parse(v)
      .variants.map((x) => x.type)
      .sort();
    if (spelled.length === tagged.length && spelled.every((m, i) => m === tagged[i])) out[`@variants${key}`] = v;
  };

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
    // (A named union prints as its name and stays a name: only a spelled-out union is tagged.)
    else if (t.aliasSymbol) out[key] = print(t);
    else record(out, key, t, print(t));
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
        else if (f & ts.SymbolFlags.Variable && isKeyedRecord(vt)) {
          // Its member types are declared, not inferred values: a literal one is still compared.
          out["@record"] = "declared member types";
          members(out, "", vt, 0, new Set());
        }
        else out.type = print(vt);
      }
    }
    if (f & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) {
      members(out, "", checker.getDeclaredTypeOfSymbol(sym), 0, new Set());
    } else if (f & ts.SymbolFlags.TypeAlias) {
      const t = checker.getDeclaredTypeOfSymbol(sym);
      if (t.isUnion()) record(out, "type", t, t.types.map(print).sort().join(" | "));
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

  // Variance. A caller BUILDS an input type and READS an output type. An interface or object alias
  // is an input when its name says so (`…Options`, `…Opts`, `…Input`, `…Params`) or when the
  // checker finds it named by a parameter of an exported function or constructor (through unions,
  // intersections, type arguments and array elements); every other one is an output. Functions,
  // constants, classes and enums are `value`: parameters are inputs, everything else an output.
  const paramOf = new Map();
  const collect = (t, fn, depth) => {
    if (!t || depth > 4) return;
    for (const s of [t.aliasSymbol, t.symbol]) {
      const nm = s?.getName().replace(/\$\d+$/, "");
      if (nm && !paramOf.has(nm)) paramOf.set(nm, fn);
    }
    if (t.isUnionOrIntersection()) for (const u of t.types) collect(u, fn, depth + 1);
    for (const a of t.aliasTypeArguments ?? []) collect(a, fn, depth + 1);
    if (t.flags & ts.TypeFlags.Object && t.objectFlags & ts.ObjectFlags.Reference) {
      for (const a of checker.getTypeArguments(t)) collect(a, fn, depth + 1);
    }
  };
  for (const exp of checker.getExportsOfModule(mod)) {
    const sym = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    if (!(sym.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class))) continue;
    const vt = checker.getTypeOfSymbol(sym);
    for (const sig of [...vt.getCallSignatures(), ...vt.getConstructSignatures()]) {
      for (const p of sig.getParameters()) collect(checker.getTypeOfSymbol(p), exp.getName(), 0);
    }
  }
  for (const [name, out] of Object.entries(surface)) {
    const typeLike = /(^|,)(interface|type)(,|$)/.test(out.kind) && !/(function|const|class|enum)/.test(out.kind);
    if (!typeLike) {
      out["@role"] = "value";
      out["@why"] = "a value: its parameters are inputs, the rest outputs";
    } else if (/(Options|Opts|Input|Params)$/.test(name)) {
      out["@role"] = "input";
      out["@why"] = "input by its name";
    } else if (paramOf.has(name)) {
      out["@role"] = "input";
      out["@why"] = `input: a parameter type of ${paramOf.get(name)}`;
    } else {
      out["@role"] = "output";
      out["@why"] = "output: no exported function takes it";
    }
  }
  return surface;
}

/**
 * `sub` ⊆ `sup` for two canonical printed types: equal, or every union member of `sub` is covered by
 * a member of `sup` (an array whose element is covered, an object whose fields are). Objects:
 * every required field of `sup` is a required field of `sub`, every shared field covered; fields
 * only `sub` has are allowed when `extraOk` (an output may gain fields; an input may not lose any).
 */
function subsumes(sub, sup, extraOk) {
  if (sub === sup) return true;
  const supM = unionMembers(sup);
  const supSet = new Set(supM);
  return unionMembers(sub).every(
    (m) => supSet.has(m) || supM.some((x) => arraySubsumes(m, x, extraOk) || objectSubsumes(m, x, extraOk)),
  );
}

function arraySubsumes(sub, sup, extraOk) {
  const el = (s) => /^(readonly )?(?:\((.+)\)|([^\s|()]+))\[\]$/.exec(s);
  const a = el(sub);
  const b = el(sup);
  return !!a && !!b && (a[1] ?? "") === (b[1] ?? "") && subsumes(a[2] ?? a[3], b[2] ?? b[3], extraOk);
}

function objectFields(s) {
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  const m = new Map();
  for (const f of splitTop(s.slice(1, -1), ";")) {
    const at = splitTop(f, ":");
    if (at.length < 2) return null;
    const optional = at[0].endsWith("?");
    m.set(optional ? at[0].slice(0, -1) : at[0], { optional, type: at.slice(1).join(": ") });
  }
  return m;
}

function objectSubsumes(sub, sup, extraOk) {
  const a = objectFields(sub);
  const b = objectFields(sup);
  if (!a || !b) return false;
  for (const [k, f] of b) {
    const g = a.get(k);
    if (!g) {
      if (!f.optional) return false;
      continue;
    }
    if (g.optional && !f.optional) return false;
    if (!subsumes(g.type, f.type, extraOk)) return false;
  }
  for (const k of a.keys()) if (!b.has(k) && !extraOk) return false;
  return true;
}

/**
 * Did the leaf change compatibly? An input (a parameter, an input type's member) may only widen:
 * old ⊆ new. An output (a return, an output type's member, a constant) may only narrow: new ⊆ old.
 */
export function compatible(oldT, newT, role) {
  return role === "input" ? subsumes(oldT, newT, false) : subsumes(newT, oldT, true);
}

/** A single string/number literal type (`"…"`, `1`), the value of a `const` member. */
const isLiteral = (s) => /^("([^"\\]|\\.)*"|-?\d+(\.\d+)?|true|false)$/.test(s);

/**
 * An ENUM-LIKE pair: both sides a union of literals (an array of one too), give or take `undefined`
 * / `null`. Such a set is append-only in BOTH roles (owner ruling on #599): a new element kind,
 * door kind, export format or code is a minor release and an exhaustive `switch` must handle
 * unknown members, so an added literal passes and a removed one fails. The `undefined`/`null`
 * part keeps the strict variance of `role`. `null` when the pair is not enum-like.
 */
function enumDiff(o, n, role) {
  // (One literal prints without parentheses: `readonly "a"[]`.)
  const arr = (s) => /^(readonly )?(?:\((.+)\)|([^\s|()]+))\[\]$/.exec(s);
  const ao = arr(o);
  const an = arr(n);
  if (ao && an) return ao[1] === an[1] ? enumDiff(ao[2] ?? ao[3], an[2] ?? an[3], role) : null;
  const om = unionMembers(o);
  const nm = unionMembers(n);
  const nullish = (x) => x === "undefined" || x === "null";
  const ol = om.filter(isLiteral);
  const nl = nm.filter(isLiteral);
  if (!ol.length || !nl.length) return null;
  if (![...om, ...nm].every((m) => isLiteral(m) || nullish(m))) return null;
  const kept = new Set(nl);
  const rest = (ms) => ms.filter(nullish).sort().join(" | ") || "never";
  return { removed: ol.filter((m) => !kept.has(m)), restOk: compatible(rest(om), rest(nm), role) };
}

/**
 * A TAGGED-UNION pair: both sides a union of object types told apart by a discriminant (the
 * `@variants…` record {@link typeSurface} writes beside the printed type). Its variants are an
 * enum-like set, like a union of literals (a new element kind is a minor release): a variant added
 * passes, a variant removed fails (one finding naming it), in both roles. A variant on both sides
 * is compared with the strict variance of `role` (a named variant prints as its name, whose shape
 * is its own export's comparison); so is the `undefined`/`null` part. `null` when either side is
 * not tagged, which leaves the pair to the ordinary comparison.
 *
 * An old variant's twin is the new variant whose discriminant pairs it carries as literals and
 * which carries its pairs (so a tag that grew a level, `kind="k"` → `kind="k",form="x"` once a
 * second `kind: "k"` variant arrives, still matches); discrimination makes the twin unique.
 */
function variantDiff(oRec, nRec, role) {
  if (!oRec || !nRec) return null;
  const o = JSON.parse(oRec);
  const n = JSON.parse(nRec);
  const carries = (v, pairs) => pairs.every(([k, val]) => v.lits[k] === val);
  const removed = [];
  const changed = [];
  for (const ov of o.variants) {
    const nv = n.variants.find((x) => carries(x, ov.pairs) && carries(ov, x.pairs));
    if (!nv) removed.push({ tag: ov.tag, old: ov.type });
    else if (!compatible(ov.type, nv.type, role)) changed.push({ tag: ov.tag, old: ov.type, new: nv.type });
  }
  return { removed, changed, restOk: compatible(o.rest, n.rest, role) };
}

/** The element type of a printed array (`readonly (A | B)[]`, `A[]`), or `null` for any other type. */
function arrayElements(s) {
  if (typeof s !== "string") return null;
  const m = /^(?:readonly )?(?:\((.+)\)|([^\s|()]+))\[\]$/.exec(s);
  return m ? (m[1] ?? m[2]) : null;
}

const optionals = (s) => (s.match(/\.\?/g) ?? []).length;
const unq = (k) => k.replace(/\.\?/g, ".");
const bare = (s) => s.replace(/^(\?|\.\.\.)/, "");

/**
 * Variance-aware diff of two {@link typeSurface} results (see the `@role` notes there). Every
 * finding carries `role` (`input` / `output`) and `why` (how its export was classified). A
 * union of literals, an `as const` list (`[]` keys) and a tagged union's variants (`@variants…`
 * keys) are enum-like sets, additive-only, in both roles ({@link enumDiff}, {@link variantDiff}); a
 * constant keyed by a set has one member per key (`@record`), so a key may be added, not removed.
 * A constant's inferred literal value (not a keyed constant's declared one), generic constraints
 * and `readonly` are not compared.
 */
export function compareTypeSurfaces(oldS, newS) {
  const findings = [];
  const surface = "public-types";
  for (const name of Object.keys(oldS).sort()) {
    const o = oldS[name];
    const n = newS[name];
    const exportRole = n?.["@role"] === "input" || o["@role"] === "input" ? "input" : (n?.["@role"] ?? o["@role"]);
    const why = (exportRole === "input" && n?.["@role"] !== "input" ? o["@why"] : n?.["@why"]) ?? o["@why"];
    if (!n) {
      findings.push({ surface, kind: "removed export", name, role: exportRole, why, old: o.kind });
      continue;
    }
    const roleOf = (k) => {
      if (/^(sig|new)\d+\.(p\d+|required)$/.test(k)) return "input";
      if (exportRole === "value") return "output";
      return exportRole;
    };
    const push = (k, f) => findings.push({ surface, name, role: roleOf(k), why, ...f });
    const nKeys = new Map(Object.keys(n).map((k) => [unq(k), k]));
    for (const k of Object.keys(o)) {
      if (k.startsWith("@")) continue;
      const role = roleOf(k);
      let nk = k in n ? k : nKeys.get(unq(k));
      // A list read as a tuple on one side (`k[]`, an `as const` list) and as an array on the
      // other (`k`, `readonly ("a" | "b")[]`, e.g. spread from a derived list) is the same set.
      let list = null;
      if (nk === undefined) {
        const twin = k.endsWith("[]") ? k.slice(0, -2) : `${k}[]`;
        const tk = twin in n ? twin : nKeys.get(unq(twin));
        const ol = k.endsWith("[]") ? o[k] : arrayElements(o[k]);
        const nl = tk === undefined ? null : tk.endsWith("[]") ? n[tk] : arrayElements(n[tk]);
        if (ol && nl) {
          nk = tk;
          list = { o: ol, n: nl };
        }
      }
      if (nk === undefined) {
        push(k, { kind: k === "kind" ? "removed kind" : "removed member", path: k, old: o[k] });
        continue;
      }
      if (optionals(nk) < optionals(k) && role === "input") {
        push(k, { kind: "member became required", path: nk, old: o[k], new: n[nk] });
        continue;
      }
      if (optionals(nk) > optionals(k) && role === "output") {
        push(k, { kind: "member became optional", path: nk, old: o[k], new: n[nk] });
        continue;
      }
      if (k === "kind") {
        // `interface X` ↔ `type X = {…}` is one kind to a consumer (its members are compared).
        const kinds = (s) => s.split(",").map((x) => (x === "interface" ? "type" : x));
        const nk2 = new Set(kinds(n.kind));
        if (kinds(o.kind).some((x) => x && !nk2.has(x))) push(k, { kind: "removed kind", old: o.kind, new: n.kind });
      } else if (/\.required$/.test(k)) {
        if (Number(n[nk]) > Number(o[k])) push(k, { kind: "new required parameter", path: k, old: o[k], new: n[nk] });
      } else if (list || k.endsWith("[]")) {
        // An `as const` list (keyword tables, enum values): entries may be added, not removed.
        const ol = list ? list.o : o[k];
        const nl = list ? list.n : n[nk];
        const en = enumDiff(ol, nl, "input");
        if (en ? en.removed.length > 0 : !subsumes(ol, nl, false)) {
          push(k, { kind: en ? "enum member removed" : "removed list entry", path: k, old: o[k], new: n[nk] });
        }
      } else if (
        o.kind === "const" &&
        n.kind === "const" &&
        !o["@record"] &&
        !n["@record"] &&
        isLiteral(o[k]) &&
        isLiteral(n[nk])
      ) {
        // A constant's VALUE changed (a schema description, a version string): not a type
        // contract. The Plan schema's own `const`s are checked as JSON by `plan-schema`.
      } else if (variantDiff(o[`@variants${k}`], n[`@variants${nk}`], role)) {
        const vd = variantDiff(o[`@variants${k}`], n[`@variants${nk}`], role);
        const changedKind = role === "input" ? "narrowed input type" : "widened output type";
        for (const v of vd.removed) push(k, { kind: "variant removed", path: k, old: `${v.tag}: ${v.old}` });
        for (const v of vd.changed) {
          push(k, { kind: changedKind, path: k, old: `${v.tag}: ${v.old}`, new: `${v.tag}: ${v.new}` });
        }
        if (!vd.restOk) push(k, { kind: changedKind, path: k, old: o[k], new: n[nk] });
      } else if (enumDiff(bare(o[k]), bare(n[nk]), role)) {
        const en = enumDiff(bare(o[k]), bare(n[nk]), role);
        if (en.removed.length) push(k, { kind: "enum member removed", path: k, old: o[k], new: n[nk] });
        else if (!en.restOk) {
          push(k, {
            kind: role === "input" ? "narrowed input type" : "widened output type",
            path: k,
            old: o[k],
            new: n[nk],
          });
        }
      } else if (!compatible(bare(o[k]), bare(n[nk]), role)) {
        // (A parameter's `?` / `...` marker is compared below.)
        push(k, {
          kind: role === "input" ? "narrowed input type" : "widened output type",
          path: k,
          old: o[k],
          new: n[nk],
        });
      }
    }
    // A parameter that was optional and is now required at the same position.
    for (const k of Object.keys(o)) {
      const m = /^(sig|new)(\d+)\.p(\d+)$/.exec(k);
      if (m && o[k].startsWith("?") && n[k] && !n[k].startsWith("?") && !n[k].startsWith("...")) {
        push(k, { kind: "parameter became required", path: k, old: o[k], new: n[k] });
      }
    }
    // NEW members of an input type: a caller's existing object lacks them, so a required one breaks.
    if (exportRole === "input") {
      const oldPrefixes = new Set();
      for (const k of Object.keys(o)) {
        const segs = unq(k).split(".");
        for (let i = 1; i <= segs.length; i++) oldPrefixes.add(segs.slice(0, i).join("."));
        // A list member is the same member as a tuple (`.x[]`) or as an array (`.x`).
        const whole = unq(k);
        oldPrefixes.add(whole.endsWith("[]") ? whole.slice(0, -2) : `${whole}[]`);
      }
      const seen = new Set();
      for (const nk of Object.keys(n)) {
        if (!nk.startsWith(".") || oldPrefixes.has(unq(nk))) continue;
        const raw = nk.split(".");
        let i = 1;
        while (i < raw.length - 1 && oldPrefixes.has(unq(raw.slice(0, i + 1).join(".")))) i++;
        const member = raw.slice(0, i + 1).join(".");
        if (seen.has(member)) continue;
        seen.add(member);
        const last = raw[i] ?? "";
        const leafUndefined = member === nk && unionMembers(n[nk]).includes("undefined");
        if (!last.startsWith("?") && !leafUndefined) {
          findings.push({ surface, name, role: "input", why, kind: "new required member", path: member, new: n[nk] });
        }
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
    } else if (
      n.type !== undefined &&
      ["$ref", "anyOf", "oneOf", "allOf", "enum", "const"].every((key) => o[key] === undefined)
    ) {
      // `{}` (anything) → `{ type: … }` is a narrowing.
      out.push({ surface, kind: "narrowed to a type", name, path: p || "/", old: "(any)", new: show(n.type) });
    }
    // Bounds and formats: a tightened (or newly added) one rejects what the old schema accepted.
    for (const key of ["minimum", "exclusiveMinimum", "minLength", "minItems", "minProperties"]) {
      if (n[key] !== undefined && (o[key] === undefined || n[key] > o[key])) {
        out.push({ surface, kind: `tightened ${key}`, name, path: p || "/", old: show(o[key]), new: show(n[key]) });
      }
    }
    for (const key of ["maximum", "exclusiveMaximum", "maxLength", "maxItems", "maxProperties"]) {
      if (n[key] !== undefined && (o[key] === undefined || n[key] < o[key])) {
        out.push({ surface, kind: `tightened ${key}`, name, path: p || "/", old: show(o[key]), new: show(n[key]) });
      }
    }
    for (const key of ["pattern", "format"]) {
      if (n[key] !== undefined && n[key] !== o[key]) {
        out.push({ surface, kind: `changed ${key}`, name, path: p || "/", old: show(o[key]), new: show(n[key]) });
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
    if (o.additionalProperties !== false && n.additionalProperties === false) {
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
    return Object.fromEntries(
      tools.map((t) => [t.name, { inputSchema: t.inputSchema ?? {}, outputSchema: t.outputSchema }]),
    );
  } finally {
    await client.close();
    await server.close();
  }
}

/**
 * Additive-only diff of two `{ toolName: { inputSchema, outputSchema? } }` maps. An `outputSchema`
 * that appears passes; one that changes is held to the same rules as the input; one that
 * disappears fails.
 */
export function compareMcpTools(oldT, newT) {
  const surface = "mcp-schemas";
  const out = [];
  for (const name of Object.keys(oldT).sort()) {
    if (!(name in newT)) {
      out.push({ surface, kind: "removed tool", name });
      continue;
    }
    const o = oldT[name];
    const n = newT[name];
    out.push(...compareJsonSchemas(o.inputSchema, n.inputSchema, { surface, name }));
    if (o.outputSchema && !n.outputSchema) out.push({ surface, kind: "removed outputSchema", name });
    else if (o.outputSchema) {
      out.push(...compareJsonSchemas(o.outputSchema, n.outputSchema, { surface, name, path: "/outputSchema" }));
    }
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
