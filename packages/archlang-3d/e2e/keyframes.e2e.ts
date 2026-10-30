/**
 * The replay's cross-run pixel baseline (card A4; Q21, plan §6.7 V-DET-04): key frames rendered by
 * the pinned Chromium on SwiftShader, their pixel hashes compared with a fixture. Only key frames
 * with NO text are pinned: those where the core's drawing (the one layer with text, whose glyphs
 * depend on the machine's fonts) is fully transparent, `stateAt(events, t).svg === 0`.
 *
 * The fixture names every environment (platform, CPU architecture, Chromium build) its hashes were
 * rendered in: pixels are compared only there; anywhere else the test prints what it rendered and
 * skips, except under CI, whose `check:3d` job is the pinned environment and fails (a different
 * Chromium is a different renderer; Q21 pins one). A mismatch names the frame. The fixture is written only by
 * `UPDATE_KEYFRAMES=1 npm run check:3d` in that environment, and a changed hash needs a reason in
 * the commit (never re-bless to green); how the current one was taken is in `fixtures/README.md`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, keyFrames, replayFacts, stateAt, storeysOf, timeline } from "../src/index.js";
import { renderReplay, replayHtml } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "../test/corpus.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "keyframe-baseline.json");

/** The plans and canvas pinned: one storey, and two storeys combined (its camera stops). */
const PLANS = ["laneway-house.arch", "two-storey.arch"] as const;
const SIZE = { width: 480, height: 270 };

interface Env {
  platform: string;
  arch: string;
  chromium: string;
}
interface Baseline {
  /** Every environment these hashes were rendered in, identically. */
  taken: Env[];
  size: [number, number];
  plans: Record<string, Record<string, string>>;
}

async function render(name: string) {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  const mesh = buildMesh(r.scene);
  const events = timeline(mesh);
  // With the metrics strip (card G4): it is DOM over the canvas, so the pinned hashes must not move.
  const facts = replayFacts(src, { world: WORLD, storeys: storeysOf(mesh) });
  const html = await replayHtml(mesh, {
    title: name,
    svg: compile(src, { world: WORLD }).svg,
    ...SIZE,
    ...(facts ? { facts } : {}),
  });
  const v = await renderReplay({ html, events, ...SIZE });
  // Text-free key frames only: the drawing (the only text) is invisible at these times.
  const textFree = new Set(
    keyFrames(events)
      .filter((k) => stateAt(events, k.t).svg === 0)
      .map((k) => k.label),
  );
  return {
    browser: v.browser,
    frames: Object.fromEntries(v.keyFrames.filter((k) => textFree.has(k.label)).map((k) => [k.label, k.sha256])),
    all: v.keyFrames.length,
  };
}

describe("key-frame pixel baseline (Q21)", () => {
  it("text-free key frames match the pinned environment's hashes", async (ctx) => {
    const rendered: Record<string, Record<string, string>> = {};
    let browser = "";
    for (const name of PLANS) {
      const r = await render(name);
      browser = r.browser;
      rendered[name] = r.frames;
      // Most key frames are text-free; "drawing" (the core's SVG at full opacity) never is.
      expect(Object.keys(r.frames), name).not.toContain("drawing");
      expect(Object.keys(r.frames).length, name).toBeGreaterThanOrEqual(r.all - 1);
    }
    const env: Env = { platform: process.platform, arch: process.arch, chromium: browser };
    if (process.env.UPDATE_KEYFRAMES === "1") {
      // Same hashes as pinned: this environment joins `taken`. Different: a new baseline, this environment alone.
      let prior: Baseline | undefined;
      try {
        prior = JSON.parse(readFileSync(FIXTURE, "utf8")) as Baseline;
      } catch {
        prior = undefined;
      }
      const same = prior !== undefined && JSON.stringify(prior.plans) === JSON.stringify(rendered);
      const others = same ? (prior?.taken ?? []).filter((e) => JSON.stringify(e) !== JSON.stringify(env)) : [];
      const b: Baseline = { taken: [...others, env], size: [SIZE.width, SIZE.height], plans: rendered };
      writeFileSync(FIXTURE, `${JSON.stringify(b, null, 2)}\n`);
      return;
    }
    const base = JSON.parse(readFileSync(FIXTURE, "utf8")) as Baseline;
    expect(base.size).toEqual([SIZE.width, SIZE.height]);
    const pinned = base.taken.some(
      (e) => e.platform === env.platform && e.arch === env.arch && e.chromium === env.chromium,
    );
    if (!pinned) {
      // Printed, so a run elsewhere still shows what it rendered.
      console.log(`key frames on ${JSON.stringify(env)}:\n${JSON.stringify(rendered, null, 2)}`);
      // CI's check:3d job IS the pinned environment: there, an unpinned one fails.
      if (process.env.CI)
        throw new Error(`no baseline was taken on ${JSON.stringify(env)}; pinned: ${JSON.stringify(base.taken)}`);
      ctx.skip();
    }
    const mismatched: string[] = [];
    for (const name of PLANS) {
      const want = base.plans[name] ?? {};
      const got = rendered[name] ?? {};
      for (const label of new Set([...Object.keys(want), ...Object.keys(got)])) {
        if (want[label] !== got[label]) {
          mismatched.push(
            `${name} frame "${label}": pinned ${want[label] ?? "(none)"}, rendered ${got[label] ?? "(none)"}`,
          );
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});
