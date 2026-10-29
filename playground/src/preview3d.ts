/**
 * The "3D preview" output tab (card A5). Loaded on first open only (`main.ts` imports this module
 * dynamically), so three.js and the separate archlang-3d package never reach the startup chunks.
 *
 * The editor's plan goes through the package's own path, in the browser: `adaptPlan` → `buildMesh`
 * → `replayPayload` (the event table) → `mountReplay`, the same renderer the package's single-file
 * replay HTML uses. A plan the package refuses, or one the core does not draw, shows that message,
 * never a crash. Every frame is `seek(t)`; the playback loop only picks the next `t` (no clock
 * reaches a frame).
 *
 * The storey switcher drives this tab as it drives the other four: a selected storey is that
 * storey's view alone (`viewMesh(mesh, n)` over the core's own page for it, as the CLI's
 * `--storey n`); no selection, or a one-storey plan, is the combined view.
 *
 * The core's drawing is the editor's own compile when `main.ts` hands it over (`Drawn`), so an edit
 * with this tab open compiles once, not twice; `adaptPlan`'s resolve is the package's own.
 */
import { compile } from "archlang";
import { adaptPlan, buildMesh, replayFacts, storeysOf, viewMesh } from "@chanmeng666/archlang-3d";
import { mountReplay, PREVIEW_LABEL, type ReplayHandle, replayPayload } from "@chanmeng666/archlang-3d/browser";

/** The canvas's drawing size (CSS scales it to the pane); 16:9 like the replay HTML. */
const WIDTH = 960;
const HEIGHT = 540;
/** One play-through, in seconds: shorter than the 15 s export, a preview is glanced at. */
const SECONDS = 10;

/**
 * The editor's compile of the same source, when it has one whose drawing is the light one this tab
 * shows (no theme override): its `svg`, its per-storey `pages` and its `errors`. Annotation
 * attributes (`annotate: true`) are inert in the `<img>` the replay draws the plan through.
 */
export interface Drawn {
  svg: string;
  pages?: ReadonlyArray<{ level: number; svg: string }>;
  errors: ReadonlyArray<{ message: string }>;
}

export interface Preview3d {
  /**
   * The tab was opened. A new plan or storey (`level`: the switcher's selection, `null` = none)
   * is built and played from the start; the same one resumes where it was hidden. `drawn`, when
   * given, is the editor's compile of `source` (else this tab compiles it).
   */
  show: (source: string, level: number | null, drawn?: Drawn) => void;
  /** The plan or the storey changed while the tab is open: rebuild and go on from the current t. */
  update: (source: string, level: number | null, drawn?: Drawn) => void;
  /** The tab was closed: playback stops (no frames are drawn while hidden). */
  hide: () => void;
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
  const strip = document.createElement("div");
  strip.className = "p3d-strip";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "Plan facts");
  strip.hidden = true;
  stage.append(canvas, strip);

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
  /** What the mounted replay (or the refusal showing) was built from. */
  let built: string | undefined;
  let frame = 0;
  let generation = 0;
  /** Playback was running when the tab was hidden: `show` resumes it. */
  let resume = false;

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
    message.textContent = `No 3D preview: ${text}`;
    delete host.dataset.view;
  };

  /** Build the replay of `source` at `level`; false when it was refused (the message is showing). */
  const build = (source: string, level: number | null, key: string, given?: Drawn): boolean => {
    built = key;
    generation += 1;
    let next: ReplayHandle;
    let view: string;
    try {
      const r = adaptPlan(source);
      if (!r.ok) {
        refuse(r.refusal.message);
        return false;
      }
      const drawn: Drawn = given ?? compile(source);
      if (drawn.errors.length > 0 || !drawn.svg) {
        refuse(drawn.errors[0]?.message ?? "the core did not draw the plan.");
        return false;
      }
      const mesh = buildMesh(r.scene);
      const levels = storeysOf(mesh);
      const index = level === null || levels.length < 2 ? -1 : levels.indexOf(level);
      const svg = index < 0 ? drawn.svg : drawn.pages?.find((pg) => pg.level === level)?.svg;
      if (!svg) {
        refuse(`the core drew no page for storey L${level}.`);
        return false;
      }
      view = index < 0 ? "all" : `L${level}`;
      const facts = replayFacts(source, { view: index < 0 ? "all" : index + 1 });
      delete strip.dataset.stripKey;
      strip.hidden = true;
      const payload = replayPayload(viewMesh(mesh, index < 0 ? "all" : index + 1), {
        title: r.scene.meta.name,
        svg,
        width: WIDTH,
        height: HEIGHT,
        seconds: SECONDS,
        // The strip's numbers: the core's describe() and lint() of the same source.
        ...(facts ? { facts } : {}),
      });
      stop();
      handle?.dispose();
      next = mountReplay(canvas, payload, strip);
      const which = index < 0 ? (levels.length > 1 ? "all storeys" : "") : `storey L${level}`;
      canvas.setAttribute(
        "aria-label",
        `${payload.title}${which ? ` (${which})` : ""}: the plan drawing itself in its authoring order, then rising`,
      );
    } catch (e) {
      refuse((e as { message?: string })?.message ?? String(e));
      return false;
    }
    handle = next;
    window.__preview3d = next;
    host.dataset.view = view;
    stage.hidden = false;
    controls.hidden = false;
    message.hidden = true;
    return true;
  };

  const seek = (t: number) => {
    handle?.seek(t);
    scrub.value = String(t);
  };

  /** Play from `from` to the end; the frame clock only advances t. */
  const playFrom = (from: number) => {
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
        const t = Math.min(1, from + (now - t0) / (SECONDS * 1000));
        seek(t);
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    });
  };

  /** Redraw at `t` once the drawing is ready (no playback). */
  const drawAt = (t: number) => {
    const h = handle;
    const mine = generation;
    void h?.ready.then(() => mine === generation && seek(t));
  };

  play.addEventListener("click", () => playFrom(0));
  scrub.addEventListener("input", () => {
    stop();
    handle?.seek(Number(scrub.value));
  });

  const keyOf = (source: string, level: number | null) => `${level ?? ""}|${source}`;

  return {
    show(source, level, drawn) {
      const key = keyOf(source, level);
      if (key !== built) {
        resume = false;
        if (build(source, level, key, drawn)) playFrom(0);
        return;
      }
      const t = Number(scrub.value);
      if (resume) playFrom(t);
      else drawAt(t);
      resume = false;
    },
    update(source, level, drawn) {
      const key = keyOf(source, level);
      if (key === built) return;
      const t = Number(scrub.value);
      const playing = frame !== 0;
      if (!build(source, level, key, drawn)) return;
      if (playing) playFrom(t);
      else drawAt(t);
    },
    hide() {
      resume = frame !== 0;
      stop();
    },
  };
}
