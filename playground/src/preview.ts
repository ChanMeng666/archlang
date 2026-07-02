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
import type { RoomSummary } from "archlang";

export interface Preview {
  /** Inject a compiled SVG; `refit` re-centres, else preserves the current view. */
  show(svg: string, refit: boolean): void;
  /** Re-centre/scale the current plan to the viewport. */
  fit(): void;
  /** Whether the "Paths" circulation overlay toggle is on (drives the preview compile). */
  pathsEnabled(): boolean;
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
}

export function createPreview(opts: PreviewOpts): Preview {
  const { viewport, stage, toolbar, getRooms, getCleanSvg, jumpToOffset, flash, onPathsChange } = opts;

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

  // Floating preview toolbar — pan/zoom + copy + the Paths overlay toggle.
  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>("button");
    const action = btn?.dataset.pz;
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
  };
}
