/**
 * The Q20 licence gate (archlang-3d plan §8.5 L1; card A4), shared by `test/licences.test.ts` and
 * the THIRD_PARTY_NOTICES generator (`npm -w packages/archlang-3d run notices`).
 *
 * `installedRuntime()` walks what the package's runtime really installs: its `dependencies` and
 * `optionalDependencies`, transitively, each resolved the way Node resolves it (`node_modules/<name>`
 * from the requiring package's directory upward) and read from the INSTALLED package.json, never
 * from the lockfile or a registry. An optional dependency that is not installed (another
 * platform's binary) is skipped. The peer core is ArchLang itself and is not walked.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Allowed {
  /** A package name, or `@scope/*` for every package of a scope (esbuild's per-platform binaries). */
  name: string;
  version: string;
  license: string;
  source: string;
  checked: string;
}
export interface Denied {
  name: string;
  major: number;
  reason: string;
}
export interface Policy {
  permitted: string[];
  allow: Allowed[];
  deny: Denied[];
}
export interface Installed {
  name: string;
  version: string;
  /** The installed package.json's `license` (or a joined legacy `licenses` array). */
  license: string;
  dir: string;
  /** The chain that pulled it in, from the package's own dependency. */
  via: string[];
}

export const readPolicy = (): Policy => JSON.parse(readFileSync(join(PKG, "licences.json"), "utf8")) as Policy;

interface Manifest {
  name: string;
  version: string;
  license?: string | { type: string };
  licenses?: Array<{ type: string }>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
const manifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;

/** `name`'s directory as Node finds it from `from`. */
function find(name: string, from: string): string | undefined {
  for (let d = from; ; ) {
    const p = join(d, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return p;
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
}

const licenceOf = (m: Manifest): string =>
  typeof m.license === "string"
    ? m.license
    : (m.license?.type ?? (m.licenses ?? []).map((l) => l.type).join(" OR ") ?? "");

/** Every package the runtime installs, sorted by name; a missing required dependency throws. */
export function installedRuntime(root: string = PKG): Installed[] {
  const out = new Map<string, Installed>();
  const visit = (dir: string, via: string[]): void => {
    const m = manifest(dir);
    const optional = m.optionalDependencies ?? {};
    for (const name of Object.keys({ ...m.dependencies, ...optional }).sort()) {
      const d = find(name, dir);
      if (!d) {
        if (name in optional) continue;
        throw new Error(`${[...via, name].join(" > ")}: not installed (run npm ci)`);
      }
      if (out.has(d)) continue;
      const dm = manifest(d);
      out.set(d, { name: dm.name, version: dm.version, license: licenceOf(dm), dir: d, via: [...via, name] });
      visit(d, [...via, name]);
    }
  };
  visit(root, []);
  return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const nameMatches = (pattern: string, name: string): boolean =>
  pattern.endsWith("/*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name;

/** The deny entry `p` falls under, if any (by name and major version). */
export function denied(p: { name: string; version: string }, policy: Policy): Denied | undefined {
  const major = Number(p.version.split(".")[0]);
  return policy.deny.find((d) => d.name === p.name && d.major === major);
}

/** Why `p` fails the gate, or `undefined` when it passes. The deny list wins over the allow list. */
export function verdict(p: Pick<Installed, "name" | "version" | "license">, policy: Policy): string | undefined {
  const d = denied(p, policy);
  if (d) return `${p.name}@${p.version} is denied: ${d.reason}`;
  const a = policy.allow.find((x) => nameMatches(x.name, p.name) && x.version === p.version);
  if (!a)
    return `${p.name}@${p.version} (${p.license || "no licence field"}) is not on the allow list: source-check it and add it to licences.json`;
  if (a.license !== p.license) return `${p.name}@${p.version} says ${p.license}, the allow list recorded ${a.license}`;
  if (!policy.permitted.includes(a.license)) return `${p.name}@${p.version}: ${a.license} is not a permitted licence`;
  return undefined;
}

/** The licence file of an installed package (LICENSE, LICENSE.md, LICENCE …), or undefined. */
export function licenceFile(dir: string): string | undefined {
  const f = readdirSync(dir).find((n) => /^licen[cs]e(\.(md|txt))?$/i.test(n));
  return f ? join(dir, f) : undefined;
}

/** THIRD_PARTY_NOTICES, from the allow list and each package's own licence text. */
export function notices(policy: Policy = readPolicy(), root: string = PKG): string {
  const installed = installedRuntime(root);
  const parts = [
    "THIRD-PARTY SOFTWARE NOTICES — @chanmeng666/archlang-3d",
    "",
    "Generated from licences.json by `npm -w packages/archlang-3d run notices`; do not edit by hand.",
    "The packages below are the package's runtime dependencies, transitively, each source-checked",
    "(plan §8.5 L1, Q20). Each licence text is copied from the installed package.",
  ];
  for (const a of policy.allow) {
    parts.push("", "=".repeat(78), `${a.name} ${a.version} — ${a.license}`, a.source, "", a.checked);
    if (a.name.endsWith("/*")) continue;
    const p = installed.find((i) => i.name === a.name && i.version === a.version);
    const file = p && licenceFile(p.dir);
    if (!file) throw new Error(`${a.name}@${a.version}: not installed, or no licence file`);
    parts.push("", readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd());
    // Apache-2.0 §4(d): a NOTICE file travels with the work.
    const notice = readdirSync(p.dir).find((n) => /^notices?(\.(md|txt))?$/i.test(n));
    if (notice)
      parts.push(
        "",
        `--- ${notice} ---`,
        "",
        readFileSync(join(p.dir, notice), "utf8").replace(/\r\n/g, "\n").trimEnd(),
      );
  }
  return `${parts.join("\n")}\n`;
}

export const NOTICES_FILE = join(PKG, "THIRD_PARTY_NOTICES");

// `tsx scripts/licence-gate.ts --write` regenerates the notices file.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv.includes("--write")
) {
  writeFileSync(NOTICES_FILE, notices());
  process.stdout.write(`wrote ${NOTICES_FILE}\n`);
}
