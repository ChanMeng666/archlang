/**
 * The replay's data (card A3), browser-safe: `replayPayload(mesh, opts)` is what a replay carries
 * for `mesh`, whether the single-file HTML inlines it (`html.ts`, Node) or the playground's 3D
 * preview tab builds it in the browser (card A5) and mounts it with `mountReplay`.
 */
import {
  CONTACT_SHADOW,
  contactBandMm,
  type FloorFinish,
  FLOOR_FINISHES,
  type MaterialSlot,
  slotGroups,
} from "../materials.js";
import type { Mesh3D, MeshNode } from "../mesh/types.js";
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
  /**
   * An outdoor surface's or a fence's colour (card RM8.3, `extras.colour`, sRGB `#rrggbb`), the one
   * the GLB writes too; absent on every other node.
   */
  colour?: string;
  /**
   * The width (mm) of the contact shadow the node casts (card RM8.8, `CONTACT_SHADOW`,
   * `shadows.ts`): on a standing wall and a column, a standing piece of furniture, a fence and a
   * stair's stringers. Absent on every node that casts none (a hung piece, a flat one, a door …).
   */
  band?: number;
  /**
   * A standing piece of furniture lower than its band would be (a rug): it casts no contact shadow
   * and its top receives the others' (card RM8.8). Absent on every other node.
   */
  flat?: true;
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
  /**
   * The ground plane's height (card RM8.3, `GROUND_PLANE`): the top of the lowest storey's slab, its
   * floor level, in micrometres. Absent when that storey has no slab: then no ground is drawn.
   */
  ground?: { y: number };
  /**
   * For offline generation only (`renderReplay`'s `supersample`, product-roadmap card RM8.2): each
   * frame is the mean of k × k renders, a whole number from 1 to 4. Absent (1) everywhere else:
   * `replayPayload` never sets it, and a live 3D preview takes one sample a frame. A host that sets
   * it in a live page draws every frame k × k times, outside the viewer's frame-time budget.
   */
  supersample?: number;
  /**
   * `false` draws no contact shadows (card RM8.8): only the frame-time measurement sets it
   * (`e2e/frame-budget.e2e.ts`), to time frames with and without them. Absent: drawn.
   */
  shadows?: false;
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
  "3D preview: walls, openings, floors, stairs, furniture, outdoor surfaces and fences in plain colours; the ground and the soft contact shadows are the viewer's, not part of the building and not in the file; no pitched roofs or balcony railings yet, and no sections, elevations or BIM.";
/** The page that says what the 3D preview shows and does not (the docs site's `/3d`). */
export const PREVIEW_ABOUT_URL = "https://archlang.uk/3d";

/**
 * The words that tell which storey a notice is about in the combined view (card RM8.10): `L2 ·`.
 * One function for the replay HTML and the playground, from the warning's own `level`.
 */
export function noticeLevelLabel(level: number): string {
  return `L${level} ·`;
}

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
  const facts = castFacts(mesh);
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
        const colour = typeof n.extras.colour === "string" ? n.extras.colour : undefined;
        return {
          key: n.key,
          kind: n.kind,
          ...(n.part ? { part: n.part } : {}),
          ...(lift !== 0 ? { lift } : {}),
          positions,
          indices,
          ...(slotted ? { groups: runs } : {}),
          ...(n.kind === "floor" && finish ? { finish } : {}),
          ...((n.kind === "outdoor" || n.kind === "fence") && colour ? { colour } : {}),
          ...bandOf(n, positions, facts),
        };
      }),
    events: timeline(mesh),
    ...groundOf(mesh),
  };
}

