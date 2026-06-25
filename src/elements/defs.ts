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
import { furniture } from "./furniture.js";
import { dim } from "./dim.js";
import { column } from "./column.js";

/** Built-in element defs, in canonical (registration) order. */
export const BUILTIN_DEFS: readonly ElementDef[] = [wall, room, door, windowEl, furniture, dim, column];
