/**
 * The two leaf helpers the per-kind summary builders share: {@link r2} (round to 2 decimals) and
 * {@link instanceOf} (the spreadable instance stamp). Moved verbatim from `src/describe.ts`.
 *
 * Pure; imports nothing at runtime.
 */

/** Round to 2 decimals, deterministically (avoids float drift in output). */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

export function instanceOf(e: { _instance?: string; _component?: string }): {
  instance?: string;
  component?: string;
} {
  return e._instance === undefined ? {} : { instance: e._instance, component: e._component };
}
