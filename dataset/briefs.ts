/**
 * The authoring split's natural-language briefs + intent contracts.
 *
 * A brief, the golden plan, and the intent contract all descend from ONE ground truth
 * (the {@link PlanModel}), so they cannot drift: the brief enumerates exactly the rooms
 * the model draws, and the intent asserts only what the brief's words license, following
 * the `schemas/intent.schema.json` normative rules — a room count only when the brief
 * ENUMERATES the rooms; an area band ±10% around a number the brief actually states.
 *
 * The templates are deliberately phrased UNLIKE the 26 holdout prompts (the dedup layer
 * enforces it), and nothing is copied from them. `validateIntent(source, intent).ok`
 * must be true for every emitted row — a read-only use of the production intent API (it
 * never touches the eval scorer, `synonyms.ts`, JUDGE_VERSION, or `judge-fixture.json`).
 */

import type { Intent } from "../src/index.js";
import { type Rng, pick } from "./rng.js";
import type { PlanModel, RoomModel } from "./templates.js";

export interface Authoring {
  brief: string;
  intent: Intent;
}

/** Room rectangle area in m² (describe reports the same: size.w × size.h ÷ 1e6). */
const areaM2 = (r: RoomModel): number => (r.size.w * r.size.h) / 1_000_000;
const totalM2 = (plan: PlanModel): number => plan.rooms.reduce((s, r) => s + areaM2(r), 0);

/** A ±10% band around a stated whole-number area, with the licensing phrase. */
function band10(nM2: number, phrase: string): { min: number; max: number; source: string } {
  const n = Math.round(nM2);
  return { min: Math.round(n * 0.9 * 10) / 10, max: Math.round(n * 1.1 * 10) / 10, source: phrase };
}

// ---------------------------------------------------------------------------
// Per-family brief + intent builders.
// ---------------------------------------------------------------------------

function studioAuthoring(plan: PlanModel, rng: Rng): Authoring {
  const total = Math.round(totalM2(plan));
  // Each template pairs its text with the EXACT area phrase it uses, so the intent's
  // `source` quote is verbatim from the brief (the schema's normative citation rule).
  const templates: { text: string; areaPhrase: string }[] = [
    {
      text: `Sketch a single-room studio flat of roughly ${total} square metres. It needs its own street door and one window looking outside.`,
      areaPhrase: `roughly ${total} square metres`,
    },
    {
      text: `I want a compact bedsit — just one open room around ${total} m² in size — fitted with an entrance door and a window on an outer wall.`,
      areaPhrase: `around ${total} m²`,
    },
    {
      text: `Produce a one-room studio close to ${total} square metres, entered by a front door, with daylight from a single window.`,
      areaPhrase: `close to ${total} square metres`,
    },
  ];
  const t = pick(rng, templates);
  const intent: Intent = {
    rooms: 1,
    roomsInclude: [{ concept: "living-room" }],
    totalAreaM2: band10(total, `brief: '${t.areaPhrase}' ±10%`),
  };
  return { brief: t.text, intent };
}

function hallFlatAuthoring(plan: PlanModel, rng: Rng): Authoring {
  const total = Math.round(totalM2(plan));
  // Text + the exact area/adjacency phrases it contains (verbatim `source` quotes).
  const templates: { text: string; areaPhrase: string; adjPhrase: string }[] = [
    {
      text: `Lay out a flat containing four rooms: a living room, one bedroom with a window, a short inner hall, and a study. The whole floor is about ${total} square metres. Reach the bedroom and the study by doors off the hall.`,
      areaPhrase: `about ${total} square metres`,
      adjPhrase: "Reach the bedroom and the study by doors off the hall",
    },
    {
      text: `Design a small apartment made up of a lounge, a single bedroom that gets a window, a modest hall, and a home office — four rooms totalling close to ${total} m². The bedroom and office both connect through the hall.`,
      areaPhrase: `close to ${total} m²`,
      adjPhrase: "The bedroom and office both connect through the hall",
    },
    {
      text: `Plan a home with exactly these four spaces — a sitting room, a bedroom with an outside window, a compact hallway, and a study — coming to roughly ${total} square metres in all, the bedroom and study each opening onto the hall.`,
      areaPhrase: `roughly ${total} square metres`,
      adjPhrase: "the bedroom and study each opening onto the hall",
    },
  ];
  const t = pick(rng, templates);
  const intent: Intent = {
    rooms: 4,
    roomsInclude: [
      { concept: "living-room" },
      { concept: "bedroom", windows: { min: 1 } },
      { concept: "hall" },
      { concept: "study" },
    ],
    totalAreaM2: band10(total, `brief: '${t.areaPhrase}' ±10%`),
    adjacency: {
      requiredEdges: { hall: ["bedroom", "study"] },
      source: `brief: '${t.adjPhrase}'`,
    },
    reachable: true,
  };
  return { brief: t.text, intent };
}

function corridorAuthoring(plan: PlanModel, rng: Rng): Authoring {
  const consulting = plan.rooms.filter((r) => r.uses.includes("office")).length;
  const total = plan.rooms.length; // consulting rooms + 1 corridor
  // Text + the exact adjacency phrase it contains (verbatim `source` quote).
  const templates: { text: string; adjPhrase: string }[] = [
    {
      text: `Set out ${consulting} identical consulting rooms in a row, each with its own door and window, served by one shared corridor running in front of them — ${total} rooms in total, every room reachable from the corridor entrance.`,
      adjPhrase: "served by one shared corridor running in front of them",
    },
    {
      text: `I need a clinic wing of ${consulting} matching treatment rooms side by side off a single access corridor. Counting the corridor that makes ${total} spaces; each room has a window and a door, and you enter at the corridor.`,
      adjPhrase: "side by side off a single access corridor",
    },
    {
      text: `Arrange ${consulting} equal practice rooms along one shared corridor at the front, giving ${total} rooms all told. Each room takes a window and a door onto the corridor, which carries the entrance.`,
      adjPhrase: "a window and a door onto the corridor",
    },
  ];
  const t = pick(rng, templates);
  const intent: Intent = {
    rooms: total,
    roomsInclude: [{ concept: "consulting-room", count: { min: consulting } }, { concept: "corridor" }],
    adjacency: {
      requiredEdges: { corridor: ["consulting-room"] },
      source: `brief: '${t.adjPhrase}'`,
    },
    reachable: true,
  };
  return { brief: t.text, intent };
}

const BUILDERS: Record<string, (plan: PlanModel, rng: Rng) => Authoring> = {
  studio: studioAuthoring,
  "hall-flat": hallFlatAuthoring,
  corridor: corridorAuthoring,
};

/** Build the brief + intent for a plan, keyed off its family. */
export function authoringFor(plan: PlanModel, rng: Rng): Authoring {
  const build = BUILDERS[plan.family];
  if (!build) throw new Error(`no authoring builder for family "${plan.family}"`);
  return build(plan, rng);
}
