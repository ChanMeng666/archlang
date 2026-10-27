/**
 * The replay as a video (card A3; plan §6.5, pulled forward from M3): headless Chromium through
 * Playwright on SwiftShader (software GL, no GPU), one `__seek(t)` and one screenshot per frame,
 * piped to ffmpeg as H.264. The MP4's bytes are not promised (encoders differ); the key frames are:
 * their pixel hashes, read from the page, are the video's regression handle (Q21).
 *
 * Node-only, and the only module that starts a browser or a process.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { keyFrames, type ReplayEvent } from "./timeline.js";

/** The flags that make Chromium render WebGL in software, the same on every machine (plan §6.5). */
export const SWIFTSHADER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

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
  /** `__seek(0.5)` twice gave one frame hash. */
  seekRoundTrip: boolean;
  /** Present when an MP4 was written. */
  mp4?: string;
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
      '<script>window.__replayAutoplay=false</script>\n<script type="application/json"',
    ),
  );
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
    for (const k of keyFrames(o.events)) keys.push({ ...k, sha256: await hashAt(k.t) });
    const a = await hashAt(0.5);
    await hashAt(0.1);
    const b = await hashAt(0.5);

    let mp4: string | undefined;
    if (o.mp4) {
      const canvas = page.locator("#archlang-replay");
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
      const done = new Promise<void>((resolve, reject) => {
        ff.on("error", reject);
        ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
      });
      for (let i = 0; i < frames; i++) {
        const t = frames === 1 ? 1 : i / (frames - 1);
        await page.evaluate((x) => window.__seek(x), t);
        const png = await canvas.screenshot({ type: "png" });
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      }
      ff.stdin.end();
      await done;
      mp4 = o.mp4;
    }
    return {
      frames,
      fps,
      seconds,
      width: o.width,
      height: o.height,
      keyFrames: keys,
      seekRoundTrip: a === b,
      ...(mp4 ? { mp4 } : {}),
    };
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
