import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as vdescribe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, validateIntent } from "../src/index.js";
import { CANARY, CANARY_COMMENT } from "../dataset/canary.js";
import { loadHoldout, normalizeText, structReject, textReject } from "../dataset/dedup.js";
import { generateAll } from "../dataset/generate.js";
import { recordTrajectory } from "../dataset/trajectory.js";

/**
 * Permanent CI guard for the repair-trajectory / authoring dataset generator
 * (roadmap Tranche 5). Four groups:
 *   a. LEAKAGE — the contamination iron law: a freshly generated small corpus must share
 *      no holdout brief/golden text or structure (the private holdout must stay private).
 *   b. CANARY — every row carries the canary field AND a first-line source comment.
 *   c. DETERMINISM — same seed ⇒ byte-identical JSONL, and no clock/entropy API is used
 *      anywhere under dataset/ (a source scan, in the style of the drift tests).
 *   d. SELF-VERIFICATION — a sample of rows re-verifies from scratch (broken raises its
 *      fault; fixed is strict-clean and idempotent; authoring intent validates).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = resolve(__dirname, "..", "dataset");
const SEED = 424242;

// A small corpus, generated once, shared across the groups. Fast (seconds).
const { repairJsonl, authoringJsonl } = generateAll({ repairRows: 40, authoringRows: 20, seed: SEED });
const repairRows = repairJsonl
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const authoringRows = authoringJsonl
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const holdout = loadHoldout();

/** Set of 8-word n-grams over a normalized string. */
function grams8(text: string): Set<string> {
  const toks = normalizeText(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 8 <= toks.length; i++) out.add(toks.slice(i, i + 8).join(" "));
  return out;
}

/** The holdout prompts + goldens, read directly for the leakage assertions. */
const corpus: { id: string; prompt: string; golden: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, "..", "eval", "corpus.json"), "utf8"),
);
const holdoutGrams = corpus.map((e) => ({ id: e.id, grams: grams8(e.prompt) }));
const holdoutGoldenNorm = corpus.map((e) => ({
  id: e.id,
  norm: normalizeText(readFileSync(resolve(__dirname, "..", e.golden), "utf8")),
}));

vdescribe("dataset generator — the corpus is non-empty", () => {
  it("emits the requested rows", () => {
    expect(repairRows.length).toBe(40);
    expect(authoringRows.length).toBe(20);
  });
});

vdescribe("a. leakage — the private holdout stays private (contamination iron law)", () => {
  const allTexts = [
    ...repairRows.map((r) => ({ id: r.id, brief: "", source: r.fixed_source as string })),
    ...repairRows.map((r) => ({ id: r.id, brief: "", source: r.broken_source as string })),
    ...authoringRows.map((r) => ({ id: r.id, brief: r.brief as string, source: r.source as string })),
  ];

  it("no row's brief or source contains any holdout prompt's normalized 8-gram", () => {
    for (const t of allTexts) {
      const rowGrams = new Set([...grams8(t.brief), ...grams8(t.source)]);
      for (const h of holdoutGrams) {
        for (const g of h.grams) {
          expect(rowGrams.has(g), `${t.id} shares an 8-gram with holdout ${h.id}: "${g}"`).toBe(false);
        }
      }
    }
  });

  it("no row source contains a holdout golden source (whitespace-normalized) or vice versa", () => {
    for (const t of allTexts) {
      const src = normalizeText(t.source);
      for (const h of holdoutGoldenNorm) {
        // Compare on a meaningful window: a golden is many tokens; substring either way is leakage.
        expect(src.includes(h.norm), `${t.id} contains holdout golden ${h.id}`).toBe(false);
        expect(h.norm.includes(src), `holdout golden ${h.id} contains ${t.id}`).toBe(false);
      }
    }
  });

  it("every authoring brief is below the text-similarity reject threshold", () => {
    for (const r of authoringRows) {
      expect(textReject(r.brief as string, holdout).reject, `authoring brief ${r.id} too similar`).toBe(false);
    }
  });

  it("no row's structural fingerprint matches any holdout golden", () => {
    for (const r of [...repairRows, ...authoringRows]) {
      const source = (r.source ?? r.fixed_source) as string;
      expect(structReject(source, holdout).reject, `${r.id} fingerprint matches a holdout golden`).toBe(false);
    }
  });
});

