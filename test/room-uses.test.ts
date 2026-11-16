/** room uses. */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, compile } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Room `uses` tags — the keystone that makes room classification *authored intent*
 * instead of a label-regex guess. Explicit `uses` win; untagged rooms keep the old
 * regex behaviour (so existing plans are byte-identical and lint is unchanged).
 */

const wrap = (room: string) =>
  `plan "P" {\n  units mm\n  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  ${room}\n}`;

describe("room uses", () => {
  it("surfaces explicit uses (a multi-use studio room) in describe()", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Open Plan" uses living kitchen`));
    expect(s.ok).toBe(true);
    expect(s.rooms[0]!.uses).toEqual(["living", "kitchen"]);
  });

  it("infers uses from the label when untagged (unchanged behaviour)", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Bedroom 1"`));
    expect(s.rooms[0]!.uses).toEqual(["bedroom"]);
  });

  it("lets an explicit use OVERRIDE the label-regex guess", () => {
    // Labelled "Den" (no regex hit) but declared a bedroom → must get the bedroom
    // rule (W_BEDROOM_NO_WINDOW), which a label-only classifier would miss.
    const warnings = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den" uses bedroom`));
    expect(warnings.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(true);
    // Without the tag, "Den" is not a bedroom → no such warning.
    const untagged = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den"`));
    expect(untagged.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(false);
  });

  it("round-trips `uses` through the formatter", () => {
    const src = wrap(`room id=r at (0,0) size 4000x3000 label "Open" uses living kitchen`);
    expect(format(src)).toContain("uses living kitchen");
    // Formatting is idempotent.
    expect(format(format(src))).toBe(format(src));
  });

  it("reports a clear error for an unknown use value (no crash)", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses lounge`), { noCache: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/room uses/i);
  });

  // Backlog U.6: an outdoor word after `uses` names the element that draws it.
  it.each([
    ["balcony", "outdoor balcony"],
    ["patio", "outdoor patio"],
    // The language reference draws a terrace as `outdoor balcony … label "Terrace"` (RR.5).
    ["terrace", "outdoor balcony"],
    ["Balcony", "outdoor balcony"],
    ["garden", "outdoor lawn"],
  ])("points `uses %s` at `%s`", (word, hint) => {
    const { diagnostics } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses ${word}`), { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain(`\`${hint}\``);
  });

  it("points a strip room's `uses balcony` at `outdoor balcony` too", () => {
    const src = `plan "P" {\n  units mm\n  strip right at (0,0) gap 0 height 3000 { room id=s1 size 3000 uses balcony }\n}`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain("`outdoor balcony`");
  });

  it("adds no outdoor hint for a word that is not an outdoor surface", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses lounge`), { noCache: true });
    expect(errors[0]!.message).not.toContain("outdoor");
  });

  // Backlog RR.5: the hint also fires on an outdoor word after a valid use.
  it.each([
    ["living balcony", "balcony", "outdoor balcony"],
    ["living dining Terrace", "Terrace", "outdoor balcony"],
    ["bedroom garden", "garden", "outdoor lawn"],
  ])("points `uses %s` at the outdoor surface", (words, word, hint) => {
    const { diagnostics } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses ${words}`), { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain(`"${word}" after "uses" is not a room use`);
    expect(diagnostics[0]!.message).toContain(`\`${hint}\``);
  });

  it("points a strip room's later `uses … balcony` at `outdoor balcony` too", () => {
    const src = `plan "P" {
  units mm
  strip right at (0,0) gap 0 height 3000 { room id=s1 size 3000 uses living balcony }
}`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain("`outdoor balcony`");
  });

  it("names no outdoor kind for a word with no source in the language reference", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses yard`), { noCache: true });
    expect(errors[0]!.message).not.toContain("outdoor");
  });

  it("a valid uses list followed by a clause still compiles", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses living dining label "L"`), {
      noCache: true,
    });
    expect(errors).toEqual([]);
  });
});
