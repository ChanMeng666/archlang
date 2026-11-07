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
 *
 * The view turns freely (card CR4): the package's free camera (`interactive`) and its toolbar
 * (presets and Reset). Grabbing the view pauses the playback; scrubbing or Replay hands the camera
 * back to the replay; an edit keeps the view the user left. The toolbar's own "Storeys shown"
 * cut-away is left out (`storeys: false`, card PG5b): the page's storey switcher is the one storey
 * control, and it already chooses what this view shows (no storey picked: all of them; Ln: that
 * storey alone).
 *
 * The 3D stage (playground-minimal card PG1, ruling PG-D4): the canvas fills the whole tab, its
 * drawing size following the box it sits in (`ResizeObserver`, CSS size × device pixels, capped;
 * the package's `resize`), and every control floats over it, dimmed until the pointer or the focus
 * is on it: Replay, the caption's lead and its ⓘ bottom-left, the scrubber a thin line along the
 * foot, ⟲ Reset and `View ▾` (the package's compact toolbar) top-right. The
 * ⓘ card holds the PS-D12 line, the limits line and the link (`PREVIEW_LABEL`, `PREVIEW_LIMITS`);
 * every word stays in the page, only its place changed. The facts the replay HTML lays over its
 * canvas are not laid over this one: the page's own facts line says them.
 *
 * What the view does on its own: the session's FIRST open plays the drafting-order replay once,
 * then turns the building slowly (a turntable: the package's `spin`, one step per animation frame);
 * the first press, wheel, key or input anywhere on the stage stops the turntable for good. Every
 * later open, and a new plan, shows the replay's END frame (public-surfaces card X1): the iso view,
 * settled, with the storeys stacked (card X2). Under reduced motion nothing plays or turns: the end
 * frame. A one-time coach mark over the canvas says how to move it, until the first interaction or
 * five seconds; the page remembers it was shown (`localStorage`, every access guarded, so the page
 * works without storage). The full keyboard hint is the canvas's description, visually hidden.
 *
 * Touch (playground-mobile-perf card MP2, ruling MP-D2): on a touch screen the coach mark says the
 * finger's words, and with no hover the floating controls rest whole (panels.css). A lost WebGL
 * context (ruling MP-D3) stops the loops and says so over the stage; its restore, or a press of
 * the message, mounts the replay again where it was.
 *
 * It draws only when someone can see it (card MP3, ruling MP-D3): while a modal dialog or a header
 * menu covers the stage, while under half the canvas is on screen, or while the page is hidden, the
 * replay's and the turntable's frames are parked, and they go on from where they were once the
 * stage is seen again. A touch screen's drawing buffer is at most 1.5× its CSS size (2× elsewhere).
 *
 * In view mode it is the stage's other half (public-surfaces card X5): the Plan | 3D switch on the
 * stage shows it in place of the drawing, `&3d` in the hash opens on it, and the page lays its knobs
 * over the canvas (`overlay`). The GLB of the plan is Share → Export → GLB (ruling PG-D5, actions.ts),
 * which builds it through the same `plan3d.ts` path, without this chunk or three.js, whether or not
 * this tab was ever opened.
 */
import { compile } from "archlang";
import { storeysOf, viewMesh } from "@chanmeng666/archlang-3d";
import {
  mountReplay,
  PREVIEW_ABOUT_URL,
  PREVIEW_LABEL,
  PREVIEW_LEAD,
  PREVIEW_LIMITS,
  type ReplayHandle,
  replayPayload,
  VIEW_CONTROLS_LABEL,
  type ViewState,
  viewToolbar,
} from "@chanmeng666/archlang-3d/browser";
import { adapt3d, mesh3d } from "./plan3d.js";

/** The drawing size before the stage has a size of its own (a hidden tab): the replay HTML's 16:9. */
const WIDTH = 960;
const HEIGHT = 540;
/**
 * The drawing buffer: the canvas's CSS size × the device's pixel ratio, the ratio at most this, and
 * the buffer at most `MAX_PIXELS` (each frame is read back into the 2D canvas the page shows). A
 * touch screen, a phone or a tablet, caps the ratio lower (ruling MP-D3): at 3× a phone's buffer
 * was 2.25 times the pixels for a picture a finger turns.
 */
const MAX_DPR = 2;
const MAX_DPR_TOUCH = 1.5;
const MAX_PIXELS = 2_400_000;
/** One play-through, in seconds: shorter than the 15 s export, a preview is glanced at. */
const SECONDS = 6;
/** The turntable after the first open's play-through: degrees per second (a turn in 45 s). */
const TURN_DEG_PER_S = 8;
/** The coach mark fades after this long if nothing has touched the view. */
const COACH_MS = 5000;
/** `localStorage`: the coach mark has been shown. `sessionStorage`: the first open has played. */
const COACH_KEY = "archlang.pg.coach3d";
const PLAYED_KEY = "archlang.pg.played3d";
/** What the coach mark says (the hint, `VIEW_HINT`, is the full text, keys included). */
export const COACH_TEXT = "Drag to turn · scroll to zoom · right-drag to pan";
/**
 * The same on a touch screen (ruling MP-D2). The words are what three.js's `OrbitControls` (0.186)
 * does with fingers: `touches = { ONE: ROTATE, TWO: DOLLY_PAN }`, so one finger turns, and two
 * fingers zoom by their spread and pan by moving together.
 */
export const COACH_TEXT_TOUCH = "Drag to turn · pinch to zoom · two-finger drag to pan";
/** A touch screen: the main pointer is a finger, or nothing hovers (ruling MP-D2). */
const touchScreen = (): boolean =>
  window.matchMedia?.("(pointer: coarse)").matches === true || window.matchMedia?.("(hover: none)").matches === true;
/** What the stage says while the browser has taken its WebGL context away (ruling MP-D3). */
export const LOST_TEXT = "3D view paused. Tap to draw it again.";
export const LOST_TEXT_MOUSE = "3D view paused. Click to draw it again.";

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
   * is built and shown at its end frame (Replay plays it), except on the session's first open,
   * which plays it once and turns; the same one resumes where it was hidden. `drawn`, when given,
   * is the editor's compile of `source` (else this tab compiles it).
   */
  show: (source: string, level: number | null, drawn?: Drawn) => void;
  /** The plan or the storey changed while the tab is open: rebuild and go on from the current t. */
  update: (source: string, level: number | null, drawn?: Drawn) => void;
  /** The tab was closed: playback stops (no frames are drawn while hidden). */
  hide: () => void;
  /**
   * The box over the canvas, for a panel the page lays over the 3D preview as it does over the
   * drawing (the knobs, card X5). It is positioned, and the canvas takes no pointer outside itself.
   */
  overlay: HTMLElement;
}

declare global {
  interface Window {
    /** The mounted replay (tests read frames through it, as the replay HTML's `__seek`/`__frameHash`). */
    __preview3d?: ReplayHandle;
    /** Its WebGL canvas (tests force a context loss through it, `WEBGL_lose_context`). */
    __preview3dGl?: HTMLCanvasElement;
  }
}

/** Storage that may be missing or throw (a private window, blocked site data): never fatal. */
function stored(area: "localStorage" | "sessionStorage", key: string): boolean {
  try {
    return window[area].getItem(key) === "1";
  } catch {
    return false;
  }
}
function store(area: "localStorage" | "sessionStorage", key: string): void {
  try {
    window[area].setItem(key, "1");
  } catch {
    /* the page works without it */
  }
}

/**
 * Run `mount` and hand back the first canvas it creates: `mountReplay`'s WebGL canvas, which is not
 * in the page (each frame is copied into the canvas the page shows) and which the handle does not
 * expose. The playground hears its context loss and restore on it (ruling MP-D3) without a change
 * to the package: `createElement` is wrapped for the one synchronous call, then put back.
 */
function withGlCanvas<T>(mount: () => T): [T, HTMLCanvasElement | undefined] {
  const own = Object.prototype.hasOwnProperty.call(document, "createElement");
  const create = document.createElement;
  let made: HTMLCanvasElement | undefined;
  document.createElement = function (this: Document, tag: string, options?: ElementCreationOptions) {
    const el = create.call(this, tag, options);
    if (!made && el instanceof HTMLCanvasElement) made = el;
    return el;
  } as typeof document.createElement;
  try {
    return [mount(), made];
  } finally {
    if (own) document.createElement = create;
    else delete (document as { createElement?: unknown }).createElement;
  }
}

const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const SVG_NS = "http://www.w3.org/2000/svg";
/** The coach mark's glyph: a hand with a curved two-way arrow over it (inline, no image asset). */
function dragGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("width", "40");
  svg.setAttribute("height", "40");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of [
    // The arrow: an arc over the hand, a head at each end.
    "M9 15 C 16 6, 32 6, 39 15",
    "M9 15 l 1 -6 M9 15 l 6 1",
    "M39 15 l -1 -6 M39 15 l -6 1",
    // The hand: a pointing finger, the folded fingers and the palm.
    "M21 36 V 21 a 2.5 2.5 0 0 1 5 0 V 30 M26 28 a 2.5 2.5 0 0 1 5 0 V 31 M31 30 a 2.5 2.5 0 0 1 5 0 V 35 c 0 5 -3 8 -8 8 h -3 c -3 0 -5 -2 -7 -4 l -5 -6 a 2.5 2.5 0 0 1 4 -3 l 3 3",
  ]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const btn = (text: string, cls: string, label?: string): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  if (label) b.setAttribute("aria-label", label);
  return b;
};

export function mountPreview3d(host: HTMLElement): Preview3d {
  host.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "p3d-stage";
  const canvas = document.createElement("canvas");
  canvas.className = "p3d-canvas";
  // It takes the pointer and keys (the free camera, card CR4), so it is an application, not an image.
  canvas.setAttribute("role", "application");

  // ---- top-right: ⟲ Reset and View ▾ (the package's compact toolbar) ----
  // (The GLB is Share → Export → GLB since card PG4, ruling PG-D5: one home for every export.)
  const top = document.createElement("div");
  top.className = "p3d-float p3d-top";
  // The free camera's toolbar (card CR4), rebuilt with each replay.
  const views = document.createElement("div");
  views.className = "p3d-views";
  top.append(views);

  // ---- bottom-left: ▶ Replay, the caption's lead and its ⓘ card ----
  const foot = document.createElement("div");
  foot.className = "p3d-float p3d-foot";
  const play = btn("▶ Replay", "p3d-btn", "Replay: the plan drawing itself in its authoring order, then rising");
  const caption = document.createElement("p");
  caption.className = "p3d-lead";
  // The PS-D12 line's first sentence, bold as it is in the full line.
  const leadText = document.createElement("strong");
  leadText.textContent = PREVIEW_LEAD;
  const infoBtn = btn("ⓘ", "p3d-info-btn", "About the 3D preview: what it shows and its limits");
  infoBtn.setAttribute("aria-expanded", "false");
  infoBtn.setAttribute("aria-controls", "p3d-info");
  caption.append(leadText, " ", infoBtn);
  // The PS-D12 line, its first sentence in bold, then the link; the limits line under it. After the
  // ⓘ in the page's order, so Tab goes from ⓘ into it; focusable itself, so a press on its text
  // keeps it open.
  const info = document.createElement("div");
  info.className = "p3d-info";
  info.id = "p3d-info";
  info.setAttribute("role", "note");
  info.tabIndex = -1;
  info.hidden = true;
  const label = document.createElement("p");
  label.className = "p3d-label";
  const lead = document.createElement("strong");
  lead.textContent = PREVIEW_LEAD;
  const about = document.createElement("a");
  about.href = PREVIEW_ABOUT_URL;
  about.target = "_blank";
  about.rel = "noopener";
  about.textContent = "What it shows";
  label.append(lead, PREVIEW_LABEL.slice(PREVIEW_LEAD.length), " ", about);
  const limits = document.createElement("p");
  limits.className = "p3d-limits";
  limits.textContent = PREVIEW_LIMITS;
  info.append(label, limits);
  foot.append(play, caption, info);

  const away = (e: Event): void => {
    if (!foot.contains(e.target as Node)) shutInfo(false);
  };
  const openInfo = (): void => {
    info.hidden = false;
    infoBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", away, true);
  };
  const shutInfo = (refocus: boolean): void => {
    if (info.hidden) return;
    info.hidden = true;
    infoBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", away, true);
    if (refocus) infoBtn.focus();
  };
  infoBtn.addEventListener("click", () => (info.hidden ? openInfo() : shutInfo(false)));
  foot.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || info.hidden) return;
    e.preventDefault();
    shutInfo(true);
  });
  // The focus leaving the ⓘ and its card shuts the card, as the View ▾ popover does.
  foot.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (!(to && (to === infoBtn || info.contains(to)))) shutInfo(false);
  });

  // ---- the scrubber: a thin line along the canvas's foot, grown on hover and focus ----
  const scrub = document.createElement("input");
  scrub.type = "range";
  scrub.className = "p3d-float p3d-scrub";
  scrub.min = "0";
  scrub.max = "1";
  scrub.step = "0.001";
  scrub.value = "1";
  scrub.setAttribute("aria-label", "Replay position");
  // The specs find it by this, not by its type: the knobs over the canvas are range inputs too.
  scrub.dataset.role = "scrub";
  const setScrub = (t: number): void => {
    scrub.value = String(t);
    scrub.style.setProperty("--p", `${Math.round(Number(scrub.value) * 1000) / 10}%`);
  };
  setScrub(1);

  // ---- the coach mark: once per browser, over the canvas, until touched or five seconds ----
  const coach = document.createElement("div");
  coach.className = "p3d-coach";
  // The hint (the canvas's description) says it in full; this is its picture.
  coach.setAttribute("aria-hidden", "true");
  coach.hidden = true;
  const coachText = document.createElement("span");
  coachText.textContent = touchScreen() ? COACH_TEXT_TOUCH : COACH_TEXT;
  coach.append(dragGlyph(), coachText);
  let coachTimer = 0;
  const fadeCoach = (): void => {
    if (coachTimer) clearTimeout(coachTimer);
    coachTimer = 0;
    if (coach.hidden || coach.classList.contains("p3d-coach-gone")) return;
    coach.classList.add("p3d-coach-gone");
    // Gone from the layer once faded (at once under reduced motion, where nothing transitions).
    setTimeout(
      () => {
        coach.hidden = true;
      },
      reducedMotion() ? 0 : 400,
    );
  };
  const showCoach = (): void => {
    if (stored("localStorage", COACH_KEY) || !coach.hidden) return;
    store("localStorage", COACH_KEY);
    coach.hidden = false;
    coachTimer = window.setTimeout(fadeCoach, COACH_MS);
  };

  const message = document.createElement("p");
  message.className = "p3d-message";
  message.setAttribute("role", "status");
  message.hidden = true;

  // ---- the browser took the WebGL context away (ruling MP-D3): say so; a press draws it again ----
  const lostBtn = btn(LOST_TEXT, "p3d-lost");
  lostBtn.hidden = true;

  stage.append(canvas, coach, top, scrub, foot, message, lostBtn);
  host.append(stage);

  let handle: ReplayHandle | undefined;
  /** What the mounted replay (or the refusal showing) was built from. */
  let built: string | undefined;
  let frame = 0;
  let generation = 0;
  /** Playback was running when the tab was hidden: `show` resumes it. */
  let resume = false;
  /** The session's first open plays and turns (once per tab session). */
  let firstOpen = !stored("sessionStorage", PLAYED_KEY);
  /** The turntable's animation frame, while it turns; `turnOff` once anything has touched the view. */
  let spinFrame = 0;
  let turnOff = false;
  /** The turntable was stopped by leaving the tab: the next open shows the end frame again. */
  let resetOnShow = false;
  /** What the mounted replay was built from, so a lost WebGL context can be mounted again. */
  let last: { source: string; level: number | null; key: string; drawn?: Drawn } | undefined;
  /** The WebGL context is lost: what was going on when it went (playing, turning, the replay time). */
  let lost: { playing: boolean; turning: boolean; t: number } | undefined;

  /**
   * Nobody can see the stage (ruling MP-D3): a modal dialog or a header menu is over it, under half
   * the canvas is on screen, or the page is hidden. The replay's and the turntable's next frame is
   * then not drawn but parked, and taken up where it left off once nothing covers the stage.
   */
  const unseen = new Set<"covered" | "offscreen" | "hidden">();
  let parkedPlay: (() => void) | undefined;
  let parkedTurn: (() => void) | undefined;
  /** The replay is playing (a frame requested, or parked while the stage is unseen). */
  const playing = (): boolean => frame !== 0 || parkedPlay !== undefined;
  /** The turntable is turning (likewise). */
  const turning = (): boolean => spinFrame !== 0 || parkedTurn !== undefined;
  const see = (why: "covered" | "offscreen" | "hidden", on: boolean): void => {
    if (on) unseen.add(why);
    else unseen.delete(why);
    if (unseen.size > 0) return;
    const play = parkedPlay;
    const turn = parkedTurn;
    parkedPlay = undefined;
    parkedTurn = undefined;
    play?.();
    turn?.();
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    parkedPlay = undefined;
  };
  const stopTurn = () => {
    if (spinFrame) cancelAnimationFrame(spinFrame);
    spinFrame = 0;
    parkedTurn = undefined;
  };
  /** The turntable: one `spin` step per animation frame, its size from the frame clock. */
  const startTurn = () => {
    const h = handle;
    if (turnOff || !h?.view || reducedMotion()) return;
    stopTurn();
    let last: number | undefined;
    const step = (now: number) => {
      if (turnOff || h !== handle) {
        spinFrame = 0;
        return;
      }
      if (unseen.size > 0) {
        // Parked: no frame while nobody sees it; the step after it starts a fresh frame clock.
        spinFrame = 0;
        parkedTurn = () => {
          last = undefined;
          spinFrame = requestAnimationFrame(step);
        };
        return;
      }
      const dt = last === undefined ? 0 : Math.min(100, now - last);
      last = now;
      if (dt > 0) h.view?.spin((TURN_DEG_PER_S * dt) / 1000);
      spinFrame = requestAnimationFrame(step);
    };
    spinFrame = requestAnimationFrame(step);
  };
  /** Anything on the stage (a press, the wheel, a key, a slider): the turntable stops for good. */
  const touched = () => {
    turnOff = true;
    resetOnShow = false;
    stopTurn();
    fadeCoach();
  };
  for (const type of ["pointerdown", "wheel", "keydown", "input"] as const)
    stage.addEventListener(type, touched, { capture: true, passive: true });

  // grab, and grabbing while a press on the canvas is down.
  canvas.addEventListener("pointerdown", () => canvas.classList.add("p3d-grabbing"));
  for (const type of ["pointerup", "pointercancel"] as const)
    window.addEventListener(type, () => canvas.classList.remove("p3d-grabbing"));

  /** The drawing size the stage's box asks for, or the 16:9 fallback while it has none. */
  const sizeNow = (): [number, number] => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return [WIDTH, HEIGHT];
    let dpr = Math.min(touchScreen() ? MAX_DPR_TOUCH : MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    if (w * h * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (w * h));
    return [Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr))];
  };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return; // a hidden tab: keep the size
      const [w, h] = sizeNow();
      handle?.resize(w, h);
    }).observe(canvas);
  }

  // Who can see the stage (ruling MP-D3). Covered: the Make your own dialog, the Embed sheet (a
  // full-screen `div.embed-dialog` that actions.ts adds to <body> and removes), or a header menu
  // (the gallery, Share, ⋯) open over it. Off screen: under half the canvas in the window (a hidden
  // tab's canvas is not in it at all). Hidden: the page is.
  const COVERS = "dialog[open], body > .embed-dialog, header details[open]";
  const covered = (): void => see("covered", document.querySelector(COVERS) !== null);
  if (typeof MutationObserver === "function") {
    new MutationObserver(covered).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    // The Embed sheet comes and goes as a child of <body> (no subtree: the editor's edits are not watched).
    new MutationObserver(covered).observe(document.body, { childList: true });
  }
  covered();
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) see("offscreen", !e.isIntersecting || e.intersectionRatio < 0.5);
      },
      { threshold: [0, 0.5] },
    ).observe(canvas);
  }
  const pageShown = (): void => see("hidden", document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", pageShown);
  pageShown();

  const refuse = (text: string) => {
    stop();
    stopTurn();
    handle?.dispose();
    handle = undefined;
    window.__preview3d = undefined;
    window.__preview3dGl = undefined;
    stage.dataset.refused = "";
    canvas.hidden = true;
    top.hidden = true;
    play.hidden = true;
    scrub.hidden = true;
    coach.hidden = true;
    clearLost();
    message.hidden = false;
    message.textContent = `No 3D preview: ${text}`;
    delete host.dataset.view;
  };

  /**
   * Build the replay of `source` at `level`; false when it was refused (the message is showing).
   * `keep`, the view of the replay it replaces (an edit), is carried over.
   */
  const build = (source: string, level: number | null, key: string, given?: Drawn, keep?: ViewState): boolean => {
    built = key;
    last = { source, level, key, drawn: given };
    generation += 1;
    let next: ReplayHandle;
    let gl: HTMLCanvasElement | undefined;
    let view: string;
    try {
      const r = adapt3d(source);
      if (!r.ok) {
        refuse(r.refusal.message);
        return false;
      }
      const drawn: Drawn = given ?? compile(source);
      if (drawn.errors.length > 0 || !drawn.svg) {
        refuse(drawn.errors[0]?.message ?? "the core did not draw the plan.");
        return false;
      }
      const mesh = mesh3d(r.scene);
      const levels = storeysOf(mesh);
      const index = level === null || levels.length < 2 ? -1 : levels.indexOf(level);
      const svg = index < 0 ? drawn.svg : drawn.pages?.find((pg) => pg.level === level)?.svg;
      if (!svg) {
        refuse(`the core drew no page for storey L${level}.`);
        return false;
      }
      view = index < 0 ? "all" : `L${level}`;
      // The canvas shows again before it is measured: a refusal hid it.
      delete stage.dataset.refused;
      canvas.hidden = false;
      const [width, height] = sizeNow();
      // No facts over the canvas (PG-D4): the page's own facts line says them.
      const payload = replayPayload(viewMesh(mesh, index < 0 ? "all" : index + 1), {
        title: r.scene.meta.name,
        svg,
        width,
        height,
        seconds: SECONDS,
      });
      stop();
      // A parked turntable step of the replaced mount would leave `turning()` true: drop it too.
      stopTurn();
      handle?.dispose();
      // Grabbing the view pauses the playback.
      [next, gl] = withGlCanvas(() => mountReplay(canvas, payload, undefined, { interactive: true, onTake: stop }));
      if (keep) next.view?.restore(keep);
      views.replaceChildren(
        ...(next.view
          ? [viewToolbar(next.view, { buttonClass: "p3d-btn", hintId: "p3d-hint", compact: true, storeys: false })]
          : []),
      );
      canvas.setAttribute("aria-describedby", "p3d-hint");
      const which = index < 0 ? (levels.length > 1 ? "all storeys" : "") : `storey L${level}`;
      canvas.setAttribute(
        "aria-label",
        `${payload.title}${which ? ` (${which})` : ""}: the plan drawing itself in its authoring order, then rising; ${VIEW_CONTROLS_LABEL}`,
      );
    } catch (e) {
      refuse((e as { message?: string })?.message ?? String(e));
      return false;
    }
    handle = next;
    window.__preview3d = next;
    window.__preview3dGl = gl;
    if (gl) watchContext(gl, next);
    clearLost();
    host.dataset.view = view;
    top.hidden = false;
    play.hidden = false;
    scrub.hidden = false;
    message.hidden = true;
    return true;
  };

  const seek = (t: number) => {
    handle?.seek(t);
    setScrub(t);
  };

  /** Play from `from` to the end; the frame clock only advances t. `then` runs at the end. */
  const playFrom = (from: number, then?: () => void) => {
    const h = handle;
    if (!h) return;
    stop();
    const mine = generation;
    void h.ready.then(() => {
      if (mine !== generation) return;
      if (reducedMotion()) {
        seek(1);
        return;
      }
      // t advances by the frame clock's steps, so a pause (the stage unseen) resumes where it was.
      let t = from;
      let last: number | undefined;
      const step = (now: number) => {
        frame = 0;
        if (mine !== generation) return;
        if (unseen.size > 0) {
          parkedPlay = () => {
            last = undefined;
            frame = requestAnimationFrame(step);
          };
          return;
        }
        if (last !== undefined) t = Math.min(1, t + (now - last) / (SECONDS * 1000));
        last = now;
        seek(t);
        if (t < 1) frame = requestAnimationFrame(step);
        else then?.();
      };
      frame = requestAnimationFrame(step);
    });
  };

  /** Redraw at `t` once the drawing is ready (no playback), from the camera that holds the view. */
  const drawAt = (t: number) => {
    const h = handle;
    const mine = generation;
    void h?.ready.then(() => {
      if (mine !== generation) return;
      if (h.view) h.view.at(t);
      else h.seek(t);
      setScrub(t);
    });
  };

  /**
   * A lost WebGL context (ruling MP-D3): the GPU was reset, or the browser took the context for
   * another page. The canvas the page shows is a 2D copy, so it would keep the last frame with no
   * word; instead the loops stop and the stage says so. The loss's default is prevented, so the
   * browser may restore the context; on restore, or on a press of the message, the replay is
   * mounted again (a fresh renderer, its buffers uploaded anew) and drawn where it was.
   */
  const watchContext = (gl: HTMLCanvasElement, h: ReplayHandle): void => {
    gl.addEventListener("webglcontextlost", (e) => {
      // A replaced or refused mount's own `dispose` loses its context on purpose: not this one's.
      if (h !== handle) return;
      e.preventDefault();
      if (lost) return;
      lost = { playing: playing(), turning: turning(), t: Number(scrub.value) };
      stop();
      stopTurn();
      lostBtn.textContent = touchScreen() ? LOST_TEXT : LOST_TEXT_MOUSE;
      lostBtn.hidden = false;
      stage.dataset.lost = "";
    });
    gl.addEventListener("webglcontextrestored", () => {
      if (h === handle) drawAgain();
    });
  };
  function clearLost(): void {
    lost = undefined;
    lostBtn.hidden = true;
    delete stage.dataset.lost;
  }
  function drawAgain(): void {
    const was = lost;
    if (!was || !last) return;
    const { source, level, key, drawn } = last;
    if (!build(source, level, key, drawn, handle?.view?.state())) return;
    if (was.playing) playFrom(was.t, turnOff ? undefined : startTurn);
    else {
      drawAt(was.t);
      // After the frame `drawAt` draws once ready, the turntable goes on from it.
      if (was.turning) void handle?.ready.then(startTurn);
    }
  }
  lostBtn.addEventListener("click", drawAgain);

  play.addEventListener("click", () => playFrom(0));
  scrub.addEventListener("input", () => {
    stop();
    handle?.seek(Number(scrub.value));
    setScrub(Number(scrub.value));
  });

  const keyOf = (source: string, level: number | null) => `${level ?? ""}|${source}`;

  return {
    show(source, level, drawn) {
      const key = keyOf(source, level);
      const first = firstOpen;
      firstOpen = false;
      store("sessionStorage", PLAYED_KEY);
      if (key !== built) {
        resume = false;
        resetOnShow = false;
        if (build(source, level, key, drawn)) {
          showCoach();
          if (first && !reducedMotion()) {
            // The session's first open (PG-D4): the replay once, then the turntable.
            setScrub(0);
            playFrom(0, startTurn);
          } else {
            // The end frame, at once: the settled iso view (card X1). Replay plays it from the start.
            setScrub(1);
            drawAt(1);
          }
        }
        return;
      }
      // The context was lost while away: the message stays until it is restored or pressed.
      if (lost) return;
      if (resetOnShow) {
        // The turntable stopped when the tab was left: back to the end frame, as any later open.
        resetOnShow = false;
        handle?.view?.reset();
        setScrub(1);
        drawAt(1);
        return;
      }
      const t = Number(scrub.value);
      if (resume) playFrom(t, turnOff ? undefined : startTurn);
      else drawAt(t);
      resume = false;
    },
    update(source, level, drawn) {
      const key = keyOf(source, level);
      if (key === built) return;
      // An edit is a hand on the plan: the turntable stops for good.
      touched();
      const t = Number(scrub.value);
      const wasPlaying = playing();
      // An edit keeps the view the user left; another storey starts from the replay's own.
      const sameStorey = built?.startsWith(keyOf("", level)) === true;
      if (!build(source, level, key, drawn, sameStorey ? handle?.view?.state() : undefined)) return;
      if (wasPlaying) playFrom(t);
      else drawAt(t);
    },
    hide() {
      resume = playing();
      const wasTurning = turning();
      stop();
      if (wasTurning) {
        // Left while turning: the turntable is over, and the next open is the end frame.
        stopTurn();
        turnOff = true;
        resetOnShow = true;
      }
      fadeCoach();
      shutInfo(false);
      // And View ▾'s popover (the package's toolbar shuts it on its own button).
      views.querySelector<HTMLButtonElement>('[aria-controls][aria-expanded="true"]')?.click();
    },
    overlay: stage,
  };
}
