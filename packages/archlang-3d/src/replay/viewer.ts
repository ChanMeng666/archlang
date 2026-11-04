/**
 * The replay viewer's browser code (card A3), bundled with three.js into the single HTML file
 * `replay.ts` writes. It reads the payload the file carries and mounts it (`mountReplay`):
 * `window.__seek(t)` renders the frame at `t` synchronously and `window.__frameHash()` hashes the
 * composed frame (plan §6.5). The playback loop only chooses which `t` to show next; no clock or
 * random source reaches a frame. The view can be turned freely (card CR4: `interactive`, the
 * toolbar from `view-dom.ts`); a drag or a preset pauses the playback.
 */
import { mountReplay, type ReplayPayload } from "./mount.js";
import { viewToolbar } from "./view-dom.js";

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
  // Taking the view (card CR4: a drag, a key, a preset) pauses the playback; `__seek` still draws
  // the replay's own frame.
  let frame = 0;
  const pause = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const { seek, frameHash, ready, view } = mountReplay(out, p, strip, { interactive: true, onTake: pause });

  window.__seek = seek;
  window.__frameHash = frameHash;
  window.__ready = ready.then(() => seek(0));

  const views = document.getElementById("archlang-replay-views");
  if (view && views) {
    views.replaceWith(viewToolbar(view, { hintId: "archlang-replay-hint" }));
    out.setAttribute("aria-describedby", "archlang-replay-hint");
  }

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
      frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  });
  scrub?.addEventListener("input", () => {
    pause();
    seek(Number(scrub.value));
  });
}

start();
