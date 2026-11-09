/**
 * The 3D CLI's `import` is rooted like the core CLI's (EH1.17b): its World reads a module only
 * from under the working directory or the plan's own directory (links and junctions followed),
 * only a `.arch` file, only up to 1 MiB, and a refusal reaches the caller as the core's catalogued
 * code at the `import`. Before, `makeNodeWorld` read any path an `import` named.
 * `test/workspace-seams.test.ts` (repository root) holds this World and the core CLI's in lockstep.
 */
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
import { join } from "node:path";
import { compile } from "@chanmeng666/archlang";
import { afterAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/run.js";
import { makeNodeWorld } from "../src/node.js";
import { MODULE_CAP_BYTES } from "../src/world.js";

const SECRET = "SECRETTOKEN_3d91";
const LIB = 'plan "lib" {\n  component box(x, y) { room at (x, y) size 1000x1000 }\n}\n';
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "arch3d-world-")));
const ROOT = join(TMP, "root");
const PLANS = join(ROOT, "plans");
mkdirSync(PLANS, { recursive: true });
mkdirSync(join(ROOT, "lib"), { recursive: true });
writeFileSync(join(TMP, "x.arch"), `${SECRET} hunter2\n`);
writeFileSync(join(ROOT, "lib", "box.arch"), LIB);
writeFileSync(join(ROOT, "lib", "notes.txt"), LIB);
writeFileSync(join(ROOT, "lib", "huge.arch"), "#".repeat(MODULE_CAP_BYTES + 1));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const plan = (spec: string): string =>
  `plan "P" {\n  import "${spec}" as m\n  wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }\n}\n`;

/** Errors of `src` compiled as `<ROOT>/plans/p.arch` through the 3D package's World, rooted at `root`. */
const codes = (spec: string, root = ROOT): string[] =>
  compile(plan(spec), { world: makeNodeWorld(PLANS, root), noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

describe("the 3D package's World is rooted", () => {
  it("refuses `..` out of the roots, an absolute path outside them, a non-.arch file and an oversize one", () => {
    expect(codes("../../x.arch")).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    // A drive letter is absolute on Windows; on POSIX the importer drops the leading `/`, so the
    // spec lands under the plan's directory, where nothing is.
    const abs = join(TMP, "x.arch").replace(/\\/g, "/");
    expect(codes(abs)).toEqual([process.platform === "win32" ? "E_IMPORT_OUTSIDE_ROOT" : "E_IMPORT_NOT_FOUND"]);
    expect(codes("../lib/notes.txt")).toEqual(["E_IMPORT_NOT_ARCH"]);
    expect(codes("../lib/huge.arch")).toEqual(["E_IMPORT_TOO_LARGE"]);
  });

  it("reads what the roots hold, and a module missing inside them is not found", () => {
    expect(codes("../lib/box.arch")).toEqual([]);
    expect(codes("../lib/missing.arch")).toEqual(["E_IMPORT_NOT_FOUND"]);
    // A root that holds the module lets it through: the policy is the roots, not the `..`.
    expect(codes("../../x.arch", TMP).every((c) => c === "E_IMPORT_PARSE")).toBe(true);
  });

  it("a link inside the root pointing out of it is refused, for an existing and a missing target alike", (ctx) => {
    const link = join(ROOT, "lib", "escape");
    try {
      symlinkSync(TMP, link, process.platform === "win32" ? "junction" : "dir");
    } catch (e) {
      console.warn(`world: skipping the link case: ${(e as Error).message}`);
      ctx.skip();
      return;
    }
    try {
      expect(codes("../lib/escape/x.arch")).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
      expect(codes("../lib/escape/missing.arch")).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    } finally {
      try {
        unlinkSync(link);
      } catch {
        rmdirSync(link);
      }
    }
  });
});

describe("archlang3d refuses an import outside its roots with the code", () => {
  async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = "";
    let err = "";
    const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      out += String(s);
      return true;
    });
    const e = vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      err += String(s);
      return true;
    });
    try {
      return { code: await main(argv), out, err };
    } finally {
      o.mockRestore();
      e.mockRestore();
    }
  }

  it('`build --json` of a plan with `import "../../x.arch"` exits 2 naming E_IMPORT_OUTSIDE_ROOT, and reads nothing', async () => {
    const input = join(PLANS, "escape.arch");
    writeFileSync(input, plan("../../x.arch"));
    const r = await cli(["build", input, "--json", "-o", join(TMP, "out.glb")]);
    expect(r.code).toBe(2);
    const report = JSON.parse(r.out);
    expect(report.ok).toBe(false);
    expect(report.refusal.code).toBe("E3D_PLAN_ERRORS");
    expect(report.refusal.diagnostics.map((d: { code: string }) => d.code)).toEqual(["E_IMPORT_OUTSIDE_ROOT"]);
    expect(r.err).toContain("E_IMPORT_OUTSIDE_ROOT");
    expect(`${r.out}${r.err}`).not.toContain(SECRET);
  });
});