vdescribe("b. canary — double-embedded in every row", () => {
  it("every row carries the canary field", () => {
    for (const r of [...repairRows, ...authoringRows]) expect(r.canary).toBe(CANARY);
  });

  it("every .arch source begins with the canary comment", () => {
    for (const r of repairRows) {
      expect((r.broken_source as string).startsWith(CANARY_COMMENT)).toBe(true);
      expect((r.fixed_source as string).startsWith(CANARY_COMMENT)).toBe(true);
    }
    for (const r of authoringRows) expect((r.source as string).startsWith(CANARY_COMMENT)).toBe(true);
  });
});

vdescribe("c. determinism", () => {
  it("the same seed yields byte-identical JSONL", () => {
    const again = generateAll({ repairRows: 40, authoringRows: 20, seed: SEED });
    expect(again.repairJsonl).toBe(repairJsonl);
    expect(again.authoringJsonl).toBe(authoringJsonl);
  });

  it("no file under dataset/ uses a clock or entropy-seeded randomness", () => {
    const forbidden = ["Date.now", "Math.random", "new Date("];
    const files = readdirSync(DATASET_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(DATASET_DIR, f), "utf8");
      for (const bad of forbidden) {
        expect(src.includes(bad), `${f} must not use ${bad}`).toBe(false);
      }
    }
  });
});

vdescribe("d. self-verification — a sample of rows re-verifies from scratch", () => {
  // A deterministic sample (every k-th row) keeps the test fast while covering variety.
  const sampleRepair = repairRows.filter((_, i) => i % 3 === 0);
  const sampleAuthoring = authoringRows.filter((_, i) => i % 2 === 0);

  it("broken sources raise every declared fault code", () => {
    for (const r of sampleRepair) {
      const codes = new Set<string>();
      for (const d of compile(r.broken_source as string).diagnostics) if (d.code) codes.add(d.code);
      for (const d of lint(r.broken_source as string)) if (d.code) codes.add(d.code);
      for (const fc of r.fault_classes as string[]) {
        expect(codes.has(fc), `${r.id} broken source should raise ${fc}`).toBe(true);
      }
    }
  });

  it("fixed sources are strict-clean (0 errors, 0 warnings)", () => {
    for (const r of sampleRepair) {
      const src = r.fixed_source as string;
      expect(compile(src).diagnostics, `${r.id} fixed source has compile diagnostics`).toHaveLength(0);
      expect(lint(src), `${r.id} fixed source has lint warnings`).toHaveLength(0);
    }
  });

  it("running the trajectory pipeline on a fixed source is a byte no-op (idempotent)", () => {
    for (const r of sampleRepair) {
      const src = r.fixed_source as string;
      expect(recordTrajectory(src).fixedSource, `${r.id} not idempotent`).toBe(src);
    }
  });

  it("fix_kind faithfully reflects which stage changed bytes", () => {
    for (const r of sampleRepair) {
      const traj = recordTrajectory(r.broken_source as string);
      expect(traj.fixKind, `${r.id} fix_kind drift`).toBe(r.fix_kind);
      expect(traj.fixedSource).toBe(r.fixed_source);
    }
  });

  it("authoring rows validate their intent and match their described facts", () => {
    for (const r of sampleAuthoring) {
      const source = r.source as string;
      const res = validateIntent(source, r.intent as Parameters<typeof validateIntent>[1]);
      expect(res.ok, `${r.id} intent not ok`).toBe(true);
      const s = describePlan(source);
      const facts = r.facts as { rooms: { id: string; area_m2: number }[]; total_area_m2: number };
      expect(facts.rooms.length).toBe(s.rooms.length);
      expect(facts.total_area_m2).toBe(s.totals.floor_area_m2);
      for (const fr of facts.rooms) {
        const room = s.rooms.find((x) => x.id === fr.id);
        expect(room, `${r.id} facts room ${fr.id} missing`).toBeDefined();
        expect(fr.area_m2).toBe(room!.area_m2);
      }
    }
  });
});
