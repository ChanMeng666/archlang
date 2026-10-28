/**
 * `archlang3d` (card A3; archlang-3d plan §7). One command so far:
 *
 *   archlang3d view <plan.arch|-> --replay -o plan.html [--video out.mp4] [--seconds 15] [--fps 30]
 *                   [--size 1920x1080] [--theme light|dark] [--storey <n>|all] [--curve-tol <mm>] [--json]
 *
 * `--storey all` (the default) replays the storeys combined; `--storey <n>` (1-based, lowest first)
 * replays storey n on its own over its own page of the core's drawing. With `--json` the report
 * carries the key frames of EVERY view (`views`), the rendered one's also at the top level.
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
import { type ReplayView, storeysOf, timeline, viewLabel, viewMesh } from "../replay/timeline.js";
import { type KeyFrame, renderReplay, type VideoReport } from "../replay/video.js";

const USAGE =
  "usage: archlang3d view <plan.arch|-> --replay -o <out.html> [--video <out.mp4>] [--seconds <n>] [--fps <n>] [--size <W>x<H>] [--theme light|dark] [--storey <n>|all] [--curve-tol <mm>] [--json]";

interface Args {
  input: string;
  out: string;
  video?: string;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  theme: "light" | "dark";
  storey: ReplayView;
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
    storey: "all",
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
    else if (f === "--storey") {
      const t = v();
      if (t === "all") a.storey = "all";
      else if (t !== undefined && /^[1-9]\d*$/.test(t)) a.storey = Number(t);
      else throw new Usage("--storey takes a storey number (1 = the lowest) or all");
    } else if (f === "--theme") {
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

/** The command, without exiting: resolves to its exit code (`main.ts` runs it). */
export async function main(argv: string[]): Promise<number> {
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
  const storeys = storeysOf(mesh);
  if (args.storey !== "all" && args.storey > storeys.length) {
    process.stderr.write(
      `archlang3d: --storey ${args.storey}: the plan has ${storeys.length} ${storeys.length === 1 ? "storey" : "storeys"}\n${USAGE}\n`,
    );
    return 3;
  }
  const compiled = compile(source, { world });
  // A storey's own page of the core's drawing, matched by level; the combined view draws page 1.
  const svgOf = (view: ReplayView): string =>
    view === "all" ? compiled.svg : (compiled.pages?.find((pg) => pg.level === storeys[view - 1])?.svg ?? compiled.svg);
  const htmlOf = (view: ReplayView): Promise<string> =>
    replayHtml(viewMesh(mesh, view), {
      title: r.scene.meta.name,
      svg: svgOf(view),
      width: args.width,
      height: args.height,
      seconds: args.seconds,
      theme: args.theme,
    });
  const html = await htmlOf(args.storey);
  try {
    writeFileSync(args.out, html);
  } catch (e) {
    say(`archlang3d: cannot write ${args.out}: ${(e as Error).message}`);
    return 1;
  }
  const allViews: ReplayView[] = ["all", ...storeys.map((_, i) => i + 1)];
  let video: VideoReport;
  const views: Array<{ view: string; keyFrames: KeyFrame[] }> = [];
  try {
    video = await renderReplay({
      html,
      events: timeline(viewMesh(mesh, args.storey)),
      width: args.width,
      height: args.height,
      fps: args.fps,
      seconds: args.seconds,
      ...(args.video ? { mp4: args.video } : {}),
    });
    // Every view's key frames; a view whose HTML is the rendered one's (a one-storey plan's
    // combined view and storey 1) shares its hashes.
    const byHtml = new Map<string, KeyFrame[]>([[html, video.keyFrames]]);
    for (const view of allViews) {
      const h = view === args.storey ? html : await htmlOf(view);
      let keys = byHtml.get(h);
      if (!keys) {
        keys = (
          await renderReplay({
            html: h,
            events: timeline(viewMesh(mesh, view)),
            width: args.width,
            height: args.height,
            fps: args.fps,
            seconds: args.seconds,
          })
        ).keyFrames;
        byHtml.set(h, keys);
      }
      views.push({ view: viewLabel(view), keyFrames: keys });
    }
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
    view: viewLabel(args.storey),
    storeys: storeys.length,
    keyFrames: video.keyFrames,
    views,
    seekRoundTrip: video.seekRoundTrip,
    warnings: r.warnings.map((w) => ({ code: w.code, level: w.level, message: w.message })),
    assumptions: mesh.assumptions.length,
  };
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else say(`archlang3d: wrote ${args.out}${video.mp4 ? ` and ${video.mp4} (${video.frames} frames)` : ""}`);
  return 0;
}
