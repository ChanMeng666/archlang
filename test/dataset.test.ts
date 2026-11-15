/** Cases: emits the requested rows; no row's brief or source contains any holdout prompt's normalized 8-gram; no row source contains a holdout golden source (white… */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as vdescribe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, validateIntent } from "../src/index.js";
import { CANARY, CANARY_COMMENT } from "../dataset/canary.js";
import type { HoldoutIndex } from "../dataset/dedup.js";
import { fingerprint, loadHoldout, normalizeText, structReject, textReject } from "../dataset/dedup.js";
import { DEFAULT_AUTHORING_ROWS, DEFAULT_REPAIR_ROWS, DEFAULT_SEED, generateAll } from "../dataset/generate.js";
import { PUBLISHED, fidelityIndex, indexOfRows } from "../dataset/model-authoring/corpora.js";
import { DEFAULT_BRIEF_SEED, buildBriefSet, manifestJsonl } from "../dataset/model-authoring/manifest.js";
import { recordTrajectory } from "../dataset/trajectory.js";

/**
 * Permanent CI guard for the repair-trajectory / authoring dataset generator.
 * Four groups:
 *   a. LEAKAGE — the contamination iron law: a freshly generated small corpus must share
 *      no holdout brief/golden text or structure (the dataset stays disjoint from the eval corpus).
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

/** The eval prompts + goldens, read directly for the leakage assertions. */
const corpus: { id: string; prompt: string; golden: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, "..", "eval", "corpus.json"), "utf8"),
);

/**
 * The FIDELITY corpus — `eval/corpus-fidelity.json` and its committed
 * reference plans. These briefs are on exactly the same terms as the 26: a public
 * regression fixture, not a holdout, and the public dataset must stay disjoint from them
 * too. Without this they would be an **unguarded leak channel**, because the enforcement
 * arm (`dataset/dedup.ts`'s `loadHoldout`) reads only `eval/corpus.json`.
 *
 * `loadHoldout` is deliberately NOT extended. It decides what the generator *rejects*, so
 * widening it would change which rows a given seed emits — and the published HF dataset
 * carries a reproducibility claim against seed `20260712`. The guard therefore lives here,
 * where it costs that claim nothing and still fails CI the moment a generated row starts
 * to look like a fidelity brief.
 */
const fidelityCorpus: {
  id: string;
  prompt: string;
  references: { correct: string; laundered: string };
}[] = JSON.parse(readFileSync(resolve(__dirname, "..", "eval", "corpus-fidelity.json"), "utf8"));

/** Every `.arch` reference plan the fidelity corpus commits (a refusal is JSON, not a plan). */
const fidelityPlans = fidelityCorpus.flatMap((e) =>
  [e.references.correct, e.references.laundered]
    .filter((p) => p.endsWith(".arch"))
    .map((p) => ({ id: `${e.id}:${p.split("/").pop()}`, path: p })),
);

const holdoutGrams = [
  ...corpus.map((e) => ({ id: e.id, grams: grams8(e.prompt) })),
  ...fidelityCorpus.map((e) => ({ id: `fidelity:${e.id}`, grams: grams8(e.prompt) })),
];
const holdoutGoldenNorm = [
  ...corpus.map((e) => ({
    id: e.id,
    norm: normalizeText(readFileSync(resolve(__dirname, "..", e.golden), "utf8")),
  })),
  ...fidelityPlans.map((p) => ({
    id: `fidelity:${p.id}`,
    norm: normalizeText(readFileSync(resolve(__dirname, "..", p.path), "utf8")),
  })),
];

/** A `HoldoutIndex` over the fidelity corpus alone, so the same `textReject`/`structReject`
 *  checks the 26 briefs get are applied to these too — built here rather than inside
 *  `loadHoldout` for the reproducibility reason above. */
const fidelityHoldout: HoldoutIndex = {
  prompts: fidelityCorpus.map((e) => ({
    id: e.id,
    tokenSet: new Set(normalizeText(e.prompt).split(" ").filter(Boolean)),
    grams: grams8(e.prompt),
  })),
  fingerprints: fidelityPlans.map((p) => {
    const abs = resolve(__dirname, "..", p.path);
    const fp = fingerprint(readFileSync(abs, "utf8"), dirname(abs));
    return { id: p.id, fp, exact: JSON.stringify(fp) };
  }),
};

vdescribe("dataset generator — the corpus is non-empty", () => {
  it("emits the requested rows", () => {
    expect(repairRows.length).toBe(40);
    expect(authoringRows.length).toBe(20);
  });
});

