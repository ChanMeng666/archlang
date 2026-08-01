/**
 * Lockstep gates for `packages/mcp` — the manifests, the dep range, and the
 * resource list that a build/publish silently gets wrong.
 *
 * Every assertion here encodes a failure that has actually happened or that the
 * iron laws in AGENTS.md exist to prevent:
 *
 * - a version bumped in `package.json` but not in BOTH of `server.json`'s version
 *   fields → the release workflow `npm view`-skips the publish and the change never
 *   ships (the law: "a prose-only change publishes ONLY with a version bump");
 * - `mcpName` drifting from `server.json`'s `name` → registry.modelcontextprotocol.io
 *   identity-checks them and rejects the publish (the 0.1.0 → 0.1.1 fix);
 * - the core dep range resolving NEWER than the resources baked in at pack time —
 *   the 0.2.2 staleness class;
 * - a resource added to the copy script but not registered in the server (or the
 *   reverse), so `dist/` and the served set disagree.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "..");
const REPO = resolve(MCP, "..", "..");

const readJson = (p: string): Record<string, any> => JSON.parse(readFileSync(p, "utf8"));
const readText = (p: string): string => readFileSync(p, "utf8");

const pkg = readJson(resolve(MCP, "package.json"));
const serverJson = readJson(resolve(MCP, "server.json"));
const rootPkg = readJson(resolve(REPO, "package.json"));

describe("server.json ↔ package.json", () => {
  it("BOTH of server.json's version fields equal the package version", () => {
    // There are two, and missing the second is the whole failure mode: the registry
    // manifest's own `version` and the npm package coordinate's `version`.
    expect(serverJson.version).toBe(pkg.version);
    expect(Array.isArray(serverJson.packages)).toBe(true);
    expect(serverJson.packages.length).toBeGreaterThan(0);
    for (const p of serverJson.packages) expect(p.version).toBe(pkg.version);
    // Guard the guard: if a future schema adds a third `version`, this catches it.
    const versionFields = JSON.stringify(serverJson).match(/"version":/g) ?? [];
    expect(versionFields.length).toBe(1 + serverJson.packages.length);
  });

  it("server.json `name` equals package.json `mcpName` (the registry identity check)", () => {
    expect(typeof pkg.mcpName).toBe("string");
    expect(typeof serverJson.name).toBe("string");
    expect(serverJson.name).toBe(pkg.mcpName);
    // The namespace is case-sensitive and matched against the GitHub login.
    expect(serverJson.name).toMatch(/^io\.github\.ChanMeng666\//);
  });

  it("server.json names the published npm package and stays inside the registry's limits", () => {
    for (const p of serverJson.packages) expect(p.identifier).toBe(pkg.name);
    // The registry caps a server `description` at 100 characters.
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
  });
});

describe("core dep range ↔ the core's version", () => {
  it('dependencies["@chanmeng666/archlang"] is exactly "^" + the root package version', () => {
    // INTENTIONAL FRICTION. This is a STRING equality, not a semver-satisfies check,
    // and that is the point: `^1.14.0` happily *resolves* to a 1.24 core, which is
    // exactly how 0.2.2 came to serve a v1.19 spec and a v1.19 grammar next to a
    // current compiler. The resources in dist/ are baked at PACK time, so the only
    // safe posture is that every core release turns this package RED until someone
    // consciously re-pins the range, rebuilds the resources, and bumps the shim's
    // version. Do NOT relax this to a range check to make a core release green — the
    // red IS the reminder that the baked context needs refreshing.
    expect(pkg.dependencies["@chanmeng666/archlang"]).toBe(`^${rootPkg.version}`);
  });

  it("the MCP SDK stays quarantined here and never leaks into the core", () => {
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeTruthy();
    const coreDeps = { ...(rootPkg.dependencies ?? {}) };
    expect(Object.keys(coreDeps)).toEqual([]); // the core's zero-runtime-dep law
  });
});

describe("copy-resources.mjs ↔ src/server.ts", () => {
  const copyScript = readText(resolve(MCP, "scripts", "copy-resources.mjs"));
  const serverSrc = readText(resolve(MCP, "src", "server.ts"));

  /** The `["<repo-rel source>", "<flat dest>"]` pairs in the copy script's RESOURCES list. */
  const copyPairs: Array<[string, string]> = [...copyScript.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map(
    (m) => [m[1]!, m[2]!],
  );

  /** The `readResource("<flat>", "<repo-rel>")` calls the server registers. */
  const serverPairs: Array<[string, string]> = [
    ...serverSrc.matchAll(/readResource\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g),
  ].map((m) => [m[1]!, m[2]!]);

  it("extracts a non-empty list from each side (the regexes still match)", () => {
    expect(copyPairs.length).toBeGreaterThan(0);
    expect(serverPairs.length).toBe(copyPairs.length);
  });

  it("every source the copy script lists exists in the repo", () => {
    for (const [src] of copyPairs) expect(() => readText(resolve(REPO, src)), src).not.toThrow();
  });

  it("the copied set and the server's fallback read paths are the SAME set", () => {
    // copy pairs are [repoRel, flat]; server pairs are readResource(flat, repoRel).
    const copied = copyPairs.map(([src, dest]) => `${dest}<-${src}`).sort();
    const served = serverPairs.map(([flat, repoRel]) => `${flat}<-${repoRel}`).sort();
    expect(served).toEqual(copied);
  });

  it("the copy script's own comment does not misstate how many resources it copies", () => {
    // The header said "four MCP resource files" for two releases after the fifth
    // (intent.schema.json) landed. A comment that lies is how the next agent
    // convinces themselves the list is complete without counting it.
    const stated = copyScript.match(/\b(one|two|three|four|five|six|seven|eight)\b\s+(?:MCP\s+)?resource/i);
    const words = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
    if (stated) expect(words.indexOf(stated[1]!.toLowerCase()) + 1).toBe(copyPairs.length);
  });
});

describe("package files", () => {
  it("`files` ships dist/ and server.json — the two a host and the registry read", () => {
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "server.json"]));
  });

  it("the build wires the resource copy after tsup, so dist/ is never bundle-only", () => {
    expect(pkg.scripts.build).toContain("copy-resources.mjs");
    expect(pkg.scripts.prepack).toContain("build"); // pack always rebuilds the resources
  });
});
