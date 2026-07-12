/**
 * `W_ALIAS_MATCH` — the advisory that a room's use was inferred from an indirect
 * alias, plus the shared `matchVocabulary` / `classifyLabelUses` core it rests on.
 */

import { describe, expect, it } from "vitest";
import { applyFixes, describe as describePlan, lint } from "../src/index.js";
import { classifyLabelUses, matchVocabulary, matchesLivingDining, USE_VOCABULARY } from "../src/vocabulary.js";

/** A minimal, resolvable one-room plan with the given label and no authored `uses`. */
const planWith = (label: string, uses = ""): string => `plan "t" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "${label}"${uses ? ` ${uses}` : ""}
  door id=d on exterior at 20% width 900
}`;

const aliasDiags = (src: string) => lint(src).filter((d) => d.code === "W_ALIAS_MATCH");

describe("matchVocabulary — canonical beats alias, token-bounded", () => {
  it("returns a canonical match for a direct word", () => {
    expect(matchVocabulary("Bathroom", USE_VOCABULARY.bath)).toEqual({ word: "bathroom", canonical: true });
  });

  it("returns an alias match for an indirect word", () => {
    expect(matchVocabulary("Powder", USE_VOCABULARY.wc)).toEqual({ word: "powder", canonical: false });
  });

  it("prefers a canonical word when both are present", () => {
    // "Bathroom Ensuite" carries the direct term "bathroom" and the alias "ensuite".
    expect(matchVocabulary("Bathroom Ensuite", USE_VOCABULARY.bath)?.canonical).toBe(true);
  });

  it("is token-bounded — no substring hit", () => {
    expect(matchVocabulary("Hallmark Suite", USE_VOCABULARY.hall)).toBeNull();
    expect(matchVocabulary("Entrance Hall", USE_VOCABULARY.hall)).toEqual({ word: "hall", canonical: true });
  });

  it("matches a multi-word alias phrase across tokens", () => {
    expect(matchVocabulary("Master En-Suite", USE_VOCABULARY.bath)).toEqual({ word: "en suite", canonical: false });
  });
});

describe("classifyLabelUses — regex-cascade behavior, with alias reporting", () => {
  it("classifies a canonical label with no alias flag", () => {
    expect(classifyLabelUses("Bathroom")).toEqual({ uses: ["bath"], aliases: [] });
    expect(classifyLabelUses("Kitchen")).toEqual({ uses: ["kitchen"], aliases: [] });
  });

  it("flags an alias-only classification", () => {
    expect(classifyLabelUses("Powder")).toEqual({ uses: ["wc"], aliases: [{ kind: "wc", word: "powder" }] });
    expect(classifyLabelUses("Foyer")).toEqual({ uses: ["entry"], aliases: [{ kind: "entry", word: "foyer" }] });
    expect(classifyLabelUses("Landing")).toEqual({ uses: ["hall"], aliases: [{ kind: "hall", word: "landing" }] });
  });

  it("keeps entry winning over hall (mutual exclusion, as the old regexes did)", () => {
    // "Foyer" is entry, never hall.
    expect(classifyLabelUses("Foyer").uses).toEqual(["entry"]);
  });

  it("does not classify a bare 'Wet Room' (the old WET_RE never matched it)", () => {
    expect(classifyLabelUses("Wet Room")).toEqual({ uses: [], aliases: [] });
  });

  it("living/dining stays out of the use classifier but is a separate label check", () => {
    expect(classifyLabelUses("Living Room").uses).toEqual([]);
    expect(matchesLivingDining("Living Room")).toBe(true);
    expect(matchesLivingDining("Studio")).toBe(false);
  });
});

describe("W_ALIAS_MATCH lint rule", () => {
  it("fires for an alias-classified room with no authored uses, carrying a machine-applicable fix", () => {
    const diags = aliasDiags(planWith("Powder"));
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.severity).toBe("warning");
    expect(d.message).toContain("Powder");
    expect(d.message).toContain('"powder"');
    const fix = d.fixes?.[0];
    expect(fix?.applicability).toBe("machine-applicable");
    expect(fix?.edits[0]?.newText).toBe(" uses wc");
  });

  it("does NOT fire when the room authored its uses", () => {
    expect(aliasDiags(planWith("Powder", "uses wc"))).toHaveLength(0);
  });

  it("does NOT fire for a canonical label", () => {
    expect(aliasDiags(planWith("Bathroom"))).toHaveLength(0);
    expect(aliasDiags(planWith("Kitchen"))).toHaveLength(0);
    expect(aliasDiags(planWith("WC"))).toHaveLength(0);
  });

  it("round-trips: applying the fix clears the warning and preserves room_type", () => {
    const src = planWith("Powder");
    const before = describePlan(src).rooms.find((r) => r.id === "r")!;
    expect(before.room_type).toBe("Bathroom");

    const fix = aliasDiags(src)[0]!.fixes![0]!;
    const { output } = applyFixes(src, [fix]);
    expect(output).toContain('label "Powder" uses wc');

    // Warning gone, classification identical.
    expect(aliasDiags(output)).toHaveLength(0);
    const after = describePlan(output).rooms.find((r) => r.id === "r")!;
    expect(after.room_type).toBe(before.room_type);
    expect(after.uses).toEqual(before.uses);
  });
});
