/**
 * Which hand-written kind sets each built-in element kind belongs to, one row per kind.
 *
 * Code outside the registry that treats some kinds differently from others used to keep its
 * own list of kind literals (`new Set(["door", "window", …])`), so a new element was silently
 * left out of every one of them. Here every kind answers every question explicitly: the
 * `satisfies Record<ElementKind, KindFacets>` makes `tsc` fail on a kind with no row, and
 * `test/element-facets.test.ts` fails on a `BUILTIN_DEFS` kind the table does not list. The
 * sets the compiler reads are built from this table ({@link kindsWith}), in this table's key
 * order, which is `BUILTIN_DEFS` order. The checklist of every place a new kind registers is
 * `docs/agents/new-element.md`.
 *
 * A leaf module: it imports only types, so any module may read it without an import cycle.
 */

import type { ElementKind, Statement } from "../ast.js";

/** One kind's answers. Each `true` is membership of the set the field names. */
export interface KindFacets {
  /** `src/cli/review.ts` `CROPPED`: a flagged mark of this kind gets a close-up tile. */
  cropped: boolean;
  /** `src/furnish.ts` `SHELL_KINDS`: inserted furniture goes after the last of these. */
  shell: boolean;
  /** `src/keep.ts` `STACKED_KINDS`: `keep stacked` can name an element of this kind. */
  stacked: boolean;
  /** `src/plan-json.ts` `UNPROJECTED_KINDS`: Plan JSON has no row for it (a dropped clause). */
  unprojected: boolean;
  /** `src/plan-json.ts` `OPENING_KINDS`: a Plan JSON `openings[]` row's `kind`. */
  opening: boolean;
  /** `src/vertical.ts` `VERTICAL_KINDS`: vertical circulation (checked by the test, not built). */
  vertical: boolean;
  /** `src/theme.ts` `STYLE_KEYS`: `style <kind> { … }` accepts it (checked by the test, not built). */
  styled: boolean;
  /** `src/scene-build.ts` `elementLabelOf`: the field naming an unlabelled element, if any. */
  label: "category" | "surface" | null;
}

// biome-ignore format: one row per kind, every field written, reads as a table.
/** Every built-in kind's facets, in `BUILTIN_DEFS` order. Every field is written on every row. */
export const KIND_FACETS = {
  wall:      { cropped: false, shell: true,  stacked: false, unprojected: false, opening: false, vertical: false, styled: true,  label: null },
  room:      { cropped: false, shell: true,  stacked: true,  unprojected: false, opening: false, vertical: false, styled: true,  label: null },
  door:      { cropped: true,  shell: true,  stacked: false, unprojected: false, opening: true,  vertical: false, styled: true,  label: null },
  window:    { cropped: true,  shell: true,  stacked: false, unprojected: false, opening: true,  vertical: false, styled: true,  label: null },
  opening:   { cropped: true,  shell: true,  stacked: false, unprojected: false, opening: true,  vertical: false, styled: false, label: null },
  furniture: { cropped: true,  shell: false, stacked: false, unprojected: false, opening: false, vertical: false, styled: true,  label: "category" },
  dim:       { cropped: false, shell: false, stacked: false, unprojected: false, opening: false, vertical: false, styled: true,  label: null },
  column:    { cropped: false, shell: false, stacked: false, unprojected: false, opening: false, vertical: false, styled: true,  label: null },
  stair:     { cropped: false, shell: false, stacked: true,  unprojected: true,  opening: false, vertical: true,  styled: true,  label: null },
  elevator:  { cropped: false, shell: false, stacked: true,  unprojected: true,  opening: false, vertical: true,  styled: true,  label: null },
  escalator: { cropped: false, shell: false, stacked: true,  unprojected: true,  opening: false, vertical: true,  styled: true,  label: null },
  roof:      { cropped: false, shell: false, stacked: false, unprojected: true,  opening: false, vertical: false, styled: true,  label: null },
  void:      { cropped: false, shell: false, stacked: true,  unprojected: true,  opening: false, vertical: false, styled: true,  label: null },
  outdoor:   { cropped: false, shell: false, stacked: false, unprojected: true,  opening: false, vertical: false, styled: true,  label: "surface" },
  fence:     { cropped: false, shell: false, stacked: false, unprojected: true,  opening: false, vertical: false, styled: true,  label: null },
  walls:     { cropped: false, shell: false, stacked: false, unprojected: false, opening: false, vertical: false, styled: false, label: null },
} as const satisfies Record<ElementKind, KindFacets>;

/** A yes/no facet of {@link KindFacets}. */
export type KindFlag = { [F in keyof KindFacets]: KindFacets[F] extends boolean ? F : never }[keyof KindFacets];

/** The kinds whose `flag` is `true`, as a literal union. */
export type KindsWith<F extends KindFlag> = {
  [K in ElementKind]: (typeof KIND_FACETS)[K][F] extends true ? K : never;
}[ElementKind];

/** The kinds whose `flag` is `true`, in table (`BUILTIN_DEFS`) order. */
export function kindsWith<F extends KindFlag>(flag: F): readonly KindsWith<F>[] {
  const kinds = Object.keys(KIND_FACETS) as ElementKind[];
  return kinds.filter((k) => (KIND_FACETS[k] as KindFacets)[flag]) as KindsWith<F>[];
}

/** A kind's facets, or `undefined` for a kind the table does not know (a plugin's own kind). */
export function facetsOf(kind: string): KindFacets | undefined {
  return Object.hasOwn(KIND_FACETS, kind) ? KIND_FACETS[kind as ElementKind] : undefined;
}

/**
 * The `default` of a `switch` over a {@link Statement}'s kind that must name every element kind
 * (the per-kind dispatch outside the registry, `docs/agents/new-element.md`): it type-checks only
 * while `kind` can no longer be an {@link ElementKind}, so a new kind with no `case` fails `tsc`
 * here. It does nothing at run time; the `default` keeps its own result.
 */
export function nonElementKind(_kind: Exclude<Statement["kind"], ElementKind>): void {
  // Type-level only.
}
