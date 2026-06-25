/**
 * The `World` seam — the compiler's single window onto its environment.
 *
 * `compile()` is pure, synchronous, and isomorphic: it must run identically in
 * Node, the browser, and tests. Anything environmental — reading an imported
 * `.arch` file, asking for the current time — would break that, so it all flows
 * through a `World` the caller supplies:
 *
 *   - **Node** builds one over `fs` (see `makeNodeWorld` in `cli.ts`);
 *   - the **browser** passes a virtual map ({@link makeVirtualWorld});
 *   - **tests** inject a frozen World (a fixed file map + a fixed `now`) so output
 *     stays deterministic.
 *
 * When no World is supplied, {@link NULL_WORLD} is used: `read` returns `null`
 * (no module resolves) and `now` is absent. A plan with no imports therefore
 * compiles byte-identically whether or not a World is present.
 */

export interface World {
  /** Resolve a (already canonicalized) module path to its source, or `null` if absent. */
  read(path: string): string | null;
  /** The current time, when the caller wants time-dependent output to be injectable. */
  now?(): Date;
}

/** The default World: nothing readable, no clock. Keeps import-free compiles pure. */
export const NULL_WORLD: World = { read: () => null };

/**
 * A World backed by an in-memory `{ path: source }` map — the browser/test path.
 * Lookup is exact on the given keys, with a leading `./` tolerated, so callers
 * can register `"lib/furniture.arch"` and import `"./lib/furniture.arch"`. Path
 * canonicalization (relative joins, `@local/…` specs) is the importer's job; this
 * is a plain, deterministic byte store.
 */
export function makeVirtualWorld(files: Record<string, string>, now?: () => Date): World {
  const map = new Map(Object.entries(files));
  const strip = (p: string): string => (p.startsWith("./") ? p.slice(2) : p);
  return {
    read: (p) => map.get(p) ?? map.get(strip(p)) ?? null,
    ...(now ? { now } : {}),
  };
}
