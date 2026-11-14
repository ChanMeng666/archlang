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
import { posix, resolve } from "node:path";
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
      "THIRD-PARTY-NOTICES.md",
      "llms-full.txt",
      "package.json",
      "spec.llm.md",
    ]);
  });

  it("ships nothing outside the root files, dist/, examples/ and the skills", () => {
    const strays = paths.filter(
      (p) => p.includes("/") && !/^(dist|examples)\//.test(p) && !/^skills\/[a-z0-9-]+\/SKILL\.md$/.test(p),
    );
    expect(strays).toEqual([]);
    // The umbrella skill ships beside the task skills it lists; the root holds no SKILL.md.
    expect(paths).toContain("skills/archlang/SKILL.md");
    expect(paths.filter((p) => p.startsWith("skills/")).length).toBeGreaterThan(1);
  });

  it("keeps dist/error-catalog.js and its map out of the tarball", () => {
    // Built for the repository's playground alone (card RM0.7, tsup.config.ts): no `exports` entry
    // names it, so nothing in the package can load it. The exclusion is pinned in `files`, which
    // this suite can read without a build, and in npm's own list, which names dist/ only after one.
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { files: string[] };
    expect(pkg.files).toContain("!dist/error-catalog.js");
    expect(pkg.files).toContain("!dist/error-catalog.js.map");
    expect(paths.filter((p) => p.startsWith("dist/error-catalog"))).toEqual([]);
  });

  it("keeps dist/compile-path.js and its map out of the tarball, and nothing the package loads", () => {
    // A build entry for the repository's playground alone (card RM0.7f, tsup.config.ts): it holds
    // only imports and exports, no `exports` entry names it and nothing imports it. Its chunks are
    // imported by dist/index.js too, so they must ship. Checked from the sources, which this suite
    // can read without a build: the `files` negations are exactly the two playground-only builds,
    // so none can drop a chunk; and every file package.json points a consumer at is built by a
    // tsup entry and excluded by no negation.
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      files: string[];
      exports: Record<string, { types: string; import: string }>;
      bin: Record<string, string>;
      main: string;
      types: string;
    };
    const negations = pkg.files.filter((f) => f.startsWith("!"));
    expect(negations.sort()).toEqual(
      [
        "!dist/compile-path.js",
        "!dist/compile-path.js.map",
        "!dist/error-catalog.js",
        "!dist/error-catalog.js.map",
      ].sort(),
    );
    const tsup = readFileSync(resolve("tsup.config.ts"), "utf8");
    const list = (re: RegExp) => [...(re.exec(tsup)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
    const entries = list(/\n {2}entry: \[([^\]]*)\]/);
    const dtsEntries = list(/\n {2}dts: \{ entry: \[([^\]]*)\]/);
    expect(entries).toContain("src/compile-path.ts");
    expect(dtsEntries, "no declaration file for the build-only entry").not.toContain("src/compile-path.ts");
    // `./dist/cli/link.js` ← `src/cli/link.ts`, `./dist/index.d.ts` ← a dts entry `src/index.ts`.
    const source = (target: string) => target.replace(/^\.?\/?dist\//, "src/").replace(/(\.d)?\.js$|\.d\.ts$/, ".ts");
    const targets = [
      ...Object.values(pkg.exports).flatMap((e) => [e.import, e.types]),
      ...Object.values(pkg.bin),
      pkg.main,
      pkg.types,
    ];
    for (const target of targets) {
      const rel = target.replace(/^\.\//, "");
      expect(rel, `${target} is under dist/`).toMatch(/^dist\//);
      expect(negations, `${target} is not excluded from the tarball`).not.toContain(`!${rel}`);
      const from = target.endsWith(".d.ts") ? dtsEntries : entries;
      expect(from, `${target} is built by a tsup entry`).toContain(source(target));
    }
    expect(targets.map((t) => t.replace(/^\.\//, ""))).toContain("dist/cli/link.js");
    expect(paths.filter((p) => p.startsWith("dist/compile-path"))).toEqual([]);
    // After a build (locally; CI's suite runs without one), npm's own list: every chunk the
    // package's entries (the `.js` targets above, read from package.json) import ships.
    const builtEntries = [...new Set(targets.map((t) => t.replace(/^\.\//, "")))].filter(
      (p) => p.endsWith(".js") && paths.includes(p),
    );
    for (const entry of builtEntries) {
      const text = readFileSync(resolve(entry), "utf8");
      for (const m of text.matchAll(/^import\s(?:[^;]*?from\s*)?"((?:\.\.?\/)+chunk-[\w-]+\.js)";?$/gm)) {
        const file = posix.normalize(posix.join(posix.dirname(entry), m[1] as string));
        expect(paths, `${entry} imports ${file}, which must ship`).toContain(file);
      }
    }
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