/**
 * The contact band a node casts (`ReplayNode.band`, card RM8.8), by `CONTACT_SHADOW`'s rules: a
 * standing wall from its thickness, a column from its smaller side, a standing piece of furniture
 * from the smaller side of its footprint (a T0 piece and a grey box are fitted exactly to it,
 * `test/t0.test.ts`, so its plan extent is the footprint), a fence from its style's post, a stair's
 * stringers as a wall `CONTACT_SHADOW.stairThicknessMm` thick. A hung piece casts none; a standing
 * one lower than its band (a rug) casts none either and is `flat`, so its top receives the others'.
 *
 * Whether a piece is hung comes from its own node (`extras.hung`, written by the mesh builder), and a
 * fence's post from the Mesh3D's ledger (`castFacts`: one row a style, the same on every storey),
 * never from the mesh stage's tables: so the `./browser` entry carries neither the T0 generators nor
 * the site code that reads the core (`test/browser-safety.test.ts`).
 */
function bandOf(n: MeshNode, positions: readonly number[], facts: CastFacts): { band?: number; flat?: true } {
  if (positions.length === 0) return {};
  const side = (): number => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] as number;
      const z = positions[i + 2] as number;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    return Math.min(x1 - x0, z1 - z0) / 1000;
  };
  if (n.kind === "wall" && n.part === undefined) {
    const t = typeof n.extras.thickness_mm === "number" ? n.extras.thickness_mm : side();
    return { band: contactBandMm(CONTACT_SHADOW.wall, t) };
  }
  if (n.kind === "column") return { band: contactBandMm(CONTACT_SHADOW.wall, side()) };
  if (n.kind === "furniture") {
    if (n.extras.hung === true) return {};
    const band = contactBandMm(CONTACT_SHADOW.furniture, side());
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      const y = positions[i] as number;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return hi - lo < band * 1000 ? { flat: true } : { band };
  }
  if (n.kind === "fence") {
    const post = facts.fencePosts.get(String(n.extras.style)) ?? side();
    return { band: contactBandMm(CONTACT_SHADOW.fence, post) };
  }
  if (n.kind === "stair" && n.part === "stringer")
    return { band: contactBandMm(CONTACT_SHADOW.wall, CONTACT_SHADOW.stairThicknessMm) };
  return {};
}

/** What `bandOf` reads from a Mesh3D's ledger. */
interface CastFacts {
  /** Each fence style's post, mm (`fence-profile-default`). */
  fencePosts: Map<string, number>;
}

function castFacts(mesh: Mesh3D): CastFacts {
  const facts: CastFacts = { fencePosts: new Map() };
  const inParens = (field: string): string | undefined => /^[a-z_]+\((.+)\)$/.exec(field)?.[1];
  for (const a of mesh.assumptions) {
    if (a.rule === "fence-profile-default") {
      const style = inParens(a.field);
      const post = (a.value as { post_mm?: unknown } | undefined)?.post_mm;
      if (style !== undefined && typeof post === "number") facts.fencePosts.set(style, post);
    }
  }
  return facts;
}

/**
 * The ground plane's height (`ReplayPayload.ground`): the top of the slab of the storey the Mesh3D's
 * ledger names (`ground-plane-viewer-only`, the plan's lowest storey). A view of another storey on
 * its own (`viewMesh(mesh, n)`, the playground's storey switcher; review R1, S2) draws no ground: at
 * its own floor level the ground would stand an upper floor (and its balcony) on the earth, and at
 * the lowest storey's it would hang the floor in the air over a ground with nothing on it. A Mesh3D
 * without the row (written before card RM8.3) takes its own lowest storey.
 */
function groundOf(mesh: Mesh3D): { ground?: { y: number } } {
  const row = mesh.assumptions.find((a) => a.rule === "ground-plane-viewer-only")?.value as
    | { level?: unknown }
    | undefined;
  const lowest = typeof row?.level === "number" ? row.level : storeysOf(mesh)[0];
  const slab = mesh.nodes.find((n) => n.level === lowest && n.kind === "slab" && !n.hidden);
  if (!slab) return {};
  let y = -Infinity;
  for (const s of slab.shells)
    for (let i = 1; i < s.positions.length; i += 3) y = Math.max(y, s.positions[i] as number);
  return Number.isFinite(y) ? { ground: { y } } : {};
}
