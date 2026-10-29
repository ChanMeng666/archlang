/**
 * The replay, heavy half (card A3; `npm run check:3d`): a real browser (Playwright's Chromium on
 * SwiftShader), real key-frame pixels, a real MP4. Pixels are compared within one run of one pinned
 * environment (Q21): the same plan rendered in two separate browsers gives the same key-frame hashes,
 * and `__seek` round-trips. The MP4's bytes are never compared.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it, vi } from "vitest";
import { adaptPlan, buildMesh, keyFrames, replayFacts, timeline } from "../src/index.js";
import { renderReplay, replayHtml } from "../src/node.js";
import { main } from "../src/cli/run.js";
import { EXAMPLES_LIST, REPO, WORLD } from "../test/corpus.js";

async function replayOf(name: string, width: number, height: number) {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  const mesh = buildMesh(r.scene);
  const html = await replayHtml(mesh, { title: name, svg: compile(src, { world: WORLD }).svg, width, height });
  return { html, events: timeline(mesh) };
}

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("replay in a browser", () => {
  it("laneway-house: two browsers, one set of key-frame hashes; __seek round-trips", async () => {
    const { html, events } = await replayOf("laneway-house.arch", 640, 360);
    const a = await renderReplay({ html, events, width: 640, height: 360 });
    const b = await renderReplay({ html, events, width: 640, height: 360 });
    expect(a.seekRoundTrip).toBe(true);
    expect(a.keyFrames.map((k) => k.label)).toEqual(keyFrames(events).map((k) => k.label));
    expect(b.keyFrames).toEqual(a.keyFrames);
    // The frames differ from each other: the replay moves.
    expect(new Set(a.keyFrames.map((k) => k.sha256)).size).toBe(a.keyFrames.length);
  });

  it("the metrics strip is DOM over the canvas: key-frame hashes are the same with and without it (card G4)", async () => {
    const name = "laneway-house.arch";
    const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
    const r = adaptPlan(src, { world: WORLD });
    if (!r.ok) throw new Error(r.refusal.code);
    const mesh = buildMesh(r.scene);
    const svg = compile(src, { world: WORLD }).svg;
    const facts = replayFacts(src, { world: WORLD });
    expect(facts).toBeDefined();
    const size = { width: 640, height: 360 };
    const events = timeline(mesh);
    const bare = await renderReplay({ html: await replayHtml(mesh, { title: name, svg, ...size }), events, ...size });
    const strip = await renderReplay({
      html: await replayHtml(mesh, { title: name, svg, ...size, ...(facts ? { facts } : {}) }),
      events,
      ...size,
    });
    expect(strip.keyFrames).toEqual(bare.keyFrames);
    expect(bare.strips).toBeUndefined();
    const text = new Map((strip.strips ?? []).map((s) => [s.label, s.text] as const));
    expect(text.get("stage:brief")).toBe("");
    expect(text.get("stage:rooms")).toMatch(/3 rooms.*\(net\).*\(to wall centre lines\)/);
    expect(text.get("stage:rooms")).not.toMatch(/door/);
    expect(text.get("stage:openings")).toMatch(/4 doors.*4 windows/);
    expect(text.get("end")).toMatch(/no warnings$/);
  }, 120_000);

  it("runs on every corpus plan the mesh stage builds (35)", async () => {
    const failed: string[] = [];
    for (const [name] of EXAMPLES_LIST) {
      const { html, events } = await replayOf(name, 320, 180);
      const v = await renderReplay({ html, events, width: 320, height: 180 });
      if (!v.seekRoundTrip || v.keyFrames.length < 4) failed.push(name);
    }
    expect(failed).toEqual([]);
    // One browser per plan, 35 plans: about 50 s idle, past the 120 s default on a loaded machine.
  }, 600_000);

  it("refuses cleanly without a runnable ffmpeg: no hang, no partial MP4 (PR #330 review round 1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-e2e-"));
    try {
      const { html, events } = await replayOf("one-room.arch", 160, 90);
      const mp4 = join(dir, "never.mp4");
      await expect(
        renderReplay({
          html,
          events,
          width: 160,
          height: 90,
          fps: 5,
          seconds: 1,
          mp4,
          ffmpeg: "no-such-ffmpeg-archlang3d",
        }),
      ).rejects.toThrow(/ffmpeg could not start/);
      expect(existsSync(mp4)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes an MP4 through ffmpeg (bytes never pinned)", async (ctx) => {
    if (!hasFfmpeg) {
      if (process.env.CI) throw new Error("ffmpeg is required under CI");
      ctx.skip();
    }
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-e2e-"));
    try {
      const { html, events } = await replayOf("laneway-house.arch", 320, 180);
      const mp4 = join(dir, "laneway.mp4");
      const v = await renderReplay({ html, events, width: 320, height: 180, fps: 10, seconds: 2, mp4 });
      expect(v.frames).toBe(20);
      expect(statSync(mp4).size).toBeGreaterThan(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Runs the CLI in-process; its stdout and stderr are captured. */
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

