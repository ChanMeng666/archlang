/**
 * The built-in element definitions, as a flat array in canonical order.
 *
 * This is a leaf module: it imports the element modules (which import only
 * *types* from `registry.ts`), so `registry.ts` can import this to assemble the
 * default {@link Registry} without forming a runtime import cycle. Registration
 * order is canonical — it drives id assignment and resolve ordering (walls
 * first, so openings can host against them). To add a built-in: write one module
 * and add it to this array.
 */

import type { ElementDef } from "../registry.js";
import { wall } from "./wall.js";
import { room } from "./room.js";
import { door } from "./door.js";
import { windowEl } from "./window.js";
import { opening } from "./opening.js";
import { furniture } from "./furniture.js";
import { dim } from "./dim.js";
import { column } from "./column.js";
import { stair } from "./stair.js";
import { elevator } from "./elevator.js";
import { escalator } from "./escalator.js";
import { roof } from "./roof.js";
import { voidEl } from "./void.js";
import { outdoor } from "./outdoor.js";
import { fence } from "./fence.js";

/** Built-in element defs, in canonical (registration) order. */
export const BUILTIN_DEFS: readonly ElementDef[] = [
  wall,
  room,
  door,
  windowEl,
  opening,
  furniture,
  dim,
  column,
  stair,
  elevator,
  escalator,
  // `roof` resolves LAST of the ring-reading elements on purpose: its `overhang` sugar
  // offsets a wall ring, and registry order is what guarantees every wall is already
  // resolved when it runs (the same contract openings host against).
  roof,
  voidEl,
  // v1.31, appended at the END — `KEYWORDS.element` must equal this list's keywords
  // element for element AND in order (`test/element-keyword-drift.test.ts`). Neither
  // reads a wall, so neither needs to sit before or after `roof`; the end is simply
  // where a new element goes.
  outdoor,
  fence,
];
