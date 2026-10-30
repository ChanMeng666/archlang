/**
 * The replay viewer's browser code (card A3), bundled with three.js into the single HTML file
 * `replay.ts` writes. It reads the payload the file carries and mounts it (`mountReplay`):
 * `window.__seek(t)` renders the frame at `t` synchronously and `window.__frameHash()` hashes the
 * composed frame (plan §6.5). The playback loop only chooses which `t` to show next; no clock or
 * random source reaches a frame.
 */
import { mountReplay, type ReplayPayload } from "./mount.js";

export type { ReplayNode, ReplayPayload } from "./mount.js";

declare global {
  interface Window {
    __seek: (t: number) => void;
    __frameHash: () => Promise<string>;
    __ready: Promise<void>;
    __replayAutoplay?: boolean;
  }
}

function payload(): ReplayPayload {
  const el = document.getElementById("archlang-replay-payload");
  return JSON.parse(el?.textContent ?? "{}") as ReplayPayload;
}

function start(): void {
  const p = payload();
  const out = document.getElementById("archlang-replay") as HTMLCanvasElement;
  const strip = document.getElementById("archlang-replay-strip") ?? undefined;
  const { seek, frameHash, ready } = mountReplay(out, p, strip);

  window.__seek = seek;
  window.__frameHash = frameHash;
  window.__ready = ready.then(() => seek(0));

  // Playback: the browser's frame clock only picks the next t; every frame is seek(t).
  const scrub = document.getElementById("archlang-replay-t") as HTMLInputElement | null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  void window.__ready.then(() => {
    if (window.__replayAutoplay === false) return;
    if (reduced) {
      seek(1);
      if (scrub) scrub.value = "1";
      return;
    }
    let t0: number | undefined;
    const step = (now: number) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / (p.seconds * 1000));
      seek(t);
      if (scrub) scrub.value = String(t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  scrub?.addEventListener("input", () => seek(Number(scrub.value)));
}

start();
