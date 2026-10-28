/**
 * `archlang3d` (card A4), light half: the manifest (plan §7.4) is the CLI. Every listed command
 * dispatches, every listed flag parses and no other does, `view`'s hand parser names every flag the
 * manifest lists for it, examples start with `archlang3d <verb>`, and usage errors exit 3. Commands
 * that build, validate or launch a browser are exercised in `e2e/glb.e2e.ts` (`npm run check:3d`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseFlags } from "../src/cli/commands.js";
import { buildManifest, COMMANDS } from "../src/cli/manifest.js";
import { main, VIEW_USAGE } from "../src/cli/run.js";

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

describe("archlang3d manifest", () => {
  it("has the core manifest's shape plus a d3 block", async () => {
    const r = await cli(["manifest", "--json"]);
    expect(r.code).toBe(0);
    const m = JSON.parse(r.out);
    expect(m).toEqual(JSON.parse(JSON.stringify(buildManifest())));
    expect(Object.keys(m)).toEqual([
      "name",
      "invoke",
      "version",
      "description",
      "exitCodes",
      "globalFlags",
      "commands",
      "d3",
    ]);
    expect(Object.keys(m.exitCodes)).toEqual(["0", "1", "2", "3"]);
    expect(m.commands.map((c: { name: string }) => c.name)).toEqual([
      "build",
      "check",
      "view",
      "manifest",
      "schema",
      "doctor",
    ]);
  });

  it("every example starts with `archlang3d <its command>`", () => {
    for (const c of COMMANDS) {
      expect(c.examples.length, c.name).toBeGreaterThan(0);
      for (const ex of c.examples)
        expect(ex.cmd.startsWith(`archlang3d ${c.name} `) || ex.cmd === `archlang3d ${c.name}`).toBe(true);
    }
  });

  it("every listed flag parses for its command, and an unlisted one is a usage error", () => {
    for (const c of COMMANDS.filter((x) => x.name !== "view")) {
      for (const f of c.flags) {
        for (const spelling of [f.flag, ...(f.alias ? [f.alias] : [])]) {
          const p = parseFlags(c.name, [spelling, ...(f.arg ? ["v"] : [])]);
          expect(p.flags.get(f.flag), `${c.name} ${spelling}`).toBe(f.arg ? "v" : true);
        }
      }
      expect(() => parseFlags(c.name, ["--no-such-flag"])).toThrow(/unknown flag/);
    }
  });

  it("view's hand parser covers exactly the flags the manifest lists for it", () => {
    const view = COMMANDS.find((c) => c.name === "view");
    const listed = (view?.flags ?? []).map((f) => f.alias ?? f.flag).sort();
    const usage = [...VIEW_USAGE.matchAll(/(?<![\w-])(--?[a-z][\w-]*)/g)].map((m) => m[1] as string);
    expect([...new Set(usage)].sort()).toEqual(listed);
  });

  it("bad usage exits 3: no command, an unknown one, a missing value, a second input", async () => {
    for (const argv of [
      [],
      ["nope"],
      ["build"],
      ["build", "a.arch", "b.arch"],
      ["build", "a.arch", "-o"],
      ["schema", "ifc"],
    ]) {
      const r = await cli(argv);
      expect(r.code, argv.join(" ")).toBe(3);
      expect(r.err).toMatch(/usage: archlang3d/);
    }
    const r = await cli(["build", "a.arch", "-o", "-", "--json"]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/both write stdout/);
  });

  it("schema prints Scene3D's JSON Schema", async () => {
    const r = await cli(["schema", "scene3d"]);
    expect(r.code).toBe(0);
    const file = readFileSync(new URL("../src/scene3d/scene3d.schema.json", import.meta.url), "utf8");
    expect(JSON.parse(r.out)).toEqual(JSON.parse(file));
  });
});