describe("archlang3d view --storey (look notes round 1)", () => {
  const plan = (n: string) => join(REPO, "examples", n);

  it("a bad --storey exits 3; a storey past the plan's names how many it has", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-e2e-"));
    try {
      const html = join(dir, "x.html");
      for (const bad of ["0", "x", "-1", "1.5"]) {
        const r = await cli(["view", plan("two-storey.arch"), "--replay", "-o", html, "--storey", bad]);
        expect(r.code, bad).toBe(3);
      }
      const r = await cli(["view", plan("two-storey.arch"), "--replay", "-o", html, "--storey", "3"]);
      expect(r.code).toBe(3);
      expect(r.err).toMatch(/the plan has 2 storeys/);
      expect(existsSync(html)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--json hashes the key frames of every view; a one-storey plan's two views are one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-e2e-"));
    try {
      const html = join(dir, "x.html");
      const two = await cli([
        "view",
        plan("two-storey.arch"),
        "--replay",
        "-o",
        html,
        "--size",
        "160x90",
        "--storey",
        "2",
        "--json",
      ]);
      expect(two.code, two.err).toBe(0);
      const rep = JSON.parse(two.out) as {
        view: string;
        storeys: number;
        keyFrames: Array<{ sha256: string }>;
        views: Array<{ view: string; keyFrames: Array<{ label: string; sha256: string }> }>;
      };
      expect(rep.view).toBe("storey:2");
      expect(rep.storeys).toBe(2);
      expect(rep.views.map((v) => v.view)).toEqual(["all", "storey:1", "storey:2"]);
      expect(rep.views[2]?.keyFrames).toEqual(rep.keyFrames);
      const ends = rep.views.map((v) => v.keyFrames.find((k) => k.label === "end")?.sha256);
      expect(new Set(ends).size).toBe(3);

      const one = await cli(["view", plan("one-room.arch"), "--replay", "-o", html, "--size", "160x90", "--json"]);
      expect(one.code, one.err).toBe(0);
      const r1 = JSON.parse(one.out) as { doors: string; views: Array<{ view: string; keyFrames: unknown[] }> };
      expect(r1.doors).toBe("closed");
      expect(r1.views.map((v) => v.view)).toEqual(["all", "storey:1"]);
      expect(r1.views[1]?.keyFrames).toEqual(r1.views[0]?.keyFrames);

      // --doors plan (card A7): reported; the timing is the closed replay's (same key-frame times
      // and labels), only the end frame's pixels differ, the doors standing open.
      const args = ["view", plan("laneway-house.arch"), "--replay", "-o", html, "--size", "160x90", "--json"];
      const closed = JSON.parse((await cli(args)).out) as {
        doors: string;
        keyFrames: Array<{ label: string; t: number; sha256: string }>;
      };
      const swung = await cli([...args, "--doors", "plan"]);
      expect(swung.code, swung.err).toBe(0);
      const rp = JSON.parse(swung.out) as typeof closed;
      expect([closed.doors, rp.doors]).toEqual(["closed", "plan"]);
      expect(rp.keyFrames.map((k) => [k.label, k.t])).toEqual(closed.keyFrames.map((k) => [k.label, k.t]));
      const end = (r: typeof closed) => r.keyFrames.find((k) => k.label === "end")?.sha256;
      expect(end(rp)).not.toBe(end(closed));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
