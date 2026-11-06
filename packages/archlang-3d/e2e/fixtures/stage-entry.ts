/**
 * A bare host page's script for `e2e/stage.e2e.ts`: `mountReplay` on a canvas, its handle on
 * `window`, so the test can drive `resize` and `view.spin` (playground card PG1) directly, as the
 * playground's 3D stage does. Bundled with three.js by `bundleViewer`, as the replay HTML's own
 * script is.
 */
import { mountReplay, type ReplayHandle, type ReplayPayload } from "../../src/replay/mount.js";

declare global {
  interface Window {
    __mount: (p: ReplayPayload) => Promise<void>;
    __handle?: ReplayHandle;
    __takes: number;
  }
}

window.__takes = 0;
window.__mount = async (p) => {
  window.__handle?.dispose();
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  window.__handle = mountReplay(canvas, p, undefined, {
    interactive: true,
    onTake: () => {
      window.__takes += 1;
    },
  });
  await window.__handle.ready;
};
