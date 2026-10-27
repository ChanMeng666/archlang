#!/usr/bin/env node
/**
 * `archlang3d` (card A3; archlang-3d plan §7). One command so far:
 *
 *   archlang3d view <plan.arch|-> --replay -o plan.html [--video out.mp4] [--seconds 15] [--fps 30]
 *                   [--size 1920x1080] [--theme light|dark] [--curve-tol <mm>] [--json]
 *
 * Exit codes as the core's (ADR 0015, plan §7.3): 0 ok · 2 the plan is refused (`E3D_*`, with the
 * core's diagnostics) · 1 IO or environment (no Chromium, no ffmpeg) · 3 bad usage. With `--json`
 * the result goes to stdout and messages to stderr.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "@chanmeng666/archlang";
import { adaptPlan } from "../adapter/adapt.js";
import { buildMesh } from "../mesh/build.js";
import { makeNodeWorld } from "../node.js";
import { replayHtml } from "../replay/html.js";
import { timeline } from "../replay/timeline.js";
import { renderReplay, type VideoReport } from "../replay/video.js";

const USAGE =
  "usage: archlang3d view <plan.arch|-> --replay -o <out.html> [--video <out.mp4>] [--seconds <n>] [--fps <n>] [--size <W>x<H>] [--theme light|dark] [--curve-tol <mm>] [--json]";

interface Args {
  input: string;
  out: string;
  video?: string;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  theme: "light" | "dark";
  curveTol?: number;
  json: boolean;
}

class Usage extends Error {}

function parse(argv: string[]): Args {
  const [cmd, ...rest] = argv;
  if (cmd !== "view") throw new Usage(cmd ? `unknown command "${cmd}"` : "no command");
  const a: Partial<Args> & { replay?: boolean } = {
    seconds: 15,
    fps: 30,
    width: 1920,
    height: 1080,
    theme: "light",
    json: false,
  };
  const num = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Usage(`${flag} takes a positive number`);
    return n;
  };
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i] as string;
    const v = (): string | undefined => rest[++i];
    if (f === "--replay") a.replay = true;
    else if (f === "-o") a.out = v();
    else if (f === "--video") a.video = v();
    else if (f === "--seconds") a.seconds = num(f, v());
    else if (f === "--fps") a.fps = num(f, v());
    else if (f === "--curve-tol") a.curveTol = num(f, v());
    else if (f === "--json") a.json = true;
    else if (f === "--theme") {
      const t = v();
      if (t !== "light" && t !== "dark") throw new Usage("--theme takes light or dark");
      a.theme = t;
    } else if (f === "--size") {
      const m = /^(\d+)x(\d+)$/.exec(v() ?? "");
      if (!m) throw new Usage("--size takes <W>x<H>, e.g. 1920x1080");
      a.width = Number(m[1]);
      a.height = Number(m[2]);
    } else if (f.startsWith("-") && f !== "-") throw new Usage(`unknown flag "${f}"`);
    else if (a.input === undefined) a.input = f;
    else throw new Usage(`unexpected argument "${f}"`);
  }
  if (!a.replay) throw new Usage("view needs --replay (the only view so far)");
  if (!a.input) throw new Usage("no plan given");
  if (!a.out) throw new Usage("-o <out.html> is required");
  return a as Args;
}

async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parse(argv);
  } catch (e) {
    if (e instanceof Usage) {
      process.stderr.write(`archlang3d: ${e.message}\n${USAGE}\n`);
      return 3;
    }
    throw e;
  }
  const say = (s: string) => process.stderr.write(`${s}\n`);
  let source: string;
  try {
    source = readFileSync(args.input === "-" ? 0 : args.input, "utf8");
  } catch (e) {
    say(`archlang3d: cannot read ${args.input}: ${(e as Error).message}`);
    return 1;
  }
  const world = makeNodeWorld(args.input === "-" ? process.cwd() : dirname(resolve(args.input)));
  const r = adaptPlan(source, { world, ...(args.curveTol !== undefined ? { curveTolMm: args.curveTol } : {}) });
  if (!r.ok) {
    if (args.json) process.stdout.write(`${JSON.stringify({ ok: false, refusal: r.refusal }, null, 2)}\n`);
    say(`archlang3d: ${r.refusal.code}: ${r.refusal.message}`);
    return 2;
  }
  const mesh = buildMesh(r.scene);
  const svg = compile(source, { world }).svg;
  const html = await replayHtml(mesh, {
    title: r.scene.meta.name,
    svg,
    width: args.width,
    height: args.height,
    seconds: args.seconds,
    theme: args.theme,
  });
  try {
    writeFileSync(args.out, html);
  } catch (e) {
    say(`archlang3d: cannot write ${args.out}: ${(e as Error).message}`);
    return 1;
  }
  let video: VideoReport;
  try {
    video = await renderReplay({
      html,
      events: timeline(mesh),
      width: args.width,
      height: args.height,
      fps: args.fps,
      seconds: args.seconds,
      ...(args.video ? { mp4: args.video } : {}),
    });
  } catch (e) {
    say(`archlang3d: rendering failed (Chromium through Playwright, ffmpeg): ${(e as Error).message}`);
    return 1;
  }
  const report = {
    ok: true,
    html: args.out,
    ...(video.mp4 ? { mp4: video.mp4 } : {}),
    frames: video.frames,
    fps: video.fps,
    seconds: video.seconds,
    size: [video.width, video.height],
    keyFrames: video.keyFrames,
    seekRoundTrip: video.seekRoundTrip,
    warnings: r.warnings.map((w) => ({ code: w.code, level: w.level, message: w.message })),
    assumptions: mesh.assumptions.length,
  };
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else say(`archlang3d: wrote ${args.out}${video.mp4 ? ` and ${video.mp4} (${video.frames} frames)` : ""}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`archlang3d: internal error: ${(e as Error).stack ?? String(e)}\n`);
    process.exitCode = 1;
  },
);
