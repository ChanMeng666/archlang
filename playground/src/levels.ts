/**
 * The storey-switcher arithmetic — which page of a multi-storey plan the preview is
 * showing, what its button says, and what a download of it is called.
 *
 * Pure and DOM-free on purpose, the way `pan-zoom.ts`'s geometry and `share.ts`'s codec
 * are: everything here is exercised by `playground/test/levels.test.ts` in Node, so the
 * selection rules are proved without a browser. `preview.ts` owns the buttons and
 * `main.ts` owns the state; this module owns only the answers.
 *
 * It deliberately imports NOTHING — not even the core's `CompilePage` type. The whole
 * input is `{ level, name? }`, which keeps the module compilable in both the playground's
 * program and the root one (`test/level-filename-lockstep.test.ts` imports it), and keeps
 * a `?raw`/bundler concern out of a file that is just arithmetic.
 */

/** The part of the core's `CompilePage` the selector needs: a storey and its name. */
export interface LevelPage {
  /** The authored storey number (integer; 0 and negative are legal — a basement). */
  level: number;
  /** The storey's name (`level 1 "Ground floor"`), when the source gave one. */
  name?: string;
}

/**
 * The page to draw: the selected storey, else the LOWEST one.
 *
 * `pages` is `undefined` for a single-storey plan — the core omits the key entirely —
 * and this returns `undefined` for it, which is the signal to leave `compile()`'s own
 * `svg`/`scene` alone and hide the control. The `?? pages[0]` fallback matters beyond
 * first load: editing a 3-storey plan down to 2 while level 3 is selected must land on a
 * real page rather than a blank preview.
 */
export function selectPage<T extends LevelPage>(
  pages: readonly T[] | undefined,
  selected: number | null,
): T | undefined {
  if (!pages || pages.length === 0) return undefined;
  if (selected !== null) {
    const want = pages.find((p) => p.level === selected);
    if (want) return want;
  }
  return pages[0];
}

/** The compact button face — `L1`, `L-1` for a basement. The name goes in the title. */
export function levelButtonLabel(page: LevelPage): string {
  return `L${page.level}`;
}

/**
 * The full storey name for a `title`/`aria-label`, in the source's own vocabulary:
 * `level 1 "Ground floor"`, or just `level 1` when the plan named no storey. Quoting it
 * the way the language does is the point — the label is a pointer back into the source.
 */
export function levelButtonTitle(page: LevelPage): string {
  return page.name === undefined ? `level ${page.level}` : `level ${page.level} "${page.name}"`;
}

/**
 * The per-storey download name — `floorplan.svg` becomes `floorplan.L3.svg`.
 *
 * This is the CLI's own scheme, and it is one scheme on purpose: a plan exported from
 * the playground and the same plan run through `arch compile -o floorplan.svg` must
 * produce files with the same names, so a reader cannot be looking at `floorplan-3.svg`
 * in one place and `floorplan.L3.svg` in the other. The rule lives in
 * `src/cli/io.ts`'s `levelTarget`, which is Node-only (it is part of the CLI's path
 * layer), so this is a deliberate MIRROR rather than an import —
 * `test/level-filename-lockstep.test.ts` welds the two together so the copy cannot drift.
 *
 * `null` means "no storey selected" (a single-storey plan): the name is returned
 * untouched, which is what keeps every existing download byte-for-byte as it was.
 */
export function levelFileName(target: string, level: number | null): string {
  if (level === null) return target;
  const i = target.lastIndexOf(".");
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  // No extension (or the only dot is in a directory name) → just append the suffix.
  if (i <= slash) return `${target}.L${level}`;
  return `${target.slice(0, i)}.L${level}${target.slice(i)}`;
}
