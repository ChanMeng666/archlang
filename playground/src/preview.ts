/**
 * The SVG preview: the pan/zoom controller, the SVG-into-stage display, the
 * floating toolbar (zoom / fit / fullscreen / copy), and the hover-facts +
 * click-to-source interactions. Owns everything inside `.pz-viewport` so main.ts
 * only has to hand it each freshly compiled SVG.
 */
import { createPanZoom } from "./pan-zoom.js";
import { mountInteract } from "./interact.js";
import { showSvgInStage } from "./viewer.js";
import { svgToCanvas } from "./raster-export.js";
import { type LevelPage, levelButtonLabel, levelButtonTitle } from "./levels.js";
import type { RoomSummary } from "archlang";

export interface Preview {
  /** Inject a compiled SVG; `refit` re-centres, else preserves the current view. */
  show(svg: string, refit: boolean): void;
  /** Re-centre/scale the current plan to the viewport. */
  fit(): void;
  /** Whether the "Paths" circulation overlay toggle is on (drives the preview compile). */
  pathsEnabled(): boolean;
  /**
   * Re-render the storey switcher for the plan now on screen. `pages` is `undefined`
   * for a single-storey plan (the core omits the key), and the control is then hidden
   * ENTIRELY — a plan with one floor has no storey to choose.
   */
  setLevels(pages: readonly LevelPage[] | undefined, active: number | null): void;
}

interface PreviewOpts {
  viewport: HTMLElement;
  stage: HTMLElement;
  toolbar: HTMLElement;
  /** describe() rooms for the hover tooltip (read fresh on each pointer move). */
  getRooms: () => RoomSummary[];
  /** The export-clean SVG (annotations stripped) for the copy buttons. */
  getCleanSvg: () => string;
  /** Move the editor caret to a source byte offset (click-to-source). */
  jumpToOffset: (offset: number) => void;
  /** Briefly surface a status message. */
  flash: (msg: string) => void;
  /** Re-render the preview when the "Paths" overlay toggle flips. */
  onPathsChange: () => void;
  /** The storey-switcher group (empty until a multi-storey plan is compiled). */
  levelsEl: HTMLElement | null;
  /** The separator in front of it — hidden with the group so the toolbar has no gap. */
  levelsSepEl: HTMLElement | null;
  /** A storey button was pressed: re-render the preview against that page. */
  onLevelChange: (level: number) => void;
}

export function createPreview(opts: PreviewOpts): Preview {
  const { viewport, stage, toolbar, getRooms, getCleanSvg, jumpToOffset, flash, onPathsChange } = opts;
  const { levelsEl, levelsSepEl, onLevelChange } = opts;

  // Pan/zoom controller for the preview (created once; survives every re-render).
  const pz = createPanZoom(viewport, stage);

  // "Paths" circulation overlay — off by default; a diagnostic aid shown in the
  // preview only (exports re-compile without it, so downloads stay clean).
  let pathsOn = false;

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else viewport.requestFullscreen?.();
  }

  async function copySvg() {
    const svg = getCleanSvg();
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
      flash("SVG copied");
    } catch {
      flash("Copy failed");
    }
  }

  async function copyPng() {
    const svg = getCleanSvg();
    if (!svg) return;
    try {
      const canvas = await svgToCanvas(svg);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]);
      flash("PNG copied");
    } catch {
      flash("Copy failed");
    }
  }

  /**
   * Rebuild the storey buttons. Built through the DOM rather than an HTML string
   * because a storey NAME is author text (`level 1 "Ground floor"`) and `textContent` /
   * `setAttribute` are the escaping — there is no second place to get it wrong.
   *
   * Stateful like the "Paths" toggle, and wearing the same clothes: `.active` plus
   * `aria-pressed`, so the pressed storey is announced and not only coloured.
   */
  function setLevels(pages: readonly LevelPage[] | undefined, active: number | null): void {
    if (!levelsEl) return;
    const show = pages !== undefined && pages.length > 0;
    levelsEl.hidden = !show;
    if (levelsSepEl) levelsSepEl.hidden = !show;
    if (!show) {
      levelsEl.replaceChildren();
      return;
    }
    levelsEl.replaceChildren(
      ...pages.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.pz = "level";
        b.dataset.level = String(p.level);
        b.textContent = levelButtonLabel(p);
        const full = levelButtonTitle(p);
        b.title = full;
        b.setAttribute("aria-label", full);
        const on = p.level === active;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
        return b;
      }),
    );
  }

  // Floating preview toolbar — pan/zoom + copy + the Paths overlay toggle + the storey
  // switcher. One delegated listener, so the storey buttons can be rebuilt per plan
  // without ever re-binding anything.
  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>("button");
    const action = btn?.dataset.pz;
    if (action === "level") {
      const n = Number(btn?.dataset.level);
      if (Number.isFinite(n)) onLevelChange(n);
      return;
    }
    if (action === "in") pz.zoomIn();
    else if (action === "out") pz.zoomOut();
    else if (action === "fit") pz.fit();
    else if (action === "full") toggleFullscreen();
    else if (action === "copysvg") void copySvg();
    else if (action === "copypng") void copyPng();
    else if (action === "paths") {
      pathsOn = !pathsOn;
      btn?.classList.toggle("active", pathsOn);
      btn?.setAttribute("aria-pressed", String(pathsOn));
      onPathsChange();
    }
  });

  // Preview interactions: hover a room for facts (C2), click any element to jump
  // the editor caret to its source (C3, via the annotate data-span attributes).
  mountInteract({ viewport, stage, getRooms, jumpToOffset });

  return {
    show: (svg, refit) => showSvgInStage(stage, pz, svg, refit),
    fit: () => pz.fit(),
    pathsEnabled: () => pathsOn,
    setLevels,
  };
}
