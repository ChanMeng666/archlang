import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { MODULE_CAP_BYTES } from "../src/input-limit.js";

/**
 * `import` is rooted (EH1.12, ruling EH-D7). The CLI's file-system World once read any path an
 * `import` named (`..`, an absolute path, a drive letter), and the module's parse error quoted the
 * file's first tokens back: a file-existence and first-token oracle, and a way to pull a file from
 * outside the project into a drawing. Now a module is read only when its real path (links and
 * junctions followed) lies under the import root (the working directory, or `--import-root`) or
 * the plan's own directory, it
 * is `.arch`, and it is at most `MODULE_CAP_BYTES`; a refusal is a catalogued diagnostic at the
 * `import`, and a module's parse error reports its code and `<path>:<line>:<col>`, never its text.
 */

const SECRET = "SECRETTOKEN_7f3a";
const LIB = 'plan "lib" {\n  component box(x, y) { room at (x, y) size 1000x1000 }\n}\n';

/** A tmp tree: `<tmp>/secret.txt`, `<tmp>/secret.arch` (unparseable), `<tmp>/root/{plans,lib}`. */
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "arch-import-rooted-")));
const ROOT = join(TMP, "root");
mkdirSync(join(ROOT, "plans"), { recursive: true });
mkdirSync(join(ROOT, "lib"), { recursive: true });
writeFileSync(join(TMP, "secret.txt"), `${SECRET} hunter2\n`);
writeFileSync(join(TMP, "secret.arch"), `${SECRET} hunter2\n`);
writeFileSync(join(ROOT, "lib", "box.arch"), LIB);
writeFileSync(join(ROOT, "lib", "notes.txt"), LIB);
writeFileSync(join(ROOT, "lib", "BOX2.ARCH"), LIB);
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const plan = (spec: string): string => `plan "P" {\n  import "${spec}" as m\n  room at (0,0) size 3000x3000\n}\n`;

/** Compile `src` as if it were `<ROOT>/plans/x.arch`, under import root `root`. */
function run(src: string, root = ROOT): Diagnostic[] {
  return compile(src, {
    world: makeNodeWorld(join(ROOT, "plans"), root),
    noCache: true,
  }).diagnostics;
}
const errors = (ds: Diagnostic[]): Diagnostic[] => ds.filter((d) => d.severity === "error");
const codes = (ds: Diagnostic[]): string[] => errors(ds).map((d) => d.code ?? "");
const noContent = (ds: Diagnostic[]): void => {
  const all = JSON.stringify(ds);
  expect(all).not.toContain(SECRET);
  expect(all).not.toContain("hunter2");
};

