/**
 * The digest `test/finish-furnish.test.ts` pins the corpus's `finish` output with — kept out of
 * the test file so a baseline is taken with the very function the test runs (a script can import
 * this module; importing a test file would run its suite).
 *
 * What it covers: the finished `source`, every `changes[]` entry, and every `unresolved` note
 * EXCEPT the partly-furnished ones and the ones on a room outside the furnish table (the first
 * are pinned word for word beside it, the second are held by the `named` law in
 * `test/finish-furnish.test.ts`), for a `--only furnish` run and for a full run. A move in a row
 * means the stage now writes something else, or reports differently a room it could have furnished.
 */

import { createHash } from "node:crypto";
import { finish } from "../src/index.js";
import type { World } from "../src/world.js";

/** The words every partly-furnished note carries, and no other note does. */
export const PARTLY = "holds furniture but not every piece its use requires";

export function finishDigest(src: string, world: World): string {
  const runs = [finish(src, { world, only: "furnish" }), finish(src, { world })].map((r) => ({
    source: r.source,
    changed: r.changed,
    changes: r.changes,
    unresolved: r.unresolved.filter((u) => !u.reason.includes(PARTLY) && u.scope === undefined),
  }));
  return createHash("sha256").update(JSON.stringify(runs)).digest("hex");
}
