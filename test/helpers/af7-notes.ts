/**
 * The related notes card AF7 added (RM-D69), and their removal: the evidence, pinned in the repo,
 * that each digest row AF7 re-measured moved by those notes and by nothing else. Each re-measured
 * table keeps `main`'s digest beside the new one and asserts that its own digest body, run through
 * {@link af7StrippedApi} (or {@link withoutAf7RelatedText} for `validate --json`), gives `main`'s
 * digest back.
 *
 * A note is recognised by its wording, which AF7 owns: "`<id>` placed here" (`src/keep.ts`
 * `placedSpans`, where `<id>` is an instance's path for an element of a `place`d instance, and an
 * unplaced room's absolute reference in `src/layout.ts`), "`<id>` placed
 * <dir> `<ref>` here" (`src/layout.ts` `placedNote`) and "the other room placed here"
 * (`src/ir/checks.ts`). AF1's notes ("placed here", "in instance "n1" placed here", "first declared
 * here", …) never match, so they are kept.
 */

/** The wording of an AF7 note, exactly. */
export const AF7_NOTE =
  /^(?:`[^`]*` placed (?:here|(?:right-of|left-of|below|above) `[^`]*` here)|the other room placed here)$/;

const isAf7 = (x: unknown): boolean =>
  typeof x === "object" && x !== null && AF7_NOTE.test(String((x as { message?: unknown }).message ?? ""));

/**
 * `v` with every AF7 note removed from each `relatedSpans` (a `Diagnostic`) and `related` (its JSON
 * projection) array, and the key itself removed when no note is left. Every other byte, key order
 * included, is kept: the value is rebuilt by `JSON.stringify`, as every digest serialises it.
 */
export function withoutAf7Notes<T>(v: T): T {
  if (v === undefined) return v;
  return JSON.parse(
    JSON.stringify(v, (_key, value: unknown) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
      const o = value as Record<string, unknown>;
      if (!Array.isArray(o.relatedSpans) && !Array.isArray(o.related)) return value;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        if ((k === "relatedSpans" || k === "related") && Array.isArray(x)) {
          const kept = x.filter((r) => !isAf7(r));
          if (kept.length > 0) out[k] = kept;
        } else out[k] = x;
      }
      return out;
    }),
  ) as T;
}

/** The compiler surfaces a digest body reads, as {@link af7StrippedApi} wraps them. */
interface Surfaces {
  compile: (src: string, opts?: never) => { diagnostics: unknown };
  describe: (src: string, opts?: never) => unknown;
}

/**
 * `api` with AF7's notes taken out of `compile().diagnostics` and `describe()` (which carries the
 * diagnostics), and every other member (`lint`, a law's `stepsOf`, `overlaySvgs`, …) as it is: the
 * SVG, the scene, `lint()` and the step count are not touched, so a row this gives `main`'s digest
 * for moved by the notes alone.
 */
export function af7StrippedApi<A>(api: A): A {
  const a = api as unknown as Surfaces;
  return {
    ...api,
    compile: (src: string, opts?: never) => {
      const out = a.compile(src, opts);
      return { ...out, diagnostics: withoutAf7Notes(out.diagnostics) };
    },
    describe: (src: string, opts?: never) => withoutAf7Notes(a.describe(src, opts)),
  } as A;
}

/**
 * `validate --json` stdout without AF7's `related` arrays, byte for byte: the key, its array and the
 * comma before it. Only an array whose every entry is an AF7 note is removed; an array holding any
 * other note throws, so this can never hide one. The closing bracket is the first line indented
 * exactly as the key, found by `indexOf` (never a lazy regex over compiler output).
 */
export function withoutAf7RelatedText(stdout: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const at = stdout.indexOf(`"related": [\n`, from);
    if (at < 0) return out + stdout.slice(from);
    const lineStart = stdout.lastIndexOf("\n", at) + 1;
    const indent = stdout.slice(lineStart, at);
    const close = stdout.indexOf(`\n${indent}]`, at);
    if (!/^ +$/.test(indent) || close < 0 || stdout.slice(lineStart - 2, lineStart) !== ",\n")
      throw new Error(`without AF7 related: an unexpected "related" at byte ${at}`);
    const entries = JSON.parse(stdout.slice(at + `"related": `.length, close + 1 + indent.length + 1)) as unknown[];
    if (!entries.every(isAf7)) throw new Error(`without AF7 related: a note AF7 did not add at byte ${at}`);
    out += stdout.slice(from, lineStart - 2);
    from = close + 1 + indent.length + 1;
  }
}
