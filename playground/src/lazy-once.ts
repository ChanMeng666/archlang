/**
 * A lazy load that runs once and is shared: every call before it settles gets the same promise, and
 * every call after it resolves gets the same value. A rejected load is forgotten, so the next call
 * tries again, which retries the chunk on the next press, except where the engine caches a failed
 * module fetch, as WebKit does for the document's life (`.claude/rules/playground-e2e.md`). The
 * header actions load their press-only core through one (actions.ts, card 3.18). Pure: no DOM, no
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
