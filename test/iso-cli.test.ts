/**
 * **`--view iso|axon` on the CLI** — where it works, where it REFUSES, and what it changes
 * about the shape of a render.
 *
 * Two refusals are the substance of this file, because a flag that quietly does nothing is
 * how a user comes to believe they are looking at a drawing they are not:
 *
 *  - an unrecognised value exits **3** with a did-you-mean, exactly as an unknown verb
 *    does — never a silent fall back to the plan;
 *  - `--view … -f txt` exits **3**, because the ASCII backend draws a PLAN (it identifies
 *    a room as a polygon on the `floor` pass) and would print a meaningless grid from a
 *    projection. `preview --ascii` is the same backend and refuses on the same grounds.
 *
 * And one shape change worth pinning: a multi-storey plan under `--view` writes the ONE
 * file `-o` names, not `<stem>.L<n>` per storey. That is the whole-building rule in the
 * place a user meets it.
 *
 * The DXF case closes the layer loop. `V-3D-*` sits outside the `A-`/`L-`/`C-` NCS
 * discipline namespace on purpose, and the export declares those rows only on a drawing
 * that uses them — so this asserts both halves: every layer an iso DXF references is
 * declared, and a plan DXF declares none of them.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { VIEW_LAYER_NAMES } from "../src/view/paint.js";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const scratch = (): string => mkdtempSync(join(tmpdir(), "archlang-view-"));

suite("arch compile --view", () => {
  it("renders an SVG and reports it like any other compile", () => {
    const dir = scratch();
    const out = join(dir, "studio.svg");
    const r = run(["compile", "examples/studio.arch", "--view", "iso", "-o", out, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(existsSync(out)).toBe(true);
    const svg = readFileSync(out, "utf8");
    expect(svg).toContain("V-3D");
    // Chrome a projection must not carry.
    expect(svg).not.toContain('inkscape:label="A-WALL"');
  });

  it("both presets work and DIFFER", () => {
    const dir = scratch();
    const a = join(dir, "a.svg");
    const b = join(dir, "b.svg");
    expect(run(["compile", "examples/studio.arch", "--view", "iso", "-o", a]).status).toBe(0);
    expect(run(["compile", "examples/studio.arch", "--view", "axon", "-o", b]).status).toBe(0);
    expect(readFileSync(b, "utf8")).not.toBe(readFileSync(a, "utf8"));
  });

  it("a multi-storey plan writes the ONE file -o names — the view is the whole building", () => {
    const dir = scratch();
    const plan = join(dir, "house.arch");
    writeFileSync(plan, readFileSync("examples/two-storey.arch", "utf8"), "utf8");
    const out = join(dir, "house-iso.svg");
    const r = run(["compile", plan, "--view", "iso", "-o", out, "--json"]);
    expect(r.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    // No per-level fan-out: nothing called `house-iso.L1.svg` was written.
    expect(readdirSync(dir).filter((f) => f.includes(".L"))).toEqual([]);
    const j = JSON.parse(r.stdout);
    expect(j.outputs).toBeUndefined();
  });

  it("an unknown value exits 3 with a did-you-mean", () => {
    const r = run(["compile", "examples/studio.arch", "--view", "bogus"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('unknown view "bogus"');
    expect(r.stderr).toContain("iso, axon");
  });

  it("a NEAR-miss gets the suggestion, which is what makes the hint worth having", () => {
    const r = run(["compile", "examples/studio.arch", "--view", "izo"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('did you mean "iso"');
  });

  it("`--view … -f txt` exits 3 — the ASCII backend draws a plan, not a projection", () => {
    const r = run(["compile", "examples/studio.arch", "--view", "iso", "-f", "txt"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("--view cannot be combined with -f txt");
  });

  it("`watch` does not take it at all — a watcher re-renders the plan you are editing", () => {
    const r = run(["watch", "examples/studio.arch", "--view", "iso"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("--view");
  });
});

suite("arch preview --view", () => {
  it("declares the flag and refuses --ascii for the same reason -f txt is refused", () => {
    const r = run(["preview", "examples/studio.arch", "--view", "iso", "--ascii"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("--view cannot be combined with -f txt");
  });

  it("an unknown value exits 3 there too", () => {
    const r = run(["preview", "examples/studio.arch", "--view", "nope"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('unknown view "nope"');
  });

  it("`--help` lists the flag with its two values", () => {
    const r = run(["compile", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--view <iso|axon>");
  });
});

suite("arch compile --view -f dxf — the V- layers", () => {
  // DXF is a strict alternating group-code / value stream, so it must be read as PAIRS.
  // A line-by-line scan for a lone `8` also finds every VALUE that happens to be "8" —
  // which is not hypothetical, it is what the first draft of this test did, and it
  // reported a colour number as an undeclared layer.
  const dxfPairs = (dxf: string): [number, string][] => {
    const lines = dxf.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const out: [number, string][] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) out.push([Number(lines[i]), lines[i + 1]!]);
    return out;
  };
  /** Layer names the TABLES→LAYER table declares. */
  const declared = (dxf: string): Set<string> => {
    const p = dxfPairs(dxf);
    const out = new Set<string>();
    for (let i = 0; i + 1 < p.length; i++) {
      if (p[i]![0] === 0 && p[i]![1] === "LAYER" && p[i + 1]![0] === 2) out.add(p[i + 1]![1]);
    }
    return out;
  };
  /** Layer names entities actually reference (group code 8, inside ENTITIES). */
  const referenced = (dxf: string): Set<string> => {
    const p = dxfPairs(dxf);
    const start = p.findIndex(([c, v]) => c === 2 && v === "ENTITIES");
    const out = new Set<string>();
    for (let i = start; i < p.length; i++) if (p[i]![0] === 8) out.add(p[i]![1]);
    return out;
  };

  const dir = scratch();
  const isoPath = join(dir, "studio-iso.dxf");
  const planPath = join(dir, "studio-plan.dxf");
  const isoRun = run(["compile", "examples/studio.arch", "--view", "iso", "-f", "dxf", "-o", isoPath]);
  const planRun = run(["compile", "examples/studio.arch", "-f", "dxf", "-o", planPath]);

  it("both renders succeed", () => {
    expect(isoRun.status).toBe(0);
    expect(planRun.status).toBe(0);
  });

  it("every layer the iso view emits is DECLARED in the LAYER table", () => {
    const dxf = readFileSync(isoPath, "utf8");
    const undeclaredRefs = [...referenced(dxf)].filter((l) => !declared(dxf).has(l));
    expect(undeclaredRefs).toEqual([]);
  });

  it("and the view's own three are among them", () => {
    const dxf = readFileSync(isoPath, "utf8");
    const used = referenced(dxf);
    expect(VIEW_LAYER_NAMES.filter((n) => !used.has(n))).toEqual([]);
    expect(VIEW_LAYER_NAMES.filter((n) => !declared(dxf).has(n))).toEqual([]);
  });

  it("a PLAN dxf declares none of them — no dead layer, and its bytes are unchanged", () => {
    const dxf = readFileSync(planPath, "utf8");
    const d = declared(dxf);
    expect(VIEW_LAYER_NAMES.filter((n) => d.has(n))).toEqual([]);
  });

  it("the V- names sit outside the NCS discipline namespace on purpose", () => {
    // `A-`/`L-`/`C-` are disciplines a CAD user freezes. A view is not a discipline's
    // drawing, so it must not ride one of their switches. The minor group is four
    // characters, the NCS shape the plan layers already use — `V-3D-FLOR` mirrors
    // `A-FLOR` rather than inventing a second spelling of the same word. The minor group is four
    // characters, the same NCS shape the plan layers use — `V-3D-FLOR` mirrors `A-FLOR`
    // rather than inventing a second spelling of the same word.
    for (const n of VIEW_LAYER_NAMES) {
      expect(n).toMatch(/^V-3D-[A-Z]{4}$/);
      expect(n).not.toMatch(/^[ACL]-/);
    }
  });
});
