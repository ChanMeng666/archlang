/**
 * Every built-in element kind answers every hand-written kind set explicitly (EH1.2).
 *
 * `src/elements/facets.ts` `KIND_FACETS` is one row per kind; the sets outside the registry are
 * built from it (`CROPPED`, `SHELL_KINDS`, `STACKED_KINDS`, `UNPROJECTED_KINDS`, `OPENING_KINDS`)
 * or held to it here (`VERTICAL_KINDS`, `STYLE_KEYS`, `DROPPED_WORDS`, `KEYWORDS.element`). Both
 * sides are derived: the kinds come from `BUILTIN_DEFS`, the members from the sets themselves. A
 * new kind fails here, naming the file and the kind, until its row is written. The checklist of
 * every place a kind registers is `docs/agents/new-element.md`.
 */

import { describe, expect, it } from "vitest";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { KIND_FACETS, type KindFacets, kindsWith } from "../src/elements/facets.js";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { VERTICAL_KINDS } from "../src/vertical.js";
import { STYLE_KEYS } from "../src/theme.js";
import { UNPROJECTED_KINDS } from "../src/plan-json.js";
import { DROPPED_WORDS } from "../src/cli/serialize.js";

const KINDS = BUILTIN_DEFS.map((d) => String(d.kind));
const rowOf = (kind: string): Partial<KindFacets> | undefined =>
  (KIND_FACETS as Record<string, KindFacets | undefined>)[kind];

/** The file that reads each facet, for the failure message. A facet with no entry fails below. */
const READER: Record<keyof KindFacets, string> = {
  cropped: "src/cli/review.ts CROPPED",
  shell: "src/furnish.ts SHELL_KINDS",
  stacked: "src/keep.ts STACKED_KINDS",
  unprojected: "src/plan-json.ts UNPROJECTED_KINDS",
  opening: "src/plan-json.ts OPENING_KINDS",
  vertical: "src/vertical.ts VERTICAL_KINDS",
  styled: "src/theme.ts STYLE_KEYS",
  label: "src/scene-build.ts elementLabelOf",
};

describe("element facets (src/elements/facets.ts)", () => {
  it("KIND_FACETS has exactly one row per BUILTIN_DEFS kind, in registration order", () => {
    expect(Object.keys(KIND_FACETS), "src/elements/facets.ts KIND_FACETS rows vs BUILTIN_DEFS kinds").toEqual(KINDS);
  });

  it("every facet in the table names the file that reads it", () => {
    const facets = new Set(Object.values(KIND_FACETS).flatMap((row) => Object.keys(row)));
    expect(
      [...facets].filter((f) => !(f in READER)),
      "facets with no READER entry in this test",
    ).toEqual([]);
  });

  for (const facet of Object.keys(READER) as (keyof KindFacets)[]) {
    it(`every kind answers \`${facet}\` explicitly (${READER[facet]})`, () => {
      const want = facet === "label" ? ["object", "string"] : ["boolean"];
      const missing = KINDS.filter((k) => !want.includes(typeof rowOf(k)?.[facet]));
      expect(missing, `${READER[facet]}: kinds with no explicit \`${facet}\` in KIND_FACETS`).toEqual([]);
    });
  }

  // Today's members of every set BUILT from the table, pinned as literals: the rows above only
  // prove each kind answers, not that it answers right, so a flipped flag would pass them.
  const CHANGED = "a changed facet is a behaviour change: say why in the PR";
  it("the sets built from KIND_FACETS have today's members", () => {
    expect(kindsWith("cropped"), `src/cli/review.ts CROPPED: ${CHANGED}`).toEqual([
      "door",
      "window",
      "opening",
      "furniture",
    ]);
    expect(kindsWith("shell"), `src/furnish.ts SHELL_KINDS: ${CHANGED}`).toEqual([
      "wall",
      "room",
      "door",
      "window",
      "opening",
    ]);
    expect(kindsWith("stacked"), `src/keep.ts STACKED_KINDS: ${CHANGED}`).toEqual([
      "room",
      "stair",
      "elevator",
      "escalator",
      "void",
    ]);
    expect([...UNPROJECTED_KINDS], `src/plan-json.ts UNPROJECTED_KINDS (in order): ${CHANGED}`).toEqual([
      "stair",
      "elevator",
      "escalator",
      "roof",
      "void",
      "outdoor",
      "fence",
    ]);
    expect(kindsWith("opening"), `src/plan-json.ts OPENING_KINDS: ${CHANGED}`).toEqual(["door", "window", "opening"]);
    const labels = Object.fromEntries(KINDS.flatMap((k) => (rowOf(k)?.label ? [[k, rowOf(k)?.label]] : [])));
    expect(labels, `src/scene-build.ts elementLabelOf fallback: ${CHANGED}`).toEqual({
      furniture: "category",
      outdoor: "surface",
    });
  });

  it("src/plan-json.ts UNPROJECTED_KINDS is the table's `unprojected` kinds, in order", () => {
    expect([...UNPROJECTED_KINDS]).toEqual(KINDS.filter((k) => rowOf(k)?.unprojected === true));
  });

  it("src/cli/serialize.ts DROPPED_WORDS words every unprojected kind", () => {
    const missing = kindsWith("unprojected").filter((k) => !(k in DROPPED_WORDS));
    expect(missing, "src/cli/serialize.ts DROPPED_WORDS: unprojected kinds with no words").toEqual([]);
  });

  it("src/vertical.ts VERTICAL_KINDS is the table's `vertical` kinds, in order", () => {
    expect([...VERTICAL_KINDS], "src/vertical.ts VERTICAL_KINDS vs KIND_FACETS.vertical").toEqual(
      KINDS.filter((k) => rowOf(k)?.vertical === true),
    );
  });

  it("src/theme.ts STYLE_KEYS has a block for exactly the table's `styled` kinds", () => {
    const styled = new Set(Object.keys(STYLE_KEYS));
    const wrong = KINDS.filter((k) => styled.has(k) !== (rowOf(k)?.styled === true));
    expect(wrong, "src/theme.ts STYLE_KEYS: kinds whose membership disagrees with KIND_FACETS.styled").toEqual([]);
    expect(
      [...styled].filter((k) => !KINDS.includes(k)),
      "src/theme.ts STYLE_KEYS: blocks for no kind",
    ).toEqual([]);
  });

  it("src/grammar/tokens.ts KEYWORDS.element lists every def's keyword", () => {
    const words = new Set<string>(KEYWORDS.element);
    const missing = BUILTIN_DEFS.filter((d) => !words.has(d.keyword)).map((d) => String(d.kind));
    expect(missing, "src/grammar/tokens.ts KEYWORDS.element: kinds whose keyword is missing").toEqual([]);
  });
});
