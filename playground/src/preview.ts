/**
 * The SVG preview: the pan/zoom controller, the SVG-into-stage display, the
 * floating toolbar (zoom / fit / fullscreen and the Paths layer; copying and downloading the drawing
 * are Share → Export since card PG4, ruling PG-D5), and the hover-facts +
 * click-to-source interactions. Owns everything inside `.pz-viewport` so main.ts
 * only has to hand it each freshly compiled SVG.
 */
import { createPanZoom } from "./pan-zoom.js";
import { mountInteract } from "./interact.js";
import { mountRoomCard } from "./room-card.js";
import { showSvgInStage, sizeFromViewBox } from "./viewer.js";
import type { RoomSummary, SceneSummary } from "archlang";

export interface Preview {
  /** Inject a compiled SVG; `refit` re-centres, else preserves the current view. */
  show(svg: string, refit: boolean): void;
  /**
   * Take over the drawing built into the page (`svg[data-prerendered]`, scripts/gen-static.mjs):
   * size it from its viewBox and fit it, so it pans and zooms before the compiler has loaded.
   * False when the stage holds no such drawing.
   */
  adopt(): boolean;
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
  /** describe() of the storey on screen, for a room's facts card. */
  getSummary: () => SceneSummary | null;
  /** Whether the editor is open (a room's card then offers "Jump to source"). */
  isEditing: () => boolean;
  /** Move the editor caret to a source byte offset (click-to-source). */
  jumpToOffset: (offset: number) => void;
  /** Re-render the preview when the "Paths" overlay toggle flips. */
  onPathsChange: () => void;
}

export function createPreview(opts: PreviewOpts): Preview {
  const { viewport, stage, toolbar, getRooms, getSummary, isEditing, jumpToOffset, onPathsChange } = opts;

  // Pan/zoom controller for the preview (created once; survives every re-render).
  const pz = createPanZoom(viewport, stage);

  // "Paths" circulation overlay — off by default; a diagnostic aid shown in the
  // preview only (exports re-compile without it, so downloads stay clean).
  let pathsOn = false;

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else viewport.requestFullscreen?.();
  }

  // Floating preview toolbar — pan/zoom + the Paths overlay toggle.
  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>("button");
    const action = btn?.dataset.pz;
    if (action === "in") pz.zoomIn();
    else if (action === "out") pz.zoomOut();
    else if (action === "fit") pz.fit();
    else if (action === "full") toggleFullscreen();
    else if (action === "paths") {
      pathsOn = !pathsOn;
      btn?.classList.toggle("active", pathsOn);
      btn?.setAttribute("aria-pressed", String(pathsOn));
      onPathsChange();
    }
  });

  // Preview interactions: hover a room for facts (C2), click it for its card, click any element
  // to jump the editor caret to its source (C3, via the annotate data-span attributes).
  const card = mountRoomCard({ viewport, stage, getSummary, isEditing, jumpToOffset });
  mountInteract({ viewport, stage, getRooms, jumpToOffset, onRoomClick: (room) => card.show(room) });

  return {
    show(svg, refit) {
      showSvgInStage(stage, pz, svg, refit);
      // A new plan (re-fitted) closes the card; a recompile of this one re-reads it.
      if (refit) card.close();
      else card.refresh();
    },
    fit: () => pz.fit(),
    pathsEnabled: () => pathsOn,
    adopt() {
      const el = stage.querySelector("svg[data-prerendered]");
      if (!el) return false;
      // The build-time fit (panels.css) gives way to the pan/zoom transform, which fits the
      // same box the same way (FIT_PAD), so the drawing does not move.
      el.removeAttribute("data-prerendered");
      el.removeAttribute("style");
      const { w, h } = sizeFromViewBox(el.getAttribute("viewBox"));
      el.setAttribute("width", String(w));
      el.setAttribute("height", String(h));
      pz.setContent(w, h, true);
      return true;
    },
  };
}
