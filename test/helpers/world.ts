/**
 * The one on-disk `World` a test hands the compiler so a plan's `import`s resolve.
 *
 * Replaces the local `worldFor(dir)` copies: the same `read` over `readFileSync(resolve(dir, p))`, `null`
 * for a missing module. 23 definitions went (22 named `worldFor`, one `worldAt`); two stay, on the guard's
 * allow-list or in `keep-weak-law.ts`, because they take a file or build a virtual World. The clock is pinned to the epoch so a plan that stamps the date
 * compiles to the same bytes on every run. For an in-memory `{ path: source }` World use
 * `makeVirtualWorld` from `src/world.ts`.
 *
 * `test/no-duplicate-helpers.test.ts` keeps a new local copy from appearing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { World } from "../../src/world.js";

/** A World that reads modules relative to `dir`, serving `null` for anything it cannot read. */
export function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolve(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}
