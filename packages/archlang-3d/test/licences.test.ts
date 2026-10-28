/**
 * The Q20 licence gate (archlang-3d plan §8.5 L1; card A4). What the runtime INSTALLS, read from
 * each installed package.json transitively, must be on `licences.json`'s allow list at its exact
 * version and stated licence, a permitted licence, and off the deny list (which wins). The allow
 * list holds no stale entry, and THIRD_PARTY_NOTICES is exactly what the generator writes from it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installedRuntime, licenceFile, NOTICES_FILE, notices, readPolicy, verdict } from "../scripts/licence-gate.js";

const policy = readPolicy();
const installed = installedRuntime();

describe("licence gate (Q20)", () => {
  it("walks the real runtime tree, the package's own dependencies included", () => {
    const names = installed.map((p) => p.name);
    const own = Object.keys(
      (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: object })
        .dependencies,
    );
    for (const n of own) expect(names).toContain(n);
    expect(names).toContain("property-graph"); // a transitive one
    expect(names.some((n) => n.startsWith("@esbuild/"))).toBe(true); // an installed optional one
  });

  it("every installed runtime package passes: allow-listed at its version and licence, not denied", () => {
    const failures = installed.map((p) => verdict(p, policy)).filter((v): v is string => v !== undefined);
    expect(failures).toEqual([]);
  });

  it("every exact allow-list entry is installed and ships a licence file (no stale entries)", () => {
    for (const a of policy.allow.filter((x) => !x.name.endsWith("/*"))) {
      const p = installed.find((i) => i.name === a.name && i.version === a.version);
      expect(p, `${a.name}@${a.version} is listed but not installed`).toBeDefined();
      expect(p && licenceFile(p.dir), `${a.name} has no LICENSE file`).toBeDefined();
      expect(a.checked.length, `${a.name}: the source check is not written down`).toBeGreaterThan(40);
    }
  });

  it("refuses a package off the list, a changed licence, and anything on the deny list", () => {
    expect(verdict({ name: "left-pad", version: "1.3.0", license: "WTFPL" }, policy)).toMatch(/not on the allow list/);
    expect(verdict({ name: "three", version: "0.187.0", license: "MIT" }, policy)).toMatch(/not on the allow list/);
    expect(verdict({ name: "three", version: "0.186.1", license: "GPL-3.0" }, policy)).toMatch(/says GPL-3.0/);
    // straight-skeleton@3 says MIT and wraps GPL-3.0+ CGAL: denied even were it allow-listed.
    const trap = { name: "straight-skeleton", version: "3.0.0", license: "MIT" };
    expect(verdict(trap, policy)).toMatch(/denied/);
    const listed = { ...policy, allow: [...policy.allow, { ...trap, source: "x", checked: "x" }] };
    expect(verdict(trap, listed)).toMatch(/denied/);
    expect(policy.deny.map((d) => `${d.name}@${d.major}`)).toContain("straight-skeleton@3");
  });

  it("walks peers too: a dependency's required peer is gated, a missing optional peer skipped, the root's peer not walked", () => {
    const root = mkdtempSync(join(tmpdir(), "archlang3d-licences-"));
    const pkg = (dir: string, m: object) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0.0", license: "MIT", ...m }));
    };
    try {
      const nm = join(root, "node_modules");
      pkg(root, { name: "root", dependencies: { a: "1" }, peerDependencies: { core: "1" } });
      pkg(join(nm, "core"), { name: "core" });
      pkg(join(nm, "a"), {
        name: "a",
        peerDependencies: { b: "1", c: "1", d: "1" },
        peerDependenciesMeta: { c: { optional: true }, d: { optional: true } },
      });
      pkg(join(nm, "b"), { name: "b", license: "GPL-3.0-only" });
      pkg(join(nm, "d"), { name: "d" });
      const names = installedRuntime(root).map((p) => p.name);
      // b (required peer) and d (optional peer, installed) are walked; c (optional, absent) is skipped;
      // the root's own peer (the core) is not.
      expect(names).toEqual(["a", "b", "d"]);
      const b = installedRuntime(root).find((p) => p.name === "b");
      expect(b && verdict(b, policy)).toMatch(/not on the allow list/);
      rmSync(join(nm, "b"), { recursive: true });
      expect(() => installedRuntime(root)).toThrow(/a > b: not installed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("THIRD_PARTY_NOTICES is the generator's output (npm -w packages/archlang-3d run notices)", () => {
    expect(readFileSync(NOTICES_FILE, "utf8").replace(/\r\n/g, "\n")).toBe(notices(policy));
  });
});
