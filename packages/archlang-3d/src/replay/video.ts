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
  /** libx264's constant rate factor for the MP4 (default 18; 0 is lossless: a master to re-encode). */
  crf?: number;
  /** {@link withSupersample}: 1 (off) unless given; the key-frame baseline is taken without it. */
  supersample?: number;
}

/** The page the browser opens: the replay with its own playback off, so every frame is chosen by `__seek`. */
function seekOnly(html: string): string {
  return html.replace(
    '<script type="application/json"',
    // No scrollbar may shift the canvas between frames.
    '<style>html,body{overflow:hidden}</style><script>window.__replayAutoplay=false</script>\n<script type="application/json"',
  );
}

const PAYLOAD_OPEN = '<script type="application/json" id="archlang-replay-payload">';

/**
 * Supersampling (product-roadmap card RM8.2), for the generated posters and videos only: the replay
 * page with `supersample: k` in its payload, so every frame is the rounded mean of k × k renders
 * shifted by fractions of a pixel (`mountReplay`): the samples of a render at k times the size,
 * box-filtered back, in integers, so in one environment the same frame gives the same bytes (the
 * key-frame baseline is kept per environment, `e2e/fixtures/README.md`). `k` is a whole number
 * from 1 to 4; 1 returns the page as it is, and the live 3D preview never sees the field.
 */
export function withSupersample(html: string, k = 1): string {
  if (!Number.isInteger(k) || k < 1 || k > 4)
    throw new Error(`supersample must be a whole number from 1 to 4 (got ${k})`);
  if (k === 1) return html;
  const at = html.indexOf(PAYLOAD_OPEN);
  const end = at < 0 ? -1 : html.indexOf("</script>", at);
  if (end < 0) throw new Error("the replay page carries no payload to supersample");
  const p = JSON.parse(html.slice(at + PAYLOAD_OPEN.length, end)) as Record<string, unknown>;
  // Escaped as `html.ts` escapes it: `</` never appears inside the inline JSON.
  const json = JSON.stringify({ ...p, supersample: k }).replace(/</g, "\\u003c");
  return html.slice(0, at + PAYLOAD_OPEN.length) + json + html.slice(end);
}

/** Render key frames (and, given `mp4`, every frame) of a replay HTML in headless Chromium. */
export async function renderReplay(o: VideoOptions): Promise<VideoReport> {
  const fps = o.fps ?? 30;
  const seconds = o.seconds ?? 15;
  const frames = Math.round(fps * seconds);
  const dir = mkdtempSync(join(tmpdir(), "archlang3d-replay-"));
  const file = join(dir, "replay.html");
  writeFileSync(file, seekOnly(withSupersample(o.html, o.supersample)));
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
          String(o.crf ?? 18),
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

export interface StillOptions {
  html: string;
  width: number;
  height: number;
  /** The replay time drawn (default 1, the settled end frame). */
  t?: number;
  /** Also encode a WebP: the first of `qualities` (0–1, tried in order) whose bytes fit `maxBytes`. */
  webp?: { maxBytes: number; qualities: readonly number[] };
  /** A PNG to compare the frame with, pixel by pixel (the poster's tolerance check). */
  reference?: Uint8Array;
  /** A reference pixel differs when one channel is further than this from the frame's (default 24). */
  threshold?: number;
  /** {@link withSupersample}: 1 (off) unless given. */
  supersample?: number;
}

export interface Still {
  /** SHA-256 of the composed frame's RGBA pixels: the same `__frameHash` as the key frames. */
  sha256: string;
  /** The canvas alone, as Chromium encodes it (`toDataURL`): no page, no strip, no caption. */
  png: Uint8Array;
  webp?: { bytes: Uint8Array; quality: number };
  /** Given `reference`: how many pixels differ beyond `threshold`, of how many, and the largest channel gap. */
  diff?: { differing: number; total: number; maxDelta: number; sizeMatches: boolean };
  browser: string;
}

/** One frame of a replay HTML (default its end frame), from the canvas only, in headless Chromium. */
export async function renderStill(o: StillOptions): Promise<Still> {
  const t = o.t ?? 1;
  const dir = mkdtempSync(join(tmpdir(), "archlang3d-still-"));
  const file = join(dir, "replay.html");
  writeFileSync(file, seekOnly(withSupersample(o.html, o.supersample)));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
  const bytesOf = (url: string, type: string): Uint8Array => {
    const head = `data:${type};base64,`;
    if (!url.startsWith(head)) throw new Error(`the browser did not encode ${type} (got ${url.slice(0, 32)}…)`);
    return new Uint8Array(Buffer.from(url.slice(head.length), "base64"));
  };
  try {
    const page = await browser.newPage({
      viewport: { width: o.width + 40, height: o.height + 120 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => window.__ready);
    const sha256 = await page.evaluate(async (x) => {
      window.__seek(x);
      return window.__frameHash();
    }, t);
    const canvas = page.locator("#archlang-replay");
    const png = bytesOf(await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png")), "image/png");
    let webp: Still["webp"];
    for (const q of o.webp?.qualities ?? []) {
      const bytes = bytesOf(
        await canvas.evaluate((c, quality) => (c as HTMLCanvasElement).toDataURL("image/webp", quality), q),
        "image/webp",
      );
      webp = { bytes, quality: q };
      if (bytes.byteLength <= (o.webp?.maxBytes ?? Infinity)) break;
    }
    let diff: Still["diff"];
    if (o.reference) {
      diff = await canvas.evaluate(
        async (c, { b64, threshold }) => {
          const out = c as HTMLCanvasElement;
          const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
          const img = await createImageBitmap(blob);
          const total = out.width * out.height;
          if (img.width !== out.width || img.height !== out.height)
            return { differing: total, total, maxDelta: 255, sizeMatches: false };
          const ref = document.createElement("canvas");
          ref.width = img.width;
          ref.height = img.height;
          const rc = ref.getContext("2d") as CanvasRenderingContext2D;
          rc.drawImage(img, 0, 0);
          const a = rc.getImageData(0, 0, ref.width, ref.height).data;
          const b = (out.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, out.width, out.height).data;
          let differing = 0;
          let maxDelta = 0;
          for (let i = 0; i < a.length; i += 4) {
            let d = 0;
            for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs((a[i + k] as number) - (b[i + k] as number)));
            if (d > maxDelta) maxDelta = d;
            if (d > threshold) differing++;
          }
          return { differing, total, maxDelta, sizeMatches: true };
        },
        { b64: Buffer.from(o.reference).toString("base64"), threshold: o.threshold ?? 24 },
      );
    }
    return { sha256, png, ...(webp ? { webp } : {}), ...(diff ? { diff } : {}), browser: browser.version() };
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
