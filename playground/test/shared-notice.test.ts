import { describe, expect, it } from "vitest";
import {
  isBundledExample,
  SHARED_PLAN_NOTICE,
  SHARED_PLAN_NOTICE_SHORT,
  shouldShowSharedNotice,
} from "../src/shared-notice.js";

/**
 * The shared-plan notice's decision, on its own.
 *
 * What is actually at stake is a judgement about ATTRIBUTION, and it has two failure
 * directions that are both bad and neither of which a rendering test would show. Too
 * eager and every stock-example permalink the README and docs mint carries a warning
 * about content we wrote ourselves — which is how a notice becomes furniture nobody
 * reads. Too lax and a crafted plan (the reason this exists: a `#z=` payload compiles
 * to an SVG whose labels can say anything at all) is drawn on our page with nothing
 * saying where the words came from.
 *
 * The predicate takes its `sources` as an argument, so this file asserts the rule
 * without pulling in the `?raw` example graph — and so the embed page, which bundles
 * exactly one plan, can apply the same rule to its own smaller set.
 */
const EXAMPLE_A = `plan "A" {\n  units mm\n  room at (0,0) size 4000x3000 label "Living"\n}`;
const EXAMPLE_B = `plan "B" {\n  units mm\n  room at (0,0) size 5000x3000 label "Studio"\n}`;
const BUNDLED = [EXAMPLE_A, EXAMPLE_B];

/** The shape of the thing the notice exists for: a label that reads like chrome. */
const CRAFTED = `plan "X" {\n  units mm\n  room at (0,0) size 4000x3000 label "Session expired — sign in again"\n}`;

describe("isBundledExample", () => {
  it("accepts a byte-identical bundled source", () => {
    expect(isBundledExample(EXAMPLE_A, BUNDLED)).toBe(true);
    expect(isBundledExample(EXAMPLE_B, BUNDLED)).toBe(true);
  });

  it("rejects a plan nobody bundled", () => {
    expect(isBundledExample(CRAFTED, BUNDLED)).toBe(false);
  });

  it("is byte equality, not a resemblance — one changed character is somebody's edit", () => {
    // A permalink minted from a preset round-trips exactly (the presets are `?raw`
    // imports of the shipped files), so ANY difference means a human touched it.
    expect(isBundledExample(`${EXAMPLE_A} `, BUNDLED)).toBe(false);
    expect(isBundledExample(EXAMPLE_A.replace("Living", "Livinq"), BUNDLED)).toBe(false);
    expect(isBundledExample(EXAMPLE_A.replace(/\n/g, "\r\n"), BUNDLED)).toBe(false);
  });

  it("rejects everything when nothing is bundled", () => {
    expect(isBundledExample(EXAMPLE_A, [])).toBe(false);
  });
});

describe("shouldShowSharedNotice", () => {
  it("shows for a shared plan that is not a bundled example", () => {
    expect(shouldShowSharedNotice(CRAFTED, BUNDLED)).toBe(true);
  });

  it("stays silent for a permalink to a bundled example", () => {
    expect(shouldShowSharedNotice(EXAMPLE_A, BUNDLED)).toBe(false);
  });

  it("stays silent when there is no hash at all", () => {
    // `srcFromHash()` returns null both for a hash-less visit and for a payload it
    // could not decode. Neither put third-party text on the screen: the undecodable
    // one falls back to the default example, so there is nothing to attribute.
    expect(shouldShowSharedNotice(null, BUNDLED)).toBe(false);
  });

  it("shows for a shared EMPTY document — an empty string is still somebody's link", () => {
    // Guards the `!== null` test against being written as a truthiness check, which
    // would silently take the no-hash branch for `""`.
    expect(shouldShowSharedNotice("", BUNDLED)).toBe(true);
  });
});

describe("the notice text", () => {
  it("names the source of the words and disclaims authorship", () => {
    // The sentence is the whole mitigation — it is what turns a drawing that reads
    // like a browser warning back into a drawing. Pinned so a later copy-edit is a
    // deliberate act, not a drive-by.
    expect(SHARED_PLAN_NOTICE).toBe(
      "This plan was compiled from a shared link. Its text and labels were written by whoever shared it, not by ArchLang.",
    );
  });

  it("the embed's short variant still makes BOTH claims", () => {
    // Shortened, never truncated: the embed strip used to clip the long sentence
    // with an ellipsis, which cut off "not by ArchLang" — the half that does the
    // work. Whoever shortens this further has to keep both halves.
    expect(SHARED_PLAN_NOTICE_SHORT).toBe(
      "Shared link — this plan's labels were written by whoever shared it, not by ArchLang.",
    );
    expect(SHARED_PLAN_NOTICE_SHORT).toContain("whoever shared it");
    expect(SHARED_PLAN_NOTICE_SHORT).toContain("not by ArchLang");
    // One line in a 720px iframe is the constraint it exists to satisfy.
    expect(SHARED_PLAN_NOTICE_SHORT.length).toBeLessThan(SHARED_PLAN_NOTICE.length);
  });
});