describe("a module outside the import root is refused, never read", () => {
  it("`..` out of the root", () => {
    const ds = run(plan("../../secret.arch"));
    expect(codes(ds)).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    expect(errors(ds)[0]!.message).toContain("--import-root");
    noContent(ds);
  });

  it("an absolute path", () => {
    const ds = run(plan(join(TMP, "secret.arch").replace(/\\/g, "/")));
    expect(codes(ds)).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    noContent(ds);
  });

  it("a backslash path (Windows separators the importer does not split)", () => {
    const ds = run(plan("..\\\\..\\\\secret.arch"));
    expect(codes(ds)).toEqual([process.platform === "win32" ? "E_IMPORT_OUTSIDE_ROOT" : "E_IMPORT_NOT_FOUND"]);
    noContent(ds);
  });

  it("a symbolic link or junction inside the root pointing out of it: an existing and a missing target read the same", (ctx) => {
    const link = join(ROOT, "lib", "escape");
    try {
      symlinkSync(TMP, link, process.platform === "win32" ? "junction" : "dir");
    } catch (e) {
      // Skipped visibly, with the reason: this runner cannot create a directory link.
      console.warn(`import-rooted: skipping the link case: ${(e as Error).message}`);
      ctx.skip();
      return;
    }
    try {
      const ds = run(plan("../lib/escape/secret.arch"));
      expect(codes(ds)).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
      noContent(ds);
      // No existence oracle through the link: a file that is NOT there beyond it is refused the
      // same way, never E_IMPORT_NOT_FOUND.
      expect(codes(run(plan("../lib/escape/missing.arch")))).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
      expect(codes(run(plan("../lib/escape/nodir/missing.arch")))).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    } finally {
      // Remove the link itself (never recursively through it) before the tree is deleted.
      try {
        unlinkSync(link);
      } catch {
        rmdirSync(link);
      }
    }
  });

  it("the audit's probe: `..`, an absolute path and C:/Windows/win.ini — no file content in any diagnostic", () => {
    const src = [
      'plan "P" {',
      '  import "../../secret.txt" as s',
      `  import "${join(TMP, "secret.txt").replace(/\\/g, "/")}" as t`,
      '  import "C:/Windows/win.ini" as w',
      "  room at (0,0) size 3000x3000",
      "}",
    ].join("\n");
    const ds = run(src);
    expect(codes(ds)).toEqual(["E_IMPORT_OUTSIDE_ROOT", "E_IMPORT_OUTSIDE_ROOT", "E_IMPORT_OUTSIDE_ROOT"]);
    noContent(ds);
    expect(JSON.stringify(ds)).not.toMatch(/found "/);
  });
});

describe("only `.arch`, only up to the cap", () => {
  it("a `.txt` inside the root is refused by extension", () => {
    const ds = run(plan("../lib/notes.txt"));
    expect(codes(ds)).toEqual(["E_IMPORT_NOT_ARCH"]);
  });

  it("the extension is case-insensitive", () => {
    expect(codes(run(plan("../lib/BOX2.ARCH")))).toEqual([]);
  });

  it("a module over MODULE_CAP_BYTES is refused without being read", () => {
    writeFileSync(join(ROOT, "lib", "huge.arch"), "#".repeat(MODULE_CAP_BYTES + 1));
    const ds = run(plan("../lib/huge.arch"));
    expect(codes(ds)).toEqual(["E_IMPORT_TOO_LARGE"]);
  });

  it("a missing module inside the root is still E_IMPORT_NOT_FOUND", () => {
    expect(codes(run(plan("../lib/missing.arch")))).toEqual(["E_IMPORT_NOT_FOUND"]);
  });
});

describe("what the root allows", () => {
  it("a library in a sibling directory under the root imports", () => {
    const ds = run(plan("../lib/box.arch"));
    expect(codes(ds)).toEqual([]);
  });

  it("a file whose name starts with `..` is inside the root, not above it", () => {
    writeFileSync(join(ROOT, "lib", "..evil.arch"), LIB);
    writeFileSync(join(ROOT, "plans", "..beside.arch"), LIB);
    expect(codes(run(plan("../lib/..evil.arch")))).toEqual([]);
    expect(codes(run(plan("..beside.arch")))).toEqual([]);
  });

  it("a directory that merely shares the root's name as a prefix is outside it (`proj` vs `proj2`)", () => {
    const proj = join(TMP, "proj");
    mkdirSync(proj, { recursive: true });
    mkdirSync(join(TMP, "proj2"), { recursive: true });
    writeFileSync(join(TMP, "proj2", "x.arch"), LIB);
    const ds = compile(plan("../proj2/x.arch"), { world: makeNodeWorld(proj, proj), noCache: true }).diagnostics;
    expect(codes(ds)).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
  });

  it("--import-root widening to a parent lets the outside module through (and its parse error stays token-free)", () => {
    const ds = run(plan("../../secret.arch"), TMP);
    expect(codes(ds).every((c) => c === "E_IMPORT_PARSE")).toBe(true);
    expect(codes(ds).length).toBeGreaterThan(0);
    for (const d of errors(ds))
      expect(d.message).toMatch(
        /^In module "\.\.\/\.\.\/secret\.arch": E_[A-Z_]+ at \.\.\/\.\.\/secret\.arch:\d+:\d+ /,
      );
    noContent(ds);
  });
});

describe("the CLI: default root is the working directory; --import-root is a declared flag", () => {
  const CLI = resolve("src/cli.ts");
  const TSX = resolve("node_modules/tsx/dist/esm/index.mjs");
  const cli = (cwd: string, ...args: string[]) => {
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(TSX).href, CLI, ...args], {
      cwd,
      encoding: "utf8",
    });
    return { status: r.status, out: r.stdout + r.stderr, json: r.stdout };
  };
  writeFileSync(join(ROOT, "plans", "outside.arch"), plan("../../secret.txt"));
  writeFileSync(join(ROOT, "plans", "sibling.arch"), plan("../lib/box.arch"));
  mkdirSync(join(ROOT, "plans", "parts"), { recursive: true });
  writeFileSync(join(ROOT, "plans", "parts", "box.arch"), LIB);
  writeFileSync(join(ROOT, "plans", "beside.arch"), plan("parts/box.arch"));

  it("run from the root: a sibling library imports, `..` out of it is refused with no content", () => {
    const ok = cli(ROOT, "compile", "plans/sibling.arch", "--json");
    expect(ok.status, ok.out).toBe(0);
    const bad = cli(ROOT, "compile", "plans/outside.arch", "--json");
    expect(bad.status).toBe(2);
    expect(bad.json).toContain("E_IMPORT_OUTSIDE_ROOT");
    expect(bad.out).not.toContain(SECRET);
  });

  it("run from plans/: the sibling library is outside the default root until --import-root names its parent", () => {
    const refused = cli(join(ROOT, "plans"), "compile", "sibling.arch", "--json");
    expect(refused.status).toBe(2);
    expect(refused.json).toContain("E_IMPORT_OUTSIDE_ROOT");
    const widened = cli(join(ROOT, "plans"), "compile", "sibling.arch", "--json", "--import-root", "..");
    expect(widened.status, widened.out).toBe(0);
    const lint = cli(join(ROOT, "plans"), "lint", "sibling.arch", "--json", "--import-root", "..");
    expect(lint.json).not.toContain("E_IMPORT_OUTSIDE_ROOT");
  });

  it("run from anywhere: a library beside or below the plan imports (the plan's own directory is a root)", () => {
    const r = cli(TMP, "compile", join(ROOT, "plans", "beside.arch"), "--json");
    expect(r.status, r.out).toBe(0);
  });

  it("--import-root naming no directory is a usage error (exit 3)", () => {
    const r = cli(ROOT, "compile", "plans/sibling.arch", "--import-root", join(TMP, "nope"));
    expect(r.status).toBe(3);
    expect(r.out).toContain("--import-root");
  });
});
