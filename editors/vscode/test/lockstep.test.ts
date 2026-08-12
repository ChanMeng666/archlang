/**
 * Lockstep gate for `editors/vscode` — the DECLARED core dep range.
 *
 * This exists because the range rotted for two full releases: at v1.26.0 prep the
 * extension's `@chanmeng666/archlang` still read `^1.24.0`, and nothing anywhere
 * went red for it. Mirrors `packages/mcp/test/lockstep.test.ts`, which pins the
 * shim's range the same way and for the same reason.
 *
 * ── Why this is NOT redundant with `stdio.test.ts` (do not delete either) ──
 *
 * The two files answer different questions, and the stale range survived precisely
 * because the one that was already answered kept saying yes:
 *
 *   - `stdio.test.ts`'s `__CORE_VERSION__` stamp asks **"did the rebundle take?"** —
 *     it reads the version esbuild inlined into the shipped `dist/server.js` and
 *     compares it against what npm RESOLVED for this workspace. It passed the whole
 *     time the range was stale, and correctly so: esbuild resolves the workspace
 *     symlink to the root core regardless of what the manifest declares, so the
 *     bundle really was current. That is the more important of the two assertions
 *     — it is about the artifact users install.
 *
 *   - This file asks **"does the manifest still describe the core it bundles?"** —
 *     which is what a reader, `npm ls`, a dependabot PR, and any future
 *     non-bundled consumption path all believe. A bundle can be right while the
 *     manifest lies; only this catches that.
 *
 * Neither implies the other. Deleting one as "already covered" reopens exactly the
 * hole this closes.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, "..");
const REPO = resolve(EXT, "..", "..");

interface Manifest {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const readJson = (p: string): Manifest => JSON.parse(readFileSync(p, "utf8")) as Manifest;

const pkg = readJson(resolve(EXT, "package.json"));
const rootPkg = readJson(resolve(REPO, "package.json"));

const CORE = "@chanmeng666/archlang";

describe("core dep range ↔ the core's version", () => {
  it(`declares ${CORE} in exactly one dependency map, and it is devDependencies`, () => {
    // Guard the guard: the range assertion below reads ONE field, so a move to
    // `dependencies` would otherwise make it vacuous-by-undefined rather than
    // meaningful. devDependencies is also the truthful field — esbuild inlines the
    // core at build time and `vsce package --no-dependencies` ships no
    // `node_modules`, so nothing is a *runtime* dependency of the .vsix.
    expect(pkg.devDependencies?.[CORE], `${CORE} missing from devDependencies`).toBeTruthy();
    expect(pkg.dependencies?.[CORE], `${CORE} must not also be a runtime dependency`).toBeUndefined();
  });

  it(`devDependencies["${CORE}"] is exactly "^" + the root package version`, () => {
    // INTENTIONAL FRICTION, and a STRING equality rather than a semver-satisfies
    // check — satisfies is exactly what let `^1.24.0` look fine against a 1.25.0
    // and then a 1.26.0 core. Every core release must turn this red on purpose
    // until someone consciously re-pins the range and decides whether the
    // extension needs a rebundle + Marketplace upload. Do NOT relax it to a range
    // check to make a core release green — the red IS the reminder.
    expect(pkg.devDependencies?.[CORE]).toBe(`^${rootPkg.version}`);
  });

  it("does not couple the extension's own version to the core's (a DECISION, not an omission)", () => {
    // The open question was whether to also require `editors/vscode`'s `version` to
    // have moved in the same commit. Decided NO, deliberately:
    //
    //   1. The shim's equivalent does not either, and this file exists to mirror it.
    //      A second, stricter law in the mirror would be a silent divergence.
    //   2. The extension is versioned independently ON PURPOSE. Its cadence is
    //      Marketplace uploads (a human web step at
    //      marketplace.visualstudio.com/manage/publishers/ChanMeng — there is no CI
    //      publish), not npm releases. A core release that changes nothing the
    //      extension surfaces warrants no new extension version.
    //   3. Coupling them would redden the suite for every core release regardless,
    //      which is the failure mode that trains people to bump a number to get
    //      green — the opposite of the considered re-pin this gate is asking for.
    //
    // What IS asserted: the version is a real semver, so the pin above stays
    // comparable to something. Freshness of the shipped bundle is `stdio.test.ts`'s
    // job (see this file's header), and it is a stronger check than a bumped digit.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(rootPkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
