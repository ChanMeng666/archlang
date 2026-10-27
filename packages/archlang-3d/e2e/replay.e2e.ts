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
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, keyFrames, timeline } from "../src/index.js";
import { renderReplay, replayHtml } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "../test/corpus.js";

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

  it("runs on every corpus plan the mesh stage builds (34)", async () => {
    const failed: string[] = [];
    for (const [name] of EXAMPLES_LIST) {
      const { html, events } = await replayOf(name, 320, 180);
      const v = await renderReplay({ html, events, width: 320, height: 180 });
      if (!v.seekRoundTrip || v.keyFrames.length < 4) failed.push(name);
    }
    expect(failed).toEqual([]);
  });

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
