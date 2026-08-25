/**
 * Which `@chanmeng666/archlang` is this build about to INLINE, and is it OURS?
 *
 * Extracted from `esbuild.mjs` so it can be tested with injected paths — the build
 * script itself cannot be imported by a test, because importing it deletes `dist/`
 * and starts a build.
 *
 * ── The defect this exists to stop (docs/backlog.md 3.14) ──
 *
 * The extension bundles the core at build time, so `npm run package` in the wrong
 * directory ships the wrong language. Running `vscode:build:only` from inside a
 * `.claude/worktrees/*` checkout does exactly that: a worktree has no `node_modules`
 * of its own, so node — and esbuild with it — walks UP the directory chain and finds
 * the SHARED repo's, bundling that checkout's core instead of the worktree's. Observed
 * live: an agent's `dist/server.js` carried a pre-fix 1-argument `dimSwapFix` while its
 * own `dist/chunk-*.js` had the 2-argument one.
 *
 * **The `__CORE_VERSION__` freshness stamp cannot see it.** That stamp asks "is the
 * bundle stale in VERSION?", and both checkouts stamp the same version, so it passes
 * — an agent could package and upload a stale language with an entirely green
 * bundle-freshness check, which is the exact failure the stamp was added to prevent.
 * Nothing asserted the bundle came from THIS tree. That is what {@link assertCoreIsOurs}
 * asserts, and it is a different question from "is it the right version".
 *
 * ── Why junctioning `node_modules` does NOT make it safe ──
 *
 * It is tempting to think the walk-up is the whole bug and a junctioned
 * `node_modules` fixes it. It does not, and the guard deliberately refuses that case
 * too. npm installs a workspace package as a symlink with an ABSOLUTE target, so
 * `node_modules/@chanmeng666/archlang` points at the MAIN checkout's root no matter
 * which tree's `node_modules` you reached it through. Junctioning moves the walk one
 * step and changes nothing about which core gets bundled. The only safe answer is the
 * one below: the resolved core must live inside the tree being built.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";

/** The package the extension inlines — and, in this monorepo, the repo root itself. */
export const CORE_PKG = "@chanmeng666/archlang";

/** Realpath `p`, falling back to `p` itself when it does not exist (test injection). */
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Is `child` the same directory as `root`, or somewhere beneath it? Both are compared
 * as resolved real paths, so a junction or a symlink on either side lands on the same
 * answer as the filesystem would — string prefixes alone would call a junctioned
 * worktree "inside" when node has already resolved past it. Case-insensitive on
 * Windows, where `d:\repo` and `D:\Repo` are one directory.
 */
export function isInside(child, root) {
  const norm = (p) => (process.platform === "win32" ? real(p).toLowerCase() : real(p));
  const rel = relative(norm(root), norm(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The root of the checkout this BUILD belongs to: walk up from `startDir` to the first
 * directory whose `package.json` is the core's own manifest.
 *
 * Derived, not assumed — `resolve(HERE, "../..")` would give the same answer today and
 * silently the wrong one the moment the extension moves a directory deeper.
 */
export function ownRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    const p = join(dir, "package.json");
    if (existsSync(p)) {
      let name;
      try {
        name = JSON.parse(readFileSync(p, "utf8")).name;
      } catch {
        name = undefined;
      }
      if (name === CORE_PKG) return real(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`cannot find the ${CORE_PKG} repo root above ${startDir}`);
    dir = parent;
  }
}

/**
 * Resolve the core the way node itself would — walking the `node_modules` chain up from
 * `startDir` — and report both its version and where it actually lives.
 *
 * `require.resolve` cannot be used: the core's `exports` map has no `./package.json`
 * entry and no `require` condition, so the manifest is unreachable through it.
 */
export function resolveCore(startDir) {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "node_modules", CORE_PKG, "package.json");
    if (existsSync(candidate)) {
      return { version: JSON.parse(readFileSync(candidate, "utf8")).version, dir: real(dirname(candidate)) };
    }
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error(`cannot resolve ${CORE_PKG}/package.json — run \`npm install\` at the repo root`);
    dir = parent;
  }
}

/**
 * Refuse to build when the resolved core is not part of this checkout.
 *
 * Returns the core's version on success so the caller can stamp it; throws naming BOTH
 * paths on failure, because "the wrong core" is unactionable without them — the whole
 * difficulty of this bug was that every visible signal agreed.
 */
export function assertCoreIsOurs(core, repoRoot) {
  if (isInside(core.dir, repoRoot)) return core.version;
  throw new Error(
    [
      `Refusing to build: the resolved ${CORE_PKG} is NOT in the checkout being built.`,
      ``,
      `  building   ${repoRoot}`,
      `  would bundle core from  ${core.dir}  (version ${core.version})`,
      ``,
      `This is docs/backlog.md 3.14. A git worktree has no node_modules of its own, so`,
      `node walks up to the shared checkout's — and junctioning node_modules does not help,`,
      `because npm links a workspace package by ABSOLUTE path to the main tree's root. The`,
      `bundled language would be the other checkout's while the __CORE_VERSION__ stamp`,
      `stayed green, since both stamp the same version.`,
      ``,
      `Build and package the extension in the PRIMARY checkout.`,
    ].join("\n"),
  );
}
