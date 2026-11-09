/**
 * The label classifier emits `living` and `dining` (plan-soundness PS0.7).
 *
 * It used to leave them out: a label-only "Living Room" read as `uses: []` in `describe()`, while
 * circulation and the equator-aspect rule classified the same label as living through a second
 * function, `matchesLivingDining`. There is one classifier now. These cases pin what it answers
 * for the living/dining words, the one rule a living ALIAS obeys (it yields to any other kind
 * the label matched, canonical or alias, except its sibling `dining`), and that `matchesLivingDining` is that classifier's answer over every room
 * label and id of the corpus and every vocabulary word.
 */

import { walkFiles as walk } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describe as describePlan, extractArchBlocks, lint } from "../src/index.js";
import type { World } from "../src/index.js";
import { CONCEPTS } from "../src/intent-concepts.js";
import { USE_VOCABULARY, classifyLabelUses, matchesLivingDining } from "../src/vocabulary.js";

const ROOT = resolve(__dirname, "..");

/** A one-room plan with the given label and no authored `uses` unless one is passed. */
const planWith = (label: string, uses = ""): string => `plan "t" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "${label}"${uses ? ` ${uses}` : ""}
  door id=d on exterior at 20% width 900
}`;

describe("classifyLabelUses — living and dining", () => {
  it("classifies the canonical living and dining words", () => {
    expect(classifyLabelUses("Living")).toEqual({ uses: ["living"], aliases: [] });
    expect(classifyLabelUses("Living Room")).toEqual({ uses: ["living"], aliases: [] });
    expect(classifyLabelUses("Lounge")).toEqual({ uses: ["living"], aliases: [] });
    // `dining` is a use kind of its own, so the dining word gives `dining`, not `living`.
    expect(classifyLabelUses("Dining")).toEqual({ uses: ["dining"], aliases: [] });
    expect(classifyLabelUses("Dining Room")).toEqual({ uses: ["dining"], aliases: [] });
    expect(classifyLabelUses("Living / Dining")).toEqual({ uses: ["living", "dining"], aliases: [] });
  });

  it("appends living after every older kind, so their positions hold", () => {
    expect(classifyLabelUses("Kitchen / Living")).toEqual({ uses: ["kitchen", "living"], aliases: [] });
    expect(classifyLabelUses("Garage Living")).toEqual({ uses: ["garage", "living"], aliases: [] });
  });

  it("flags an alias-only living classification", () => {
    expect(classifyLabelUses("Family Room")).toEqual({
      uses: ["living"],
      aliases: [{ kind: "living", word: "family" }],
    });
    expect(classifyLabelUses("Sitting Room")).toEqual({
      uses: ["living"],
      aliases: [{ kind: "living", word: "sitting" }],
    });
  });

  it("drops a living alias when the label matched any other kind, except dining", () => {
    expect(classifyLabelUses("Family Bathroom")).toEqual({ uses: ["bath"], aliases: [] });
    expect(classifyLabelUses("Family Kitchen")).toEqual({ uses: ["kitchen"], aliases: [] });
    expect(classifyLabelUses("Bed-sitting Room")).toEqual({ uses: ["bedroom"], aliases: [] });
    // Another kind matched only by ITS alias suppresses too; that alias is flagged once, for its kind.
    expect(classifyLabelUses("Family Foyer")).toEqual({
      uses: ["entry"],
      aliases: [{ kind: "entry", word: "foyer" }],
    });
    // `dining` is the living row's sibling and does not suppress: both kinds, the alias flagged.
    expect(classifyLabelUses("Sitting / Dining")).toEqual({
      uses: ["living", "dining"],
      aliases: [{ kind: "living", word: "sitting" }],
    });
    expect(classifyLabelUses("Family Room")).toEqual({
      uses: ["living"],
      aliases: [{ kind: "living", word: "family" }],
    });
    // A canonical living word is never dropped ("lounge" is tried before the "family" alias).
    expect(classifyLabelUses("Family Lounge")).toEqual({ uses: ["living"], aliases: [] });
    expect(classifyLabelUses("Kitchen / Living")).toEqual({ uses: ["kitchen", "living"], aliases: [] });
  });

  it("is token-bounded, and no more than that", () => {
    expect(classifyLabelUses("Livingston Suite").uses).toEqual([]);
    expect(classifyLabelUses("Diningroom").uses).toEqual([]);
    expect(classifyLabelUses("Studio").uses).toEqual([]);
    // Honest token matching, not a reading of the phrase: "living" is a whole token here, so the
    // store reads as living. An author who means storage says `uses storage`, which wins.
    expect(classifyLabelUses("Living Wall Storage").uses).toEqual(["living"]);
  });
});

