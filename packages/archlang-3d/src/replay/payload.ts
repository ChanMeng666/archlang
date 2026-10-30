/**
 * The replay's data (card A3), browser-safe: `replayPayload(mesh, opts)` is what a replay carries
 * for `mesh`, whether the single-file HTML inlines it (`html.ts`, Node) or the playground's 3D
 * preview tab builds it in the browser (card A5) and mounts it with `mountReplay`.
 */
import type { Mesh3D } from "../mesh/types.js";
import { endElevation } from "./camera.js";
import type { ReplayFacts } from "./strip.js";
import { explodeLifts, type ReplayEvent, storeysOf, timeline } from "./timeline.js";

export interface ReplayNode {
  key: string;
  kind: string;
  part?: string;
  /** The combined view's exploded storeys: how far (mm) the node is lifted; absent = 0. */
  lift?: number;
  /** Flat `[x, y, z, …]` in micrometres, exporters' axes (X plan x, Y up, Z plan y). */
  positions: number[];
  indices: number[];
}

export interface ReplayPayload {
  title: string;
  theme: "light" | "dark";
  width: number;
  height: number;
  seconds: number;
  /** The core's own drawing of the plan (light theme) and its viewBox in plan millimetres. */
  svg: string;
  viewBox: [number, number, number, number];
  /** The end camera's elevation in degrees (`endElevation`). */
  elevation: number;
  /** The metrics strip's numbers (card G4); with none, no strip is painted. */
  facts?: ReplayFacts;
  nodes: ReplayNode[];
  events: ReplayEvent[];
}

/** A mounted replay: every frame is `seek(t)`. */
/** The label every surface that shows the preview carries (decision D5's wording). */
export const PREVIEW_LABEL = "Preview — from the separate archlang-3d package. ArchLang itself draws plans.";

export interface ReplayOptions {
  title: string;
  /**
   * The core's drawing of the storey phase 1 draws, light theme: `compile(source).svg` (page 1) for
   * the combined view, the storey's own `compile(source).pages[i].svg` for a storey view.
   */
  svg: string;
  width?: number;
  height?: number;
  seconds?: number;
  /** Exports only: the sites stay light (D11, ADR 0014). */
  theme?: "light" | "dark";
  /** The metrics strip's numbers (`replayFacts`); omit for a replay without the strip (card G4). */
  facts?: ReplayFacts;
}

/** The `viewBox` of an SVG document, in its user units (plan millimetres for the core's drawing). */
export function viewBoxOf(svg: string): [number, number, number, number] {
  const m = /viewBox="([-\d.\s]+)"/.exec(svg);
  const v = (m?.[1] ?? "").trim().split(/\s+/).map(Number);
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) throw new Error("the drawing has no numeric viewBox");
  return v as [number, number, number, number];
}

/**
 * The data a replay HTML carries for `mesh`: pass `viewMesh(mesh, view)` for one view. A mesh of
 * more than one storey is the combined view: its storeys are exploded (`explodeLifts`) and the end
 * camera looks down more steeply (`endElevation`).
 */
export function replayPayload(mesh: Mesh3D, opts: ReplayOptions): ReplayPayload {
  const lifts = explodeLifts(mesh);
  return {
    title: opts.title,
    theme: opts.theme ?? "light",
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    seconds: opts.seconds ?? 15,
    svg: opts.svg,
    viewBox: viewBoxOf(opts.svg),
    elevation: endElevation(storeysOf(mesh).length),
    ...(opts.facts ? { facts: opts.facts } : {}),
    nodes: mesh.nodes
      .filter((n) => !n.hidden)
      .map((n) => {
        const positions: number[] = [];
        const indices: number[] = [];
        for (const s of n.shells) {
          const base = positions.length / 3;
          positions.push(...s.positions);
          for (const i of s.indices) indices.push(base + i);
        }
        const lift = lifts.get(n.level) ?? 0;
        return {
          key: n.key,
          kind: n.kind,
          ...(n.part ? { part: n.part } : {}),
          ...(lift !== 0 ? { lift } : {}),
          positions,
          indices,
        };
      }),
    events: timeline(mesh),
  };
}
