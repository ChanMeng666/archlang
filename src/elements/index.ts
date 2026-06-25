/**
 * Element registry assembly. Registration order is canonical: it drives id
 * assignment and resolve ordering (walls first, so openings can host against
 * them). To add an element: write one module and add one `register()` line.
 */

import type { ElementDef } from "../registry.js";
import { wall } from "./wall.js";
import { room } from "./room.js";
import { door } from "./door.js";
import { windowEl } from "./window.js";
import { furniture } from "./furniture.js";
import { dim } from "./dim.js";
import { column } from "./column.js";

/** Defs in canonical (registration) order. */
export const registryOrder: ElementDef[] = [];
/** Lookup by keyword. */
export const registry = new Map<string, ElementDef>();

function register(def: ElementDef): void {
  registry.set(def.keyword, def);
  registryOrder.push(def);
}

register(wall);
register(room);
register(door);
register(windowEl);
register(furniture);
register(dim);
register(column);
