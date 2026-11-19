/**
 * A lazy load that runs once and is shared: every call before it settles gets the same promise, and
 * every call after it resolves gets the same value. A rejected load is forgotten, so the next call
 * tries again (a chunk that failed on a bad connection loads on the next press). The header
 * actions load their press-only core through one (actions.ts, card 3.18). Pure: no DOM, no
 * network of its own (`playground/test/lazy-once.test.ts`).
 */
export function lazyOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load().catch((err: unknown) => {
      pending = undefined;
      throw err;
    }));
}

/**
 * Whether the browser asks to spare data (Save-Data, or a 2g connection): the playground then
 * fetches nothing ahead of a use (ruling MP-D4, as main.ts's idle import).
 */
export function sparesData(nav: Navigator): boolean {
  const connection = (nav as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connection?.saveData === true || /^(?:slow-)?2g$/.test(connection?.effectiveType ?? "");
}
