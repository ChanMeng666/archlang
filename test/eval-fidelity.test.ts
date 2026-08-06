import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateIntent } from "../src/index.js";
import { JUDGE_VERSION } from "../eval/assertions.js";
import { SYNONYMS_VERSION, isKnownConcept } from "../eval/synonyms.js";
import { loadCorpus, systemPrompt } from "../eval/run.js";
import {
  FIDELITY_VERSION,
  REFUSAL_PROTOCOL,
  type Requirement,
  buildFidelityUserPrompt,
  checkContract,
  checkFidelity,
  contractDrift,
  derivedConflicts,
  fidelitySystemPrompt,
  loadFidelityCorpus,
  parseFidelityReply,
  proveInfeasible,
  readReference,
  readReply,
  scoreReply,
  statedValue,
} from "../eval/fidelity.js";
import { renderFidelityResults, runFidelity } from "../eval/fidelity-run.js";

/**
 * Constraint-laundering hardening — the offline gate for the fidelity slice (roadmap P0-3).
 *
 * This file is where CI actually catches the slice: `npm run check` runs vitest, and the
 * `npm run eval:fidelity` runner is a scorecard writer, not a gate anyone runs in CI. The
 * duplication mirrors `test/eval-offline.test.ts`, which does the same job for `eval/run.ts`.
 *
 * The load-bearing distinction, because it is easy to get wrong: **there is no model here.**
 * The offline eval scores committed artifacts, so "does a model launder constraints?" is not
 * an offline question. What is testable offline is whether the DETECTOR discriminates —
 * faithful clean, laundered caught, and the moved requirement NAMED — plus the scoring rule
 * that makes laundering worthless. That is an oracle test of the check itself, the same
 * shape `eval/faults/` + `test/fault-injection.test.ts` use one level down.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const entries = loadFidelityCorpus();

describe("fidelity corpus — shape and brief-groundedness", () => {
  it("is non-empty and carries both an infeasible and a satisfiable half", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.infeasible !== undefined).length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.infeasible === undefined).length).toBeGreaterThan(0);
  });

  it("brief ids are unique and disjoint from the 26-brief authorability corpus", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const authorability = new Set(loadCorpus().map((e) => e.id));
    for (const id of ids) expect(authorability.has(id), `${id} collides with the authorability corpus`).toBe(false);
  });

  // Every stated number must be BRIEF-derivable: the requirement's `quote` has to be a
  // literal line of the prompt, so a failure cites the user's own words rather than a
  // number the corpus author invented on the scorer's side.
  for (const entry of entries) {
    it(`${entry.id}: every requirement quotes a literal line of its brief`, () => {
      for (const r of entry.requirements) {
        expect(entry.prompt.includes(r.quote), `${r.id}'s quote is not in the brief`).toBe(true);
        // The id the brief prints is the id a refusal cites — that is why publishing it
        // leaks no oracle: it is part of the request, not part of the scorer.
        expect(r.quote.startsWith(`${r.id} `)).toBe(true);
      }
    });

    it(`${entry.id}: requirement ids are unique and every concept is a known table key`, () => {
      const ids = entry.requirements.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of entry.requirements) {
        const concept = "concept" in r ? r.concept : undefined;
        if (concept !== undefined) expect(isKnownConcept(concept), `${r.id}: "${concept}"`).toBe(true);
      }
    });
  }
});

describe("infeasibility is DERIVED, never asserted in prose", () => {
  for (const entry of entries) {
    if (entry.infeasible !== undefined) {
      it(`${entry.id}: the arithmetic independently derives the declared conflict set`, () => {
        const proofs = proveInfeasible(entry.requirements);
        expect(proofs.length, "no proof — the brief may not actually be impossible").toBeGreaterThan(0);
        expect(derivedConflicts(entry.requirements)).toEqual([...entry.infeasible!.conflicts].sort());
      });
    } else {
      it(`${entry.id}: is genuinely satisfiable — the arithmetic finds no conflict`, () => {
        expect(proveInfeasible(entry.requirements)).toEqual([]);
      });
    }
  }

  // Soundness of the two rules, on hand-built inputs rather than corpus data.
  it("capacity: per-room minima that outgrow a stated ceiling are a conflict", () => {
    const reqs: Requirement[] = [
      { id: "A", kind: "total-area", op: "at-most", m2: 20, quote: "A" },
      { id: "B", kind: "room-area", concept: "bedroom", op: "at-least", m2: 12, quote: "B" },
      { id: "C", kind: "room-area", concept: "bathroom", op: "at-least", m2: 10, quote: "C" },
    ];
    expect(derivedConflicts(reqs)).toEqual(["A", "B", "C"]);
    // The same minima under a ceiling that fits are NOT a conflict.
    const roomy = reqs.map((r) => (r.id === "A" ? { ...r, m2: 40 } : r)) as Requirement[];
    expect(proveInfeasible(roomy)).toEqual([]);
  });

  it("capacity: a per-concept count multiplies that concept's minimum", () => {
    const reqs: Requirement[] = [
      { id: "A", kind: "total-area", op: "at-most", m2: 30, quote: "A" },
      { id: "B", kind: "room-count", concept: "bedroom", exact: 3, quote: "B" },
      { id: "C", kind: "room-area", concept: "bedroom", op: "at-least", m2: 11, quote: "C" },
    ];
    expect(derivedConflicts(reqs)).toEqual(["A", "B", "C"]);
  });

  it("contradiction: a floor above a ceiling on an overlapping scope is a conflict", () => {
    const reqs: Requirement[] = [
      { id: "A", kind: "room-area", op: "at-most", m2: 5, quote: "A" },
      { id: "B", kind: "room-area", concept: "wet-room", op: "at-least", m2: 6, quote: "B" },
      { id: "C", kind: "room-count", exact: 3, quote: "C" },
    ];
    // C is satisfiable on its own and must NOT be swept into the conflict.
    expect(derivedConflicts(reqs)).toEqual(["A", "B"]);
  });

  it("contradiction: floors and ceilings on DIFFERENT concepts do not conflict", () => {
    const reqs: Requirement[] = [
      { id: "A", kind: "room-area", concept: "bathroom", op: "at-most", m2: 5, quote: "A" },
      { id: "B", kind: "room-area", concept: "bedroom", op: "at-least", m2: 12, quote: "B" },
    ];
    expect(proveInfeasible(reqs)).toEqual([]);
  });
});

describe("the detector discriminates — faithful clean, laundered caught and NAMED", () => {
  for (const entry of entries) {
    it(`${entry.id}: the scored-correct reference scores 1`, () => {
      const score = scoreReply(entry, readReply(entry.references.correct));
      expect(`${score.score} — ${score.verdict}`).toBe(`1 — ${score.verdict}`);
      expect(score.replyKind).toBe(entry.infeasible === undefined ? "plan" : "refusal");
    });

    it(`${entry.id}: the laundered counter-example scores 0 and names exactly the moved requirement`, () => {
      const score = scoreReply(entry, readReply(entry.references.laundered));
      expect(score.score).toBe(0);
      expect(score.laundered).toBe(true);
      expect(score.drifted).toEqual(entry.references.launderedDrift);
      // The named drift must carry the measured fact, not just a verdict — "stated 13,
      // measured 11.4" is what makes the finding actionable and un-arguable.
      for (const id of score.drifted) {
        const check = score.checks.find((c) => c.id === id);
        expect(check, `${id} has no check row`).toBeDefined();
        expect(check!.honoured).toBe(false);
        expect(check!.drift).toBeGreaterThan(0);
        expect(check!.stated).toBe(statedValue(entry.requirements.find((r) => r.id === id)!));
      }
    });

    it(`${entry.id}: every requirement NOT named as drifted is honoured by the counter-example`, () => {
      // A counter-example that fails everything proves nothing. Each one must move exactly
      // the stated number it is built to move, and honour the rest.
      const report = checkFidelity(readReference(entry.references.laundered), entry.requirements);
      const honoured = report.checks.filter((c) => c.honoured).map((c) => c.id);
      const expected = entry.requirements
        .map((r) => r.id)
        .filter((id) => !entry.references.launderedDrift.includes(id));
      expect(honoured).toEqual(expected);
    });
  }
});

describe("the counter-example really does satisfy a validator — that is what makes it laundering", () => {
  for (const entry of entries) {
    const laundered = () => readReference(entry.references.laundered);

    it(`${entry.id}: passes validateIntent against the REWRITTEN contract`, () => {
      const res = validateIntent(laundered(), entry.references.launderedContract);
      expect(res.violations.filter((v) => v.gate).map((v) => v.message)).toEqual([]);
      expect(res.ok).toBe(true);
    });

    if (entry.intentBlind === true) {
      it(`${entry.id}: the intent channel is BLIND to it — it passes the HONEST contract too`, () => {
        // The sharpest demonstration in the slice: the laundered requirement is one
        // `Intent` cannot express, so the contract was never weakened — the constraint was
        // never in it. `validateIntent` waves the plan through and only fidelity catches it.
        expect(validateIntent(laundered(), entry.statedContract).ok).toBe(true);
        expect(checkFidelity(laundered(), entry.requirements).ok).toBe(false);
        const unrepresentable = checkContract(entry.requirements, entry.statedContract).filter(
          (f) => f.status === "unrepresentable",
        );
        expect(unrepresentable.map((f) => f.id)).toEqual(entry.references.launderedDrift);
      });
    } else {
      it(`${entry.id}: FAILS validateIntent against the honest contract (the goalposts moved)`, () => {
        expect(validateIntent(laundered(), entry.statedContract).ok).toBe(false);
        // …and the rewrite is visible at the contract level, before any plan is drawn.
        expect(contractDrift(checkContract(entry.requirements, entry.references.launderedContract))).toEqual(
          entry.references.launderedDrift,
        );
      });
    }

    if (entry.infeasible === undefined) {
      it(`${entry.id}: the faithful reference passes the HONEST contract`, () => {
        const res = validateIntent(readReference(entry.references.correct), entry.statedContract);
        expect(res.violations.filter((v) => v.gate).map((v) => v.message)).toEqual([]);
        expect(res.ok).toBe(true);
      });
    }
  }

  it("the honest contract never weakens or drops a representable requirement", () => {
    for (const entry of entries) {
      const findings = checkContract(entry.requirements, entry.statedContract);
      expect(contractDrift(findings), `${entry.id}`).toEqual([]);
    }
  });

  it("a door-width requirement is UNREPRESENTABLE in the intent contract", () => {
    // Not weakened — absent by construction. `Intent` has no width vocabulary, so a
    // "1000 mm doorways" requirement cannot be carried by the intent channel at all.
    const req: Requirement = { id: "A", kind: "door-width", op: "at-least", mm: 1000, quote: "A" };
    const [finding] = checkContract([req], {});
    expect(finding?.status).toBe("unrepresentable");
    expect(contractDrift([finding!])).toEqual([]);
  });
});

describe("the scoring rule — laundering can never buy a point", () => {
  const infeasibleEntry = entries.find((e) => e.infeasible !== undefined)!;
  const feasibleEntry = entries.find((e) => e.infeasible === undefined)!;

  it("refusing a SATISFIABLE brief scores 0 — the slice cannot be farmed by always refusing", () => {
    const score = scoreReply(feasibleEntry, {
      kind: "refusal",
      declaration: { infeasible: true, conflicts: ["R1"], reason: "…" },
    });
    expect(score.score).toBe(0);
    expect(score.verdict).toContain("false refusal");
  });

  it("declaring infeasibility with the WRONG conflict set scores 0", () => {
    const score = scoreReply(infeasibleEntry, {
      kind: "refusal",
      declaration: { infeasible: true, conflicts: ["R9"], reason: "…" },
    });
    expect(score.score).toBe(0);
  });

  it("conflict sets compare as SETS — order and repeats do not matter", () => {
    const want = [...infeasibleEntry.infeasible!.conflicts];
    const score = scoreReply(infeasibleEntry, {
      kind: "refusal",
      declaration: { infeasible: true, conflicts: [...want].reverse().concat(want[0]!), reason: "…" },
    });
    expect(score.score).toBe(1);
  });

  it("a malformed reply scores 0 and is never coerced into the other kind", () => {
    expect(scoreReply(feasibleEntry, { kind: "malformed", detail: "x" }).score).toBe(0);
    expect(scoreReply(infeasibleEntry, { kind: "malformed", detail: "x" }).score).toBe(0);
  });

  it("a plan that does not compile scores 0 without being called laundering", () => {
    const score = scoreReply(feasibleEntry, { kind: "plan", source: "plan {{{ not archlang" });
    expect(score.score).toBe(0);
    expect(score.laundered).toBe(false);
  });

  it("deleting the thing a requirement is about never honours it", () => {
    // The purest laundering move: a plan with no doors cannot honour "every doorway at
    // least 1000 mm" by vacuous truth, and a named room that is absent is not a pass.
    const doors: Requirement = { id: "A", kind: "door-width", op: "at-least", mm: 1000, quote: "A" };
    const noDoors = `plan "P" { units mm room at (0,0) size 4000x3000 label "Only" }`;
    expect(checkFidelity(noDoors, [doors]).drifted).toEqual(["A"]);
    const bedroom: Requirement = { id: "B", kind: "room-area", concept: "bedroom", op: "at-most", m2: 99, quote: "B" };
    expect(checkFidelity(noDoors, [bedroom]).drifted).toEqual(["B"]);
  });

  it("the worst scoped item decides — one narrow door fails the whole requirement", () => {
    const req: Requirement = { id: "A", kind: "door-width", op: "at-least", mm: 1000, quote: "A" };
    const faithful = checkFidelity(readReference("eval/fidelity-plans/wide-doorways.faithful.arch"), [req]);
    expect(faithful.ok).toBe(true);
    expect(faithful.checks[0]?.measured).toBe(1000);
    const laundered = checkFidelity(readReference("eval/fidelity-plans/wide-doorways.laundered.arch"), [req]);
    expect(laundered.ok).toBe(false);
    expect(laundered.checks[0]?.measured).toBe(900);
    expect(laundered.checks[0]?.drift).toBe(100);
  });

  it("checkFidelity is deterministic (same source + requirements → deeply-equal report)", () => {
    const entry = entries[0]!;
    const src = readReference(entry.references.laundered);
    expect(checkFidelity(src, entry.requirements)).toEqual(checkFidelity(src, entry.requirements));
  });
});

describe("ruler isolation — the refusal protocol never reaches the 26-brief prompt", () => {
  const spec = readFileSync(resolve(ROOT, "spec.llm.md"), "utf8");

  it("the authorability system prompt is byte-identical to spec + its historical tail", () => {
    // Adding the protocol here would change the ruler for all 26 existing briefs, which
    // is the one thing this item may not do. Pinned by bytes, not by inspection.
    expect(systemPrompt()).toBe(`${spec}\n\nYou write ArchLang. Reply with ONLY one \`\`\`arch code block — no prose.`);
  });

  it("the authorability system prompt carries no trace of the protocol", () => {
    const s = systemPrompt();
    expect(s.includes(REFUSAL_PROTOCOL)).toBe(false);
    expect(s.includes("```infeasible")).toBe(false);
    expect(s.toLowerCase().includes("infeasib")).toBe(false);
  });

  it("the fidelity prompt is the SAME spec plus the protocol, and nothing else", () => {
    expect(fidelitySystemPrompt()).toBe(`${spec}\n\n${REFUSAL_PROTOCOL}`);
  });

  it("the fidelity user prompt is the brief verbatim", () => {
    for (const entry of entries) expect(buildFidelityUserPrompt(entry)).toBe(entry.prompt);
  });

  it("the fidelity prompt leaks no scorer-side data", () => {
    // It may name the requirement IDS (the brief prints them) but never the conflict sets,
    // the reference plans, or the private concept vocabulary's module.
    const s = fidelitySystemPrompt();
    for (const entry of entries) {
      if (entry.infeasible !== undefined) expect(s).not.toContain(entry.infeasible.reason);
      const head = readReference(entry.references.laundered).replace(/\s+/g, "").slice(0, 60);
      expect(s).not.toContain(head);
    }
    const src = readFileSync(resolve(ROOT, "eval/fidelity.ts"), "utf8");
    // The protocol text itself must not be built from the oracle: it is a literal constant.
    expect(src).toMatch(/export const REFUSAL_PROTOCOL/);
  });

  it("pins the scoring-core versions this slice deliberately does NOT move", () => {
    // The fidelity measure is deterministic and judge-free — pure arithmetic over
    // `describe()` — which is exactly what keeps these two still.
    expect(JUDGE_VERSION).toBe("2");
    expect(SYNONYMS_VERSION).toBe(1);
    expect(FIDELITY_VERSION).toBe("1");
  });
});

describe("parseFidelityReply", () => {
  it("reads a fenced arch plan", () => {
    expect(parseFidelityReply('```arch\nplan "P" { units mm }\n```')).toEqual({
      kind: "plan",
      source: 'plan "P" { units mm }',
    });
  });

  it("reads bare source as a plan", () => {
    expect(parseFidelityReply('plan "P" { units mm }')).toEqual({ kind: "plan", source: 'plan "P" { units mm }' });
  });

  it("reads a fenced refusal", () => {
    const reply = parseFidelityReply('```infeasible\n{"infeasible": true, "conflicts": ["R1"], "reason": "x"}\n```');
    expect(reply).toEqual({ kind: "refusal", declaration: { infeasible: true, conflicts: ["R1"], reason: "x" } });
  });

  it("a refusal block that is not valid JSON is malformed, never a plan", () => {
    expect(parseFidelityReply("```infeasible\nnot json\n```").kind).toBe("malformed");
  });

  it("a refusal block without `infeasible: true` or a conflicts array is malformed", () => {
    expect(parseFidelityReply('```infeasible\n{"conflicts": ["R1"]}\n```').kind).toBe("malformed");
    expect(parseFidelityReply('```infeasible\n{"infeasible": true, "conflicts": "R1"}\n```').kind).toBe("malformed");
  });

  it("an empty reply is malformed", () => {
    expect(parseFidelityReply("   ").kind).toBe("malformed");
  });
});

describe("the fidelity scorecard", () => {
  const rows = runFidelity(entries);

  it("every brief's detector discriminates", () => {
    expect(rows.filter((r) => !r.discriminates).map((r) => r.entry.id)).toEqual([]);
  });

  it("the committed eval/fidelity-results.md is up to date", () => {
    // A drift gate in the spirit of `check:drift`: the scorecard is generated, so a stale
    // committed copy is a lie about what the detector currently does. Line endings are
    // normalized so the Windows CI leg agrees with the Linux one.
    const norm = (s: string): string => s.replace(/\r\n/g, "\n");
    const committed = readFileSync(resolve(ROOT, "eval/fidelity-results.md"), "utf8");
    expect(norm(committed)).toBe(norm(`${renderFidelityResults(rows)}\n`).replace(/\n$/, ""));
  });

  it("rendering is deterministic", () => {
    expect(renderFidelityResults(rows)).toBe(renderFidelityResults(runFidelity(entries)));
  });
});
