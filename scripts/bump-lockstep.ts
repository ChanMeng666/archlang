/**
 * Re-pin the hand-moved release fields from one source: the core version.
 *
 *   npm run release:pin -- [<core version>] [--shim-version <x.y.z>] [--dry-run] [--root <dir>]
 *
 * The core version defaults to the root `package.json` `version`. Rewrites ONLY:
 *   - `packages/mcp/package.json`: the core dep range (`^` + core version) and, when that range
 *     changes, the shim's own `version` (patch + 1, or `--shim-version`): the shim's baked
 *     resources refresh only with a version bump (`.claude/commands/release-check.md` § 2);
 *   - `packages/mcp/server.json`: BOTH `version` fields, set to the shim's version;
 *   - `editors/vscode/package.json`: the core dep range.
 * NOT moved, by design: the root `package.json` version (the release PR's own edit), the
 * `@chanmeng666/archlang-font-cjk` exact pin (it equals `packages/font-cjk`'s version, which moves
 * only on a font release, never with the core; `release.yml` refuses a mismatch), `editors/vscode`'s
 * own version (a decision per release), and the generated pins (`npm run gen:plugin`,
 * `gen:agent-manifests`, `gen:arch-plan`, which derive the core and shim versions).
 * Idempotent: a second run with the same version changes nothing. The red lockstep tests
 * (`packages/mcp/test/lockstep.test.ts`, `editors/vscode/test/lockstep.test.ts`) stay the verifier.
 * Edits are text replacements, so every other byte of each manifest is untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = "@chanmeng666/archlang";
const SEMVER = /^\d+\.\d+\.\d+$/;

export interface PinEdit {
  readonly file: string;
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

/** Compute (and with `write`, apply) the pin edits under `root`. */
export function pinLockstep(
  root: string,
  coreVersion: string,
  opts: { write: boolean; shimVersion?: string },
): PinEdit[] {
  if (!SEMVER.test(coreVersion)) throw new Error(`not a x.y.z version: ${coreVersion}`);
  const edits: PinEdit[] = [];
  const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");
  const save = (rel: string, text: string): void => {
    if (opts.write) writeFileSync(resolve(root, rel), text);
  };
  const range = `^${coreVersion}`;
  const rangeRe = new RegExp(`("${CORE}": ")([^"]*)(")`);
  const rangeOf = (text: string, file: string): string => {
    const m = rangeRe.exec(text);
    if (!m) throw new Error(`${file}: core range not found`);
    return m[2]!;
  };

  // packages/mcp/package.json
  const mcpRel = "packages/mcp/package.json";
  let mcp = read(mcpRel);
  const oldRange = rangeOf(mcp, mcpRel);
  const versionRe = /^(\s*"version": ")([^"]*)(")/m;
  const oldShim = versionRe.exec(mcp)?.[2];
  if (oldShim === undefined) throw new Error(`${mcpRel}: version not found`);
  let shim = oldShim;
  if (opts.shimVersion !== undefined) {
    if (!SEMVER.test(opts.shimVersion)) throw new Error(`not a x.y.z version: ${opts.shimVersion}`);
    shim = opts.shimVersion;
  } else if (oldRange !== range) {
    const [a, b, c] = oldShim.split(".").map(Number);
    shim = `${a}.${b}.${c! + 1}`;
  }
  if (oldRange !== range) {
    mcp = mcp.replace(rangeRe, `$1${range}$3`);
    edits.push({ file: mcpRel, field: `dependencies["${CORE}"]`, from: oldRange, to: range });
  }
  if (oldShim !== shim) {
    mcp = mcp.replace(versionRe, `$1${shim}$3`);
    edits.push({ file: mcpRel, field: "version", from: oldShim, to: shim });
  }
  save(mcpRel, mcp);

  // packages/mcp/server.json: both version fields
  const srvRel = "packages/mcp/server.json";
  let srv = read(srvRel);
  const all = [...srv.matchAll(/^(\s*"version": ")([^"]*)(")/gm)];
  if (all.length !== 2) throw new Error(`${srvRel}: expected 2 version fields, found ${all.length}`);
  all.forEach((m, i) => {
    if (m[2] !== shim) {
      edits.push({ file: srvRel, field: i === 0 ? "version" : "packages[0].version", from: m[2]!, to: shim });
    }
  });
  srv = srv.replace(/^(\s*"version": ")([^"]*)(")/gm, `$1${shim}$3`);
  save(srvRel, srv);

  // editors/vscode/package.json
  const vsRel = "editors/vscode/package.json";
  let vs = read(vsRel);
  const oldVs = rangeOf(vs, vsRel);
  if (oldVs !== range) {
    vs = vs.replace(rangeRe, `$1${range}$3`);
    edits.push({ file: vsRel, field: `devDependencies["${CORE}"]`, from: oldVs, to: range });
  }
  save(vsRel, vs);
  return edits;
}

function main(argv: string[]): number {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let version: string | undefined;
  let shimVersion: string | undefined;
  let dry = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") dry = true;
    else if (a === "--root") root = resolve(argv[++i] ?? "");
    else if (a === "--shim-version") shimVersion = argv[++i];
    else if (a.startsWith("-")) {
      process.stderr.write(`unknown flag ${a}\n`);
      return 3;
    } else version = a;
  }
  version ??= (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string }).version;
  const edits = pinLockstep(root, version, { write: !dry, shimVersion });
  for (const e of edits) {
    process.stdout.write(`${dry ? "would set" : "set"} ${e.file} ${e.field}: ${e.from} -> ${e.to}\n`);
  }
  if (edits.length === 0) process.stdout.write(`already pinned to ${version}\n`);
  else if (!dry) {
    process.stdout.write(
      "next: npm run gen:plugin && npm run gen:agent-manifests && npm run gen:arch-plan, then the lockstep tests\n",
    );
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
