/**
 * 3.14 — the extension must never bundle another checkout's core.
 *
 * `npm run vscode:build:only` (and `npm run package`) from inside a `.claude/worktrees/*`
 * checkout resolves `@chanmeng666/archlang` by walking UP to the shared repo's
 * `node_modules`, because a worktree has no `node_modules` of its own — so esbuild
 * inlines the OTHER checkout's language into the `.vsix`. It was observed live: a
 * `dist/server.js` carrying a pre-fix 1-argument `dimSwapFix` beside the worktree's own
 * 2-argument one.
 *
 * The reason it needs a test of its own rather than a line in `stdio.test.ts`: the
 * `__CORE_VERSION__` freshness stamp **passes** in this scenario, and correctly so by
 * its own contract. Both checkouts are the same repo at the same version, so they stamp
 * the same string. Every visible signal agreed while the artifact was wrong. The
 * simulation below reproduces exactly that — two fake checkouts at the SAME version, so
 * the stamp cannot discriminate — and asserts the new guard does.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs build helper with no type declarations, imported for
// its behaviour: the guard must be tested where it actually runs, not re-implemented.
import { assertCoreIsOurs, isInside, ownRepoRoot, resolveCore } from "../resolve-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, "..");

type Core = { version: string; dir: string };

/** A throwaway two-checkout tree: a "main" repo with node_modules, and a worktree without. */
function fakeRepos(mainVersion: string, worktreeVersion: string): { main: string; wtExt: string } {
  const root = mkdtempSync(join(tmpdir(), "archlang-3.14-"));
  temps.push(root);
  const main = join(root, "repo");
  const pkg = (name: string, version: string) => JSON.stringify({ name, version, workspaces: ["editors/vscode"] });

  // The MAIN checkout: a root manifest plus the workspace symlink npm materialises as a
  // directory here (a real symlink is not needed — what matters is where the manifest is).
  const mainCore = join(main, "node_modules", "@chanmeng666", "archlang");
  mkdirSync(mainCore, { recursive: true });
  writeFileSync(join(main, "package.json"), pkg("@chanmeng666/archlang", mainVersion));
  writeFileSync(join(mainCore, "package.json"), pkg("@chanmeng666/archlang", mainVersion));

  // The WORKTREE, living inside the main checkout as `git worktree add` requires on this
  // machine — and with NO node_modules of its own, which is the entire mechanism.
  const wt = join(main, ".claude", "worktrees", "w1");
  const wtExt = join(wt, "editors", "vscode");
  mkdirSync(wtExt, { recursive: true });
  writeFileSync(join(wt, "package.json"), pkg("@chanmeng666/archlang", worktreeVersion));
  writeFileSync(join(wtExt, "package.json"), pkg("archlang", "0.0.0"));

  return { main, wtExt };
}

const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe("3.14 — a build refuses a core from another checkout", () => {
  it("resolving from a worktree really does reach the MAIN checkout's core", () => {
    // The mechanism itself, before any guard: this is what esbuild does today.
    const { main, wtExt } = fakeRepos("9.9.9", "9.9.9");
    const core = resolveCore(wtExt) as Core;
    expect(core.dir).toBe(join(main, "node_modules", "@chanmeng666", "archlang"));
    // …and the tree being built is the worktree, not the main checkout.
    expect(ownRepoRoot(wtExt)).toBe(join(main, ".claude", "worktrees", "w1"));
  });

  it("the guard fires where the __CORE_VERSION__ stamp cannot — SAME version, wrong tree", () => {
    const { wtExt } = fakeRepos("9.9.9", "9.9.9");
    const core = resolveCore(wtExt) as Core;
    const root = ownRepoRoot(wtExt) as string;
    // The stamp's own question, answered green: the versions agree, so a freshness check
    // comparing them sees nothing wrong. This line is the point of the whole test.
    expect(core.version).toBe("9.9.9");
    expect(() => assertCoreIsOurs(core, root)).toThrow(/NOT in the checkout being built/);
  });

  it("the refusal names BOTH paths, so it is actionable", () => {
    const { main, wtExt } = fakeRepos("9.9.9", "9.9.9");
    let message = "";
    try {
      assertCoreIsOurs(resolveCore(wtExt) as Core, ownRepoRoot(wtExt) as string);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(join(main, ".claude", "worktrees", "w1")); // the tree being built
    expect(message).toContain(join(main, "node_modules", "@chanmeng666", "archlang")); // the core it found
    expect(message).toContain("PRIMARY checkout");
  });

  it("a worktree WITH its own node_modules builds fine", () => {
    // The guard's subject is provenance, not location: a worktree that genuinely has the
    // core inside it is a correct build and must not be refused.
    const { wtExt } = fakeRepos("9.9.9", "9.9.9");
    const wt = resolve(wtExt, "..", "..");
    const own = join(wt, "node_modules", "@chanmeng666", "archlang");
    mkdirSync(own, { recursive: true });
    writeFileSync(join(own, "package.json"), JSON.stringify({ name: "@chanmeng666/archlang", version: "1.2.3" }));
    const core = resolveCore(wtExt) as Core;
    expect(core.dir).toBe(own);
    expect(assertCoreIsOurs(core, ownRepoRoot(wtExt) as string)).toBe("1.2.3");
  });

  it("THIS checkout passes — the guard is not simply always-throw", () => {
    // Non-vacuity from the other direction: run it exactly as `esbuild.mjs` does, on the
    // real tree. A guard that refused everything would pass every case above.
    const core = resolveCore(EXT) as Core;
    const root = ownRepoRoot(EXT) as string;
    expect(assertCoreIsOurs(core, root)).toBe(core.version);
    // And the core it resolved really is this repo's root package (the workspace link).
    expect(resolve(core.dir)).toBe(resolve(EXT, "..", ".."));
  });

  it("isInside answers by REAL path, and equality counts", () => {
    const inside = isInside as (child: string, root: string) => boolean;
    expect(inside(EXT, resolve(EXT, "..", ".."))).toBe(true);
    expect(inside(EXT, EXT)).toBe(true); // the core resolves to the repo root itself
    expect(inside(resolve(EXT, "..", ".."), EXT)).toBe(false); // an ANCESTOR is not inside
    expect(inside(join(EXT, "..", "..", "..", "elsewhere"), resolve(EXT, "..", ".."))).toBe(false);
  });
});
