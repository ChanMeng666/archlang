/**
 * The GLB and the CLI, heavy half (card A4; `npm run check:3d`), against archlang-3d plan §9.2's
 * M1 acceptance:
 *   1. every corpus plan passes S1–S4: V-SCH-01, V-GEO-02, V-GLTF-01 (Khronos glTF-Validator, 0
 *      errors / 0 warnings) and V-GLTF-02; the GLB's node set is the Mesh3D's and the viewer's;
 *   2. laneway-house's element counts per kind are the hand-built model's (6 walls, 3 floors,
 *      4 doors, 4 windows, 12 furniture; V-GEO-04 8/8 is `test/mesh.test.ts`'s opening probes);
 *   3. V-DET-01: three builds, one SHA-256, for every corpus plan;
 *   4. `build --json` answers plan §7.2's contract, and exit codes 0/1/2/3 hold, in-process and
 *      through a real process;
 *   5. a one-storey build (laneway-house) takes ≤ 2 s (measured, recorded in the PR).
 * And `--doors plan` (card A7): every corpus plan's swung model passes S1–S4 with glTF-Validator
 * 0/0, and `build`/`check --json` report the doors mode.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { afterAll, describe, expect, it, vi } from "vitest";
import { adaptPlan, ARCHLANG_3D_VERSION, buildMesh } from "../src/index.js";
import { checkGlb, checkScene, checkShells, readGlbNodes, replayPayload, writeGlb } from "../src/node.js";
import { main } from "../src/cli/run.js";
import { EXAMPLES_LIST, REPO, WORLD } from "../test/corpus.js";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const tmp = mkdtempSync(join(tmpdir(), "archlang3d-glb-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function glbOf(src: string, doors: "closed" | "plan" = "closed") {
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  const mesh = buildMesh(r.scene, { doors });
  return { scene: r.scene, mesh, glb: await writeGlb(mesh) };
}

async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    out += typeof s === "string" ? s : Buffer.from(s as Uint8Array).toString("latin1");
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

describe("GLB over the corpus (§9.2 criteria 1 and 3)", () => {
  it("every plan: S1–S4 pass, the node sets agree, and three builds give one SHA-256", async () => {
    const failed: string[] = [];
    let nodes = 0;
    for (const [name, src] of EXAMPLES_LIST) {
      const a = await glbOf(src);
      const checks = [checkScene(a.scene), checkShells(a.mesh), ...(await checkGlb(a.glb, a.mesh))];
      for (const c of checks.filter((x) => !x.ok)) failed.push(`${name} ${c.id}: ${c.failures.join("; ")}`);
      const v = checks.find((c) => c.id === "V-GLTF-01");
      if (v?.facts?.errors !== 0 || v?.facts?.warnings !== 0)
        failed.push(`${name}: validator ${JSON.stringify(v?.facts)}`);
      // The viewer's node set is the GLB's, less the nodes the GLB marks hidden.
      const glbNodes = (await readGlbNodes(a.glb)).nodes;
      const viewer = replayPayload(a.mesh, { title: name, svg: compile(src, { world: WORLD }).svg }).nodes.map(
        (n) => n.key,
      );
      const shown = glbNodes.filter((n) => n.extras.hidden !== true).map((n) => n.key);
      if ([...viewer].sort().join("\n") !== [...shown].sort().join("\n"))
        failed.push(`${name}: viewer and GLB node sets differ`);
      nodes += glbNodes.length;
      // V-DET-01: two more independent builds, from the source again.
      const again = [sha((await glbOf(src)).glb), sha((await glbOf(src)).glb)];
      if (again.some((h) => h !== sha(a.glb))) failed.push(`${name}: V-DET-01 ${sha(a.glb)} vs ${again.join(", ")}`);
    }
    expect(failed).toEqual([]);
    expect(EXAMPLES_LIST.length).toBe(35); // 35 since remodel.arch (B3b)
    expect(nodes).toBeGreaterThan(1000);
  });

  it("--doors plan: every plan's swung model passes S1–S4, glTF-Validator 0/0", async () => {
    const failed: string[] = [];
    for (const [name, src] of EXAMPLES_LIST) {
      const a = await glbOf(src, "plan");
      const checks = [checkScene(a.scene), checkShells(a.mesh), ...(await checkGlb(a.glb, a.mesh))];
      for (const c of checks.filter((x) => !x.ok)) failed.push(`${name} ${c.id}: ${c.failures.join("; ")}`);
      const v = checks.find((c) => c.id === "V-GLTF-01");
      if (v?.facts?.errors !== 0 || v?.facts?.warnings !== 0)
        failed.push(`${name}: validator ${JSON.stringify(v?.facts)}`);
    }
    expect(failed).toEqual([]);
  });
});

describe("archlang3d build / check (§9.2 criteria 2, 4 and 5)", () => {
  const lane = join(REPO, "examples", "laneway-house.arch");

  it("build --json answers §7.2: tool, input, outputs with sha256, scene counts, assumptions, verify", async () => {
    const out = join(tmp, "lane.glb");
    const r = await cli(["build", lane, "-o", out, "--json"]);
    expect(r.code, r.err).toBe(0);
    const rep = JSON.parse(r.out);
    expect(Object.keys(rep)).toEqual([
      "ok",
      "tool",
      "input",
      "doors",
      "outputs",
      "scene",
      "assumptions",
      "diagnostics",
      "verify",
    ]);
    expect(rep.tool).toMatchObject({ name: "archlang3d", version: ARCHLANG_3D_VERSION });
    expect(rep.tool.archlang).toMatch(/^\d+\.\d+\.\d+/);
    expect(rep.input).toEqual({ path: lane, levels: 1 });
    expect(rep.doors).toBe("closed");
    const bytes = readFileSync(out);
    expect(rep.outputs).toEqual([{ path: out, format: "glb", bytes: bytes.byteLength, sha256: sha(bytes) }]);
    // Criterion 2: the hand-built model's counts (plan §7.2's example, the spike's laneway).
    expect(rep.scene.levels[0].counts).toMatchObject({ wall: 6, floor: 3, door: 4, window: 4, furniture: 12 });
    expect(rep.scene.levels[0]).toMatchObject({ level: 1, elevation_mm: 0, storey_height_mm: 3000 });
    expect(rep.scene.bbox_mm.min).toHaveLength(3);
    expect(rep.assumptions.some((a: { rule: string }) => a.rule === "slab-default-200")).toBe(true);
    expect(rep.verify).toMatchObject({
      passed: 4,
      failed: 0,
      checks: ["V-SCH-01", "V-GEO-02", "V-GLTF-01", "V-GLTF-02"],
    });
    // L7: nothing the build wrote names the machine (the report echoes only the paths given).
    expect(JSON.stringify(rep.assumptions)).not.toMatch(/[A-Za-z]:[\\/]|\/home\/|\/Users\//);
  });

  it("criterion 5: a one-storey build (adapt, mesh, GLB) takes ≤ 2 s", async () => {
    const src = readFileSync(lane, "utf8");
    await glbOf(src); // warm
    const ms: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      await glbOf(src);
      ms.push(performance.now() - t);
    }
    const median = [...ms].sort((a, b) => a - b)[1] as number;
    console.log(`laneway-house build: median ${median.toFixed(0)} ms of ${ms.map((x) => x.toFixed(0)).join(", ")}`);
    expect(median).toBeLessThan(2000);
  });

  it("exit codes: 0 ok, 2 refused or a failed check, 1 IO, 3 usage", async () => {
    expect((await cli(["build", lane, "-o", join(tmp, "a.glb")])).code).toBe(0);
    expect((await cli(["build", lane, "-f", "scene3d", "-o", join(tmp, "a.scene3d.json")])).code).toBe(0);
    const bad = join(tmp, "bad.arch");
    writeFileSync(bad, "plan {\n");
    const refused = await cli(["build", bad, "-o", join(tmp, "bad.glb"), "--json"]);
    expect(refused.code).toBe(2);
    expect(JSON.parse(refused.out).refusal.code).toBe("E3D_PLAN_ERRORS");
    expect((await cli(["build", join(tmp, "missing.arch"), "-o", join(tmp, "m.glb")])).code).toBe(1);
    expect((await cli(["build", lane, "-o", join(tmp, "no-such-dir", "x.glb")])).code).toBe(1);
    expect((await cli(["build", lane, "--format", "ifc"])).code).toBe(3);
    // check: a good GLB passes; a GLB with a broken JSON chunk fails V-GLTF-01 (exit 2), not the tool.
    expect((await cli(["check", join(tmp, "a.glb")])).code).toBe(0);
    const broken = Buffer.from(readFileSync(join(tmp, "a.glb")));
    broken.write("!", 30, "latin1");
    writeFileSync(join(tmp, "broken.glb"), broken);
    const c = await cli(["check", join(tmp, "broken.glb"), "--json"]);
    expect(c.code).toBe(2);
    expect(JSON.parse(c.out).ok).toBe(false);
    const plan = await cli(["check", lane, "--json"]);
    expect(plan.code, plan.err).toBe(0);
    expect(JSON.parse(plan.out).verify.passed).toBe(4);
    expect((await cli(["check", bad])).code).toBe(2);
  });

  it("--doors plan: build and check report the mode, the GLB's door nodes carry it, and a bad value is usage", async () => {
    const out = join(tmp, "lane-plan.glb");
    const r = await cli(["build", lane, "-o", out, "--doors", "plan", "--json"]);
    expect(r.code, r.err).toBe(0);
    const rep = JSON.parse(r.out);
    expect(rep.doors).toBe("plan");
    expect(rep.verify).toMatchObject({ passed: 4, failed: 0 });
    expect(rep.assumptions.some((a: { rule: string }) => a.rule === "door-pose-plan")).toBe(true);
    const doors = (await readGlbNodes(readFileSync(out))).nodes.filter((n) => n.extras.kind === "door");
    expect(doors.length).toBe(4);
    // Two hinged doors swing; the sliding and the pocket door sweep no leaf and stay closed.
    expect(Object.fromEntries(doors.map((n) => [n.name, [n.extras.door_kind, n.extras.pose]]))).toEqual({
      "door:d_bath": ["pocket", "closed"],
      "door:d_bed": ["hinged", "plan"],
      "door:d_front": ["hinged", "plan"],
      "door:d_garden": ["sliding", "closed"],
    });
    // The default build is a different model (the doors are closed), so different bytes.
    expect(sha(readFileSync(out))).not.toBe(sha(readFileSync(join(tmp, "a.glb"))));
    const c = await cli(["check", lane, "--doors", "plan", "--json"]);
    expect(c.code, c.err).toBe(0);
    expect(JSON.parse(c.out)).toMatchObject({ ok: true, doors: "plan", verify: { passed: 4, failed: 0 } });
    expect((await cli(["build", lane, "-o", join(tmp, "x.glb"), "--doors", "open"])).code).toBe(3);
    // A GLB's pose was set when it was built: check applies none, so the flag is usage and the
    // report names no pose (red-team round 1).
    const g = await cli(["check", out, "--doors", "plan", "--json"]);
    expect(g.code).toBe(3);
    expect(g.err).toMatch(/posed when it was built/);
    const gc = await cli(["check", out, "--json"]);
    expect(gc.code, gc.err).toBe(0);
    expect(JSON.parse(gc.out)).not.toHaveProperty("doors");
  });

  it("--strict refuses a build with a warning: E3D_STRICT, exit 2, ok false, nothing written", async () => {
    const s11 = join(REPO, "docs/plans/archlang-3d/spike/stress/s11-mixed-thick-low.arch");
    const out = join(tmp, "s11.glb");
    const lax = await cli(["build", s11, "-o", out, "--json"]);
    expect(lax.code, lax.err).toBe(0);
    expect(JSON.parse(lax.out).diagnostics.map((d: { code: string }) => d.code)).toContain("W3D_MIXED_HEIGHT_JOINT");
    rmSync(out);
    const strict = await cli(["build", s11, "-o", out, "--strict", "--json"]);
    expect(strict.code).toBe(2);
    const rep = JSON.parse(strict.out);
    expect(rep).toMatchObject({ ok: false, code: "E3D_STRICT" });
    expect(rep.outputs).toBeUndefined();
    expect(existsSync(out)).toBe(false);
    // A clean plan builds under --strict.
    expect((await cli(["build", lane, "-o", join(tmp, "strict.glb"), "--strict"])).code).toBe(0);
  });

  it("through a real process: stdin to stdout gives the in-process bytes, and the exit codes hold", () => {
    const run = (args: string[], input?: Buffer) =>
      spawnSync(process.execPath, ["--import", "tsx", join(PKG, "src/cli/main.ts"), ...args], {
        cwd: PKG,
        input,
        maxBuffer: 64 * 1024 * 1024,
      });
    const lanewayGlb = readFileSync(join(tmp, "a.glb"));
    const piped = run(["build", "-", "-o", "-"], readFileSync(lane));
    expect(piped.status, piped.stderr.toString()).toBe(0);
    expect(sha(piped.stdout)).toBe(sha(lanewayGlb));
    expect(run(["build", "-", "-o", "-"], Buffer.from("plan {\n")).status).toBe(2);
    expect(run(["build", join(tmp, "missing.arch"), "-o", join(tmp, "x.glb")]).status).toBe(1);
    expect(run(["build"]).status).toBe(3);
  });

  it("doctor --json reports each part and what it is for; build and check's needs are met here", async () => {
    const r = await cli(["doctor", "--json"]);
    const rep = JSON.parse(r.out) as { ok: boolean; probes: Array<{ name: string; ok: boolean; required: boolean }> };
    expect(rep.probes.map((p) => p.name)).toEqual([
      "node",
      "@chanmeng666/archlang",
      "gltf-validator",
      "chromium",
      "ffmpeg",
    ]);
    expect(rep.probes.filter((p) => p.required).every((p) => p.ok)).toBe(true);
    expect(r.code).toBe(0);
    // check:3d renders the replay, so CI's job has Chromium; ffmpeg is required there too.
    if (process.env.CI) expect(rep.probes.every((p) => p.ok)).toBe(true);
  });
});
