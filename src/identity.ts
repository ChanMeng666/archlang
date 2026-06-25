/**
 * Process-local stable identity tokens for cache keying.
 *
 * Plugins (element defs, themes, hatches, backends) and the `World` are objects
 * that contain functions — they are **not** JSON-serializable, so they cannot go
 * into the `compile()` cache key directly. This assigns each object a stable,
 * incrementing integer id the first time it is seen (via a `WeakMap`), so:
 *
 *   - the **same** object reused across compiles → same token → cache **hit**;
 *   - a **different** object (even structurally equal) → distinct token → safe
 *     **miss** (no cross-plugin / cross-world cache bleed).
 *
 * Ids are per-process and never reused; the `WeakMap` lets unreferenced objects
 * be collected. `null`/`undefined` map to `0` so the key shape is stable when an
 * extension input is absent.
 */

const ids = new WeakMap<object, number>();
let next = 1;

/** A stable, process-local id for `o` (0 when absent). Equal objects share a token. */
export function idToken(o: unknown): number {
  if (o === null || o === undefined || (typeof o !== "object" && typeof o !== "function")) {
    return 0;
  }
  const key = o as object;
  let id = ids.get(key);
  if (id === undefined) {
    id = next++;
    ids.set(key, id);
  }
  return id;
}
