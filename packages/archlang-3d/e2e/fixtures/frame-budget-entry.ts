/**
 * A bare host page's script for `e2e/frame-budget.e2e.ts` (card RM8.8): `mountReplay` on a canvas,
 * and two timers the test reads. A measurement only: nothing a replay draws reads these times.
 * Bundled with three.js by `bundleViewer`, as the replay HTML's own script is.
 */
import { mountReplay, type ReplayHandle, type ReplayPayload } from "../../src/replay/mount.js";

declare global {
  interface Window {
    /** Mount `p` (disposing the last mount) and draw t = 1; how long that took, ms. */
    __mountTimed: (p: ReplayPayload) => Promise<number>;
    /** Draw `t` and read the frame back (`frameHash`, so the GPU has finished); how long, ms. */
    __frameTimed: (t: number) => Promise<number>;
    /** Draw `t` and hash the frame (`frameHash`). */
    __frameHashAt: (t: number) => Promise<string>;
    __benchHandle?: ReplayHandle;
  }
}

const canvas = (): HTMLCanvasElement => document.getElementById("c") as HTMLCanvasElement;

window.__mountTimed = async (p) => {
  window.__benchHandle?.dispose();
  const t0 = performance.now();
  const h = mountReplay(canvas(), p);
  h.seek(1);
  await h.frameHash();
  const ms = performance.now() - t0;
  window.__benchHandle = h;
  return ms;
};

window.__frameHashAt = async (t) => {
  const h = window.__benchHandle;
  if (!h) throw new Error("nothing mounted");
  h.seek(t);
  return h.frameHash();
};

window.__frameTimed = async (t) => {
  const h = window.__benchHandle;
  if (!h) throw new Error("nothing mounted");
  const t0 = performance.now();
  h.seek(t);
  await h.frameHash();
  return performance.now() - t0;
};
