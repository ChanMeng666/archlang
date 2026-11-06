/**
 * The replay's data (card A3), browser-safe: `replayPayload(mesh, opts)` is what a replay carries
 * for `mesh`, whether the single-file HTML inlines it (`html.ts`, Node) or the playground's 3D
 * preview tab builds it in the browser (card A5) and mounts it with `mountReplay`.
 */
import { type FloorFinish, FLOOR_FINISHES, type MaterialSlot, slotGroups } from "../materials.js";
import type { Mesh3D } from "../mesh/types.js";
import { endElevation } from "./camera.js";
import type { ReplayFacts } from "./strip.js";
import { explodeLifts, type ReplayEvent, storeysOf, timeline } from "./timeline.js";

export interface ReplayNode {
  key: string;
  kind: string;
  part?: string;
  /**
   * The combined view's exploded storeys: how far (mm) the node is lifted while the storeys rise;
   * absent = 0. It settles to 0 by the end (`settledLift`).
   */
  lift?: number;
  /** Flat `[x, y, z, …]` in micrometres, exporters' axes (X plan x, Y up, Z plan y). */
  positions: number[];
  indices: number[];
  /**
   * A T0 piece's material slots (visual-assets V1): consecutive runs of `indices`, in order, each
   * drawn in its slot's colour (`materials.ts`; `body` is the kind's own). Absent on every node
   * without a slotted shell, which is then drawn exactly as before.
   */
  groups?: Array<{ slot: MaterialSlot; count: number }>;
  /** A floor's finish (visual-assets V9, `extras.finish`), drawn in its colour; absent on every other node. */
  finish?: FloorFinish;
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

/**
 * The line every surface that shows the preview carries (public-surfaces PS-D12, owner ruling
 * PS-D11, `docs/plans/public-surfaces/3d.md` §2; it replaced decision D5's label). `PREVIEW_LEAD`
 * is its first sentence, which a host may set in bold. The plan's full line adds "You can also
 * download it as a validated GLB." where a surface offers the download.
 *
 * What "checked against the plan" means, as the line says it: every 3D element comes from the
 * plan's elements (each Scene3D record carries the `source` naming its plan element, required by
 * the schema, V-SCH-01 in `check/verify.ts`; the slab and a default roof come from the storey's
 * rooms and walls; V-GLTF-02 holds the GLB's nodes to the Mesh3D's, each named `<kind>:<id>`), and
 * every solid is closed (V-GEO-02, `openEdges` in `check/verify.ts`: every shell closed,
 * consistently wound, of positive volume). `build` writes nothing when a check fails.
 */
export const PREVIEW_LEAD = "Same source, plan and 3D preview.";
export const PREVIEW_LABEL =
  "Same source, plan and 3D preview. The 3D preview is extruded from the same .arch file by the separate archlang-3d package, and checked against the plan: every 3D element comes from the plan's elements, and every solid is closed.";
/**
 * The limits line, always near a 3D view (PS-D12). It states what the package builds today
 * (`3d.md` §3): change it when the package changes.
 */
export const PREVIEW_LIMITS =
  "3D preview: walls, openings, floors, stairs and furniture in flat colours; no pitched roofs yet, and no sections, elevations or BIM.";
/** The page that says what the 3D preview shows and does not (the docs site's `/3d`). */
export const PREVIEW_ABOUT_URL = "https://archlang.uk/3d";

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
 * more than one storey is the combined view: its storeys are exploded (`explodeLifts`) while they
 * rise and come down to their real heights by the end (`stateAt`'s `settle`), and the end camera
 * looks down at 45° (`endElevation`).
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
        const slotted = n.shells.some((s) => s.slot !== undefined);
        // A slotted node's shells go slot by slot (the GLB's primitive order), one index run each.
        const groups = slotted ? slotGroups(n.shells) : [{ slot: "body" as const, shells: n.shells }];
        const runs: Array<{ slot: MaterialSlot; count: number }> = [];
        for (const g of groups) {
          const start = indices.length;
          for (const s of g.shells) {
            const base = positions.length / 3;
            positions.push(...s.positions);
            for (const i of s.indices) indices.push(base + i);
          }
          runs.push({ slot: g.slot, count: indices.length - start });
        }
        const lift = lifts.get(n.level) ?? 0;
        const finish = FLOOR_FINISHES.find((f) => f === n.extras.finish);
        return {
          key: n.key,
          kind: n.kind,
          ...(n.part ? { part: n.part } : {}),
          ...(lift !== 0 ? { lift } : {}),
          positions,
          indices,
          ...(slotted ? { groups: runs } : {}),
          ...(n.kind === "floor" && finish ? { finish } : {}),
        };
      }),
    events: timeline(mesh),
  };
}
