/**
 * The "3D preview" output tab (card A5). Loaded on first open only (`main.ts` imports this module
 * dynamically), so three.js and the separate archlang-3d package never reach the startup chunks.
 *
 * The editor's plan goes through the package's own path, in the browser: `adaptPlan` → `buildMesh`
 * → `replayPayload` (the event table) → `mountReplay`, the same renderer the package's single-file
 * replay HTML uses. A plan the package refuses shows the refusal's message, never a crash. Every
 * frame is `seek(t)`; the playback loop only picks the next `t` (no clock reaches a frame).
 */
import { compile } from "archlang";
import { adaptPlan, buildMesh } from "@chanmeng666/archlang-3d";
import { mountReplay, PREVIEW_LABEL, type ReplayHandle, replayPayload } from "@chanmeng666/archlang-3d/browser";

/** The canvas's drawing size (CSS scales it to the pane); 16:9 like the replay HTML. */
const WIDTH = 960;
const HEIGHT = 540;
/** One play-through, in seconds: shorter than the 15 s export, a preview is glanced at. */
const SECONDS = 10;

export interface Preview3d {
  /** The tab was opened: (re)build from `source` if it changed, and play from the start. */
  show: (source: string) => void;
  /** The source changed while the tab is open: rebuild and redraw at the current position. */
  update: (source: string) => void;
}

declare global {
  interface Window {
    /** The mounted replay (tests read frames through it, as the replay HTML's `__seek`/`__frameHash`). */
    __preview3d?: ReplayHandle;
  }
}

export function mountPreview3d(host: HTMLElement): Preview3d {
  host.replaceChildren();
  const label = document.createElement("p");
  label.className = "p3d-label";
  label.textContent = PREVIEW_LABEL;

  const stage = document.createElement("div");
  stage.className = "p3d-stage";
  const canvas = document.createElement("canvas");
  canvas.className = "p3d-canvas";
  canvas.setAttribute("role", "img");
  stage.append(canvas);

  const controls = document.createElement("div");
  controls.className = "p3d-controls";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "repair-btn";
  play.textContent = "Replay ▸";
  const scrub = document.createElement("input");
  scrub.type = "range";
  scrub.min = "0";
  scrub.max = "1";
  scrub.step = "0.001";
  scrub.value = "0";
  scrub.setAttribute("aria-label", "Replay position");
  controls.append(play, scrub);

  const message = document.createElement("p");
  message.className = "p3d-message";
  message.setAttribute("role", "status");
  message.hidden = true;

  host.append(label, stage, controls, message);

  let handle: ReplayHandle | undefined;
  let built: string | undefined;
  let frame = 0;
  let generation = 0;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const refuse = (text: string) => {
    stop();
    handle?.dispose();
    handle = undefined;
    window.__preview3d = undefined;
    stage.hidden = true;
    controls.hidden = true;
    message.hidden = false;
    message.textContent = text;
  };

  /** Build the replay of `source`; false when it was refused (the message is showing). */
  const build = (source: string): boolean => {
    built = source;
    generation += 1;
    let next: ReplayHandle;
    try {
      const r = adaptPlan(source);
      if (!r.ok) {
        refuse(`No 3D preview: ${r.refusal.message}`);
        return false;
      }
      const mesh = buildMesh(r.scene);
      const payload = replayPayload(mesh, {
        title: r.scene.meta.name,
        // The core's own light drawing (page 1 for a multi-storey plan: the combined view).
        svg: compile(source).svg,
        width: WIDTH,
        height: HEIGHT,
        seconds: SECONDS,
      });
      stop();
      handle?.dispose();
      next = mountReplay(canvas, payload);
      canvas.setAttribute(
        "aria-label",
        `${payload.title}: the plan drawing itself in its authoring order, then rising`,
      );
    } catch (e) {
      refuse(`No 3D preview: ${(e as { message?: string })?.message ?? String(e)}`);
      return false;
    }
    handle = next;
    window.__preview3d = next;
    stage.hidden = false;
    controls.hidden = false;
    message.hidden = true;
    return true;
  };

  const seek = (t: number) => {
    handle?.seek(t);
    scrub.value = String(t);
  };

  const playFrom0 = () => {
    const h = handle;
    if (!h) return;
    stop();
    const mine = generation;
    void h.ready.then(() => {
      if (mine !== generation) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) {
        seek(1);
        return;
      }
      let t0: number | undefined;
      const step = (now: number) => {
        t0 ??= now;
        const t = Math.min(1, (now - t0) / (SECONDS * 1000));
        seek(t);
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    });
  };

  play.addEventListener("click", playFrom0);
  scrub.addEventListener("input", () => {
    stop();
    handle?.seek(Number(scrub.value));
  });

  return {
    show(source) {
      if (source !== built && !build(source)) return;
      playFrom0();
    },
    update(source) {
      if (source === built) return;
      const t = Number(scrub.value);
      const playing = frame !== 0;
      if (!build(source)) return;
      const h = handle;
      const mine = generation;
      if (playing) playFrom0();
      else void h?.ready.then(() => mine === generation && seek(t));
    },
  };
}
