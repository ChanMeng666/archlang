/**
 * The replay as a video (card A3; plan §6.5, pulled forward from M3): headless Chromium through
 * Playwright on SwiftShader (software GL, no GPU), one `__seek(t)` and one screenshot per frame,
 * piped to ffmpeg as H.264. The MP4's bytes are not promised (encoders differ); the key frames are:
 * their pixel hashes, read from the page, are the video's regression handle (Q21).
 *
 * Node-only, and the only module that starts a browser or a process.
 */
import type {} from "./viewer.js"; // the page's `window.__seek` and friends, for `page.evaluate`
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SWIFTSHADER_ARGS } from "./swiftshader.js";
import { keyFrames, type ReplayEvent } from "./timeline.js";

export { SWIFTSHADER_ARGS };

export interface KeyFrame {
  label: string;
  t: number;
  /** SHA-256 of the composed frame's RGBA pixels. */
  sha256: string;
}

export interface VideoReport {
  frames: number;
  fps: number;
  seconds: number;
  width: number;
  height: number;
  keyFrames: KeyFrame[];
  /** The metrics strip's text at each key frame (card G4); absent when the replay carries no facts. */
  strips?: Array<{ label: string; text: string }>;
  /** `__seek(0.5)` twice gave one frame hash. */
  seekRoundTrip: boolean;
  /** Present when an MP4 was written. */
  mp4?: string;
  /** The Chromium that rendered the frames (`browser.version()`): pixel baselines are per build (Q21). */
  browser: string;
}

export interface VideoOptions {
  html: string;
  events: readonly ReplayEvent[];
  width: number;
  height: number;
  fps?: number;
  seconds?: number;
  /** Where to write the MP4; omit to measure the key frames only. */
  mp4?: string;
  ffmpeg?: string;
}

/** Render key frames (and, given `mp4`, every frame) of a replay HTML in headless Chromium. */
export async function renderReplay(o: VideoOptions): Promise<VideoReport> {
  const fps = o.fps ?? 30;
  const seconds = o.seconds ?? 15;
  const frames = Math.round(fps * seconds);
  const dir = mkdtempSync(join(tmpdir(), "archlang3d-replay-"));
  const file = join(dir, "replay.html");
  // The page must not play on its own: every frame is chosen by __seek.
  writeFileSync(
    file,
    o.html.replace(
      '<script type="application/json"',
      // No scrollbar may shift the canvas between frames.
      '<style>html,body{overflow:hidden}</style><script>window.__replayAutoplay=false</script>\n<script type="application/json"',
    ),
  );
  // Loaded only here: playwright-core exits the process on import under Node < 20, and the light
  // tests (which run on CI's Node 18 leg) import this module's neighbours, never a browser.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
  try {
    const page = await browser.newPage({
      viewport: { width: o.width + 40, height: o.height + 120 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => window.__ready);
    const hashAt = async (t: number): Promise<string> =>
      page.evaluate(async (x) => {
        window.__seek(x);
        return window.__frameHash();
      }, t);
    const keys: KeyFrame[] = [];
    const strips: Array<{ label: string; text: string }> = [];
    const hasStrip = (await page.locator("#archlang-replay-strip").count()) > 0;
    for (const k of keyFrames(o.events)) {
      keys.push({ ...k, sha256: await hashAt(k.t) });
      if (hasStrip) {
        const text = await page.locator("#archlang-replay-strip").evaluate((el) => el.textContent ?? "");
        strips.push({ label: k.label, text });
      }
    }
    const a = await hashAt(0.5);
    await hashAt(0.1);
    const b = await hashAt(0.5);

    let mp4: string | undefined;
    if (o.mp4) {
      // The stage holds the canvas and, when the replay carries facts, the strip laid over it.
      const canvas = page.locator("#archlang-replay-stage");
      const ff = spawn(
        o.ffmpeg ?? "ffmpeg",
        [
          "-y",
          "-loglevel",
          "error",
          "-f",
          "image2pipe",
          "-framerate",
          String(fps),
          "-c:v",
          "png",
          "-i",
          "-",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-crf",
          "18",
          "-movflags",
          "+faststart",
          o.mp4,
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let err = "";
      ff.stderr.on("data", (d: Buffer) => {
        err += d.toString();
      });
      // One settled outcome for the process, observed from the start, so a failed spawn (no ffmpeg)
      // or an early exit can never become an unhandled rejection or a write that waits forever.
      let failure: Error | undefined;
      const done = new Promise<void>((resolve) => {
        ff.once("error", (e) => {
          failure ??= new Error(`ffmpeg could not start (${(e as NodeJS.ErrnoException).code ?? e.message})`);
          resolve();
        });
        ff.once("close", (code) => {
          if (code !== 0) failure ??= new Error(`ffmpeg exited ${code}: ${err.trim()}`);
          resolve();
        });
      });
      ff.stdin.on("error", (e) => {
        failure ??= e;
      });
      const started = await Promise.race([
        new Promise<boolean>((r) => ff.once("spawn", () => r(true))),
        done.then(() => false),
      ]);
      try {
        if (!started) throw failure ?? new Error("ffmpeg did not start");
        for (let i = 0; i < frames; i++) {
          if (failure) throw failure;
          const t = frames === 1 ? 1 : i / (frames - 1);
          await page.evaluate((x) => window.__seek(x), t);
          const png = await canvas.screenshot({ type: "png" });
          if (!ff.stdin.write(png)) await Promise.race([new Promise((r) => ff.stdin.once("drain", r)), done]);
        }
        ff.stdin.end();
        await done;
        if (failure) throw failure;
      } catch (e) {
        // Never leave a partial MP4 at the caller's path.
        ff.kill();
        await done;
        rmSync(o.mp4, { force: true });
        throw e;
      }
      mp4 = o.mp4;
    }
    return {
      frames,
      fps,
      seconds,
      width: o.width,
      height: o.height,
      keyFrames: keys,
      ...(hasStrip ? { strips } : {}),
      seekRoundTrip: a === b,
      ...(mp4 ? { mp4 } : {}),
      browser: browser.version(),
    };
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