vdescribe("a. leakage — the dataset stays disjoint from the eval corpus (contamination iron law)", () => {
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

  // The same two checks against the FIDELITY corpus (P0-3). Kept as separate cases so a
  // failure names which corpus was hit — the two corpora have different remedies.
  it("every authoring brief is below the reject threshold against the fidelity briefs", () => {
    for (const r of authoringRows) {
      expect(textReject(r.brief as string, fidelityHoldout).reject, `authoring brief ${r.id} too similar`).toBe(false);
    }
  });

  it("no row's structural fingerprint matches any fidelity reference plan", () => {
    for (const r of [...repairRows, ...authoringRows]) {
      const source = (r.source ?? r.fixed_source) as string;
      expect(structReject(source, fidelityHoldout).reject, `${r.id} fingerprint matches a fidelity plan`).toBe(false);
    }
  });

  it("the fidelity corpus is actually being scanned (the guard is not a no-op)", () => {
    // A guard that reads an empty list passes forever. Pin that both halves are non-empty
    // and that a fidelity brief's own text WOULD be rejected — the detector's positive
    // control, in the style of `test/docs-table-pipes.test.ts`.
    expect(fidelityCorpus.length).toBeGreaterThan(0);
    expect(fidelityPlans.length).toBeGreaterThan(0);
    expect(textReject(fidelityCorpus[0]!.prompt, fidelityHoldout).reject).toBe(true);
    const plan = readFileSync(resolve(__dirname, "..", fidelityPlans[0]!.path), "utf8");
    expect(structReject(plan, fidelityHoldout, dirname(resolve(__dirname, "..", fidelityPlans[0]!.path))).reject).toBe(
      true,
    );
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
    // Every .ts under dataset/, subdirectories included (the model-authoring config lives in
    // one); `out/` is the git-ignored output directory, not source.
    const walk = (rel: string): string[] =>
      readdirSync(join(DATASET_DIR, rel), { withFileTypes: true }).flatMap((d) => {
        const p = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) return d.name === "out" ? [] : walk(p);
        return d.name.endsWith(".ts") ? [p] : [];
      });
    const files = walk("");
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith("model-authoring/"))).toBe(true);
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

/**
 * e. The MODEL-AUTHORING config (`dataset/model-authoring/`): its briefs use a seed of their own
 * and must stay disjoint from both eval corpora AND from the published `repair` / `authoring`
 * splits, through the same `textReject` / `structReject` checks. The CLI checks against the files
 * actually uploaded to Hugging Face (downloaded, SHA-256-pinned by
 * `dataset/model-authoring/published.json`; generated with ArchLang 1.15.0, so not byte-equal to
 * a regeneration today). CI cannot download them, so here the published index is an in-repo
 * regeneration at the pinned seed: the full `authoring` split plus the first 40 `repair` rows (the
 * generator is sequential, so a smaller run is a prefix of a full one). This proves the gates
 * work; it is not the check against the published bytes.
 */
vdescribe("e. model-authoring config — briefs disjoint from both eval corpora and the published splits", () => {
  const published = generateAll({ repairRows: 40, authoringRows: DEFAULT_AUTHORING_ROWS, seed: DEFAULT_SEED });
  const publishedIdx = indexOfRows(published.repairJsonl, published.authoringJsonl);
  const corpora = { eval: holdout, fidelity: fidelityIndex(), published: publishedIdx };
  const set = buildBriefSet(DEFAULT_BRIEF_SEED, 12, corpora);

  it("checks against the published generator's own pinned seed and sizes, from a seed of its own", () => {
    expect(PUBLISHED).toEqual({
      seed: DEFAULT_SEED,
      repairRows: DEFAULT_REPAIR_ROWS,
      authoringRows: DEFAULT_AUTHORING_ROWS,
    });
    expect(DEFAULT_SEED).toBe(20260712);
    expect(DEFAULT_BRIEF_SEED).toBe(20261115);
    expect(set.entries).toHaveLength(12);
  });

  it("the published index is live: a published brief and a published plan are each rejected by it", () => {
    const a = JSON.parse(published.authoringJsonl.split("\n")[0]!) as { brief: string; source: string };
    const r = JSON.parse(published.repairJsonl.split("\n")[0]!) as { fixed_source: string };
    expect(textReject(a.brief, publishedIdx).reject).toBe(true);
    expect(structReject(a.source, publishedIdx).reject).toBe(true);
    expect(structReject(r.fixed_source, publishedIdx).reject).toBe(true);
    expect(publishedIdx.prompts.length).toBeGreaterThan(50);
  });

  it("no brief is a text look-alike of either eval corpus or of the published splits", () => {
    for (const e of set.entries) {
      for (const [name, idx] of Object.entries(corpora)) {
        expect(textReject(e.brief, idx).reject, `${e.brief_id} text vs ${name}`).toBe(false);
      }
      const grams = grams8(e.brief);
      for (const h of holdoutGrams)
        for (const g of h.grams) expect(grams.has(g), `${e.brief_id} vs ${h.id}`).toBe(false);
    }
  });

  it("the brief manifest is byte-deterministic from its seed", () => {
    expect(manifestJsonl(buildBriefSet(DEFAULT_BRIEF_SEED, 12, corpora).entries)).toBe(manifestJsonl(set.entries));
  });

  it("no brief repeats a published authoring brief or another brief", () => {
    const pub = new Set(
      published.authoringJsonl
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).brief as string),
    );
    const mine = set.entries.map((e) => e.brief);
    expect(new Set(mine).size).toBe(mine.length);
    for (const b of mine) expect(pub.has(b)).toBe(false);
  });

  it("dataset/ imports only the pure core and its own modules, never eval/", () => {
    const walk = (rel: string): string[] =>
      readdirSync(join(DATASET_DIR, rel), { withFileTypes: true }).flatMap((d) => {
        const p = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) return d.name === "out" ? [] : walk(p);
        return d.name.endsWith(".ts") ? [p] : [];
      });
    const core = resolve(DATASET_DIR, "..", "src", "index.js");
    let seen = 0;
    for (const f of walk("")) {
      const src = readFileSync(join(DATASET_DIR, f), "utf8");
      for (const m of src.matchAll(/ from "([^"]+)";/g)) {
        seen++;
        const spec = m[1]!;
        const abs = spec.startsWith(".") ? resolve(DATASET_DIR, dirname(f), spec) : spec;
        const ok = spec.startsWith("node:") || abs === core || (spec.startsWith(".") && abs.startsWith(DATASET_DIR));
        expect(ok, `${f} imports ${spec}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});