describe("the label-only living room through describe() and lint()", () => {
  it("reports the same uses and room_type an authored `uses living` gets", () => {
    const labelOnly = describePlan(planWith("Living Room")).rooms[0];
    const authored = describePlan(planWith("Living Room", "uses living")).rooms[0];
    expect(labelOnly?.uses).toEqual(["living"]);
    expect(labelOnly?.room_type).toBe("LivingRoom");
    expect(labelOnly?.room_type).toBe(authored?.room_type);
  });

  it("gives `Kitchen / Living` the room_type an authored `uses kitchen living` gets", () => {
    const labelOnly = describePlan(planWith("Kitchen / Living")).rooms[0];
    const authored = describePlan(planWith("Kitchen / Living", "uses kitchen living")).rooms[0];
    expect(labelOnly?.room_type).toBe("LivingRoom");
    expect(labelOnly?.room_type).toBe(authored?.room_type);
  });

  it("advises an explicit `uses` for an alias-only living room, and not for a suppressed alias", () => {
    const fam = lint(planWith("Family Room")).filter((d) => d.code === "W_ALIAS_MATCH");
    expect(fam).toHaveLength(1);
    expect(fam[0]?.hints).toEqual(["Add `uses living` to state the room's function explicitly."]);
    expect(lint(planWith("Family Bathroom")).filter((d) => d.code === "W_ALIAS_MATCH")).toEqual([]);
  });
});

/** Every room label and id of every storey of the corpus: `.arch` files and docs fences. */
// EH3.4: not CORPUS_DIRS (test/helpers/corpus.ts): this oracle walks the whole of eval/, not just goldens, faults and fidelity-plans.
function corpusLabels(): string[] {
  const sources: { src: string; world?: World }[] = [];
  for (const d of ["examples", "test/fixtures", "test/recovery-corpus", "eval"])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      sources.push({ src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md) for (const b of extractArchBlocks(readFileSync(p, "utf8"))) sources.push({ src: b.source });
  const out = new Set<string>();
  for (const s of sources) {
    const d = describePlan(s.src, s.world ? { world: s.world } : {});
    const rooms = d.levels ? d.levels.flatMap((l) => l.rooms) : d.rooms;
    for (const r of rooms) {
      out.add(r.id);
      if (r.label !== undefined) out.add(r.label);
    }
  }
  return [...out].sort();
}

describe("matchesLivingDining is the classifier's answer", () => {
  const agrees = (label: string): void => {
    const { uses } = classifyLabelUses(label);
    expect(matchesLivingDining(label), label).toBe(uses.includes("living") || uses.includes("dining"));
  };

  it("on every room label and id of the corpus", () => {
    const labels = corpusLabels();
    // The sweep must have something to agree on, including living rooms.
    expect(labels.length).toBeGreaterThan(100);
    expect(labels.filter((l) => matchesLivingDining(l)).length).toBeGreaterThan(0);
    for (const l of labels) agrees(l);
  });

  it("on every vocabulary word, alone and paired with every other", () => {
    const words = [
      ...Object.values(USE_VOCABULARY).flatMap((v) => [...v.canonical, ...v.aliases]),
      ...Object.values(CONCEPTS).flatMap((c) => c.labels),
    ];
    for (const a of words) {
      agrees(a);
      for (const b of words) agrees(`${a} ${b}`);
    }
  });
});
