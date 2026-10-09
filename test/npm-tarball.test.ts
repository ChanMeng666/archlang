/**
 * What `npm publish` actually ships — asked of npm itself, not of `package.json`.
 *
 * The `files` list is only an input: npm adds `package.json`, `README.md` and
 * `LICENSE` on its own, and drops anything the list names that is not there. So
 * the one honest answer to "is X in the tarball?" is `npm pack --dry-run --json`,
 * which computes the file list `npm publish` would upload without writing a tarball.
 *
 * The case that made this test: `CHANGELOG.md` was never in the tarball. Embedders
 * are told, release after release, to read the new version's "For embedders"
 * paragraph — and an agent doing a dependency bump in a sandbox reads
 * `node_modules`, found no changelog, and had to reverse-engineer 1.41.0 from a
 * tarball diff. The release notes now ship, and README.md says where.
 *
 * Pinned is the set of files at the package ROOT, exactly: one added or dropped is a
 * change to what every consumer installs, and should be a decision made here, not a
 * side effect of a `files` edit. `dist/` and `examples/` are left to their own
 * tests: `dist/` exists only after `npm run build` (CI runs this suite without one),
 * and the examples are covered by the golden suites.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface PackEntry {
  path: string;
  size: number;
}

/** The file list `npm publish` would upload, from npm itself. */
function packedFiles(): PackEntry[] {
  // `--ignore-scripts`: the dry run must not build or test. Windows needs a shell to
  // run `npm.cmd`; the arguments are fixed literals, so nothing is interpolated.
  const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: resolve("."),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`npm pack --dry-run failed (${r.status}):\n${r.stderr}`);
  const out = JSON.parse(r.stdout) as Array<{ name: string; files: PackEntry[] }>;
  expect(out).toHaveLength(1); // the root package only, never a workspace
  const [pkg] = out;
  if (pkg === undefined) throw new Error("npm pack --dry-run --json listed no package");
  expect(pkg.name).toBe("@chanmeng666/archlang");
  return pkg.files;
}

describe("npm tarball (npm pack --dry-run)", () => {
  const files = packedFiles();
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));

  it("ships exactly these files at the package root", () => {
    const root = paths.filter((p) => !p.includes("/")).sort();
    expect(root).toEqual([
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "SKILL.md",
      "llms-full.txt",
      "package.json",
      "spec.llm.md",
    ]);
  });

  it("ships nothing outside the root files, dist/, examples/ and the task skills", () => {
    const strays = paths.filter(
      (p) => p.includes("/") && !/^(dist|examples)\//.test(p) && !/^skills\/[a-z0-9-]+\/SKILL\.md$/.test(p),
    );
    expect(strays).toEqual([]);
    // The task skills ship beside the root SKILL.md that points at them.
    expect(paths.filter((p) => p.startsWith("skills/")).length).toBeGreaterThan(0);
  });

  it("ships the whole CHANGELOG.md, byte for byte", () => {
    // Not a trimmed copy: a bump that skips several minors needs every entry between.
    const entry = files.find((f) => f.path === "CHANGELOG.md");
    expect(entry?.size).toBe(readFileSync(resolve("CHANGELOG.md")).length);
  });

  it("README.md says where the release notes live, in the package and on the web", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    // `.includes` rather than `toContain`: a miss would otherwise print all 120KB of README.
    for (const where of [
      "node_modules/@chanmeng666/archlang/CHANGELOG.md",
      "https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md",
    ]) {
      expect(readme.includes(where), `README.md names ${where}`).toBe(true);
    }
  });
});
