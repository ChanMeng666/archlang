#!/usr/bin/env node
/**
 * Claim-safety and banned-number check across every paper.
 *
 * Sections C and D of `paper/SUBMISSION-CHECKLIST.md`, as a program. Each pattern
 * below corresponds to a claim this project's own prior-art audits retracted, or a
 * figure that was found to be unreproducible, mis-unitised or superseded. Reading
 * for these by eye is exactly the kind of check that passes without asserting
 * anything, which is the subject of the papers it is checking.
 *
 *   node paper/check-claims.mjs
 *
 * Exits non-zero on any hit. Comment lines are skipped: a note recording *why* a
 * claim is banned must not itself trip the check, or people delete the note.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = ["flagship", "nier", "demo"];

/** `re` must not appear in body text. `why` is shown so a hit is actionable. */
const BANNED = [
  // --- Section D: numbers that are wrong, unreproducible or superseded ---
  {
    re: /\b27 of 28\b|\b27\/28\b/i,
    why: "unreproducible mutation figure; the mutants were never committed. Cite the 56-mutant experiment.",
  },
  {
    re: /\b113\s*\/\s*113\b/,
    why: "that is a whole-FILE it() count that grows with the example gallery, not an agreement rate. Cite 73/73.",
  },
  {
    re: /\b71[- ]plan\b|\b71 plans\b/i,
    why: "the agreement corpus was never 71 in any committed revision. It is 73.",
  },
  {
    re: /\b136 keywords\b/i,
    why: "retyped total; the component counts sum to 142. Use the generated macro.",
  },
  // --- Section C: claims the project's own audits retracted ---
  {
    re: /\bthe first (?:textual|floor-plan|architecture|DSL|language|system)\b/i,
    why: "no 'first' claims: GLIDE 1975, Palladian 1978, PLaSM 1989/95, CGA 2008, FloorPlan-DSL 2022, Architext 2023.",
  },
  {
    re: /\bthe only (?:tool|language|system|compiler|DSL)\b/i,
    why: "no 'only' claims: PlanScript shipped a structural mirror 5.5 months earlier; arch-plotter three months before that.",
  },
  {
    re: /\bmissing primitive\b/i,
    why: "retired claim (banned item B8).",
  },
  {
    re: /no checkable text substrate/i,
    why: "refuted by IDS 1.0, epJSON, honeybee validate, DOE-2 BDL.",
  },
  {
    re: /\bno prior work exists\b/i,
    why: "negative claims must be 'we found no prior work naming this' — the search had stated holes.",
  },
  {
    re: /\b(?:ADA|ISO|building code)[- ]compliant\b/i,
    why: "no compliance claims (ADR 0005, liability).",
  },
  {
    re: /\bfeedback loop (?:beats|outperforms|does not (?:beat|help))\b/i,
    why: "no claim in EITHER direction about loop-vs-equal-budget resampling.",
  },
  {
    re: /\b(?:we|this) (?:benchmark|benchmarks)\b/i,
    why: "the 26-brief eval is not a benchmark and not a model score.",
  },
];

/** Numbers that must never travel without their caveat in the same sentence. */
const PAIRED = [
  {
    trigger: /\\factNpmThirty|\\factNpmNinety/,
    needs: /release|publish|cadence|not (?:users|installs|adoption)/i,
    why: "npm downloads must carry the release-cadence caveat in the same sentence.",
  },
  {
    trigger: /\\factGoneZ\b/,
    needs: /\\factGoneZValidOnly|sensitiv/i,
    why: "Gate G1's headline z must travel with the valid-only sensitivity result.",
  },
];

/**
 * Strip comments; an escaped percent is content, a leading % is a note.
 *
 * Whitespace is then COLLAPSED, which is load-bearing rather than cosmetic. LaTeX
 * source wraps at the margin, so a multi-word banned phrase is routinely split
 * across a newline. A planted "no prior work\nexists" evaded this check while the
 * two single-line plants beside it were caught — the guard was real and partial,
 * which is worse than absent because it reads as coverage.
 */
const body = (src) =>
  src
    .split("\n")
    .map((l) => {
      const i = l.indexOf("%");
      if (i < 0) return l;
      if (i > 0 && l[i - 1] === "\\") return l;
      return l.slice(0, i);
    })
    .join("\n")
    .replace(/\s+/g, " ");

let hits = 0;
for (const t of TARGETS) {
  const file = join(HERE, t, "main.tex");
  if (!existsSync(file)) {
    console.log(`  skip   ${t} (no main.tex)`);
    continue;
  }
  const text = body(readFileSync(file, "utf8"));

  for (const { re, why } of BANNED) {
    for (const m of text.matchAll(new RegExp(re.source, `g${re.flags.replace("g", "")}`))) {
      // Whitespace is collapsed for matching, so a line number would be a lie.
      // Report surrounding text instead — it is what you search for anyway.
      const ctx = text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70).trim();
      console.log(`BANNED  ${t}/main.tex  "${m[0]}"\n        ${why}\n        …${ctx}…`);
      hits++;
    }
  }

  for (const { trigger, needs, why } of PAIRED) {
    // Sentence-ish granularity: split on a period followed by whitespace.
    for (const sentence of text.split(/(?<=\.)\s/)) {
      if (trigger.test(sentence) && !needs.test(sentence)) {
        console.log(`UNPAIRED ${t}/main.tex  ${why}\n        …${sentence.trim().slice(0, 140)}…`);
        hits++;
      }
    }
  }
  console.log(`  checked ${t}`);
}

console.log(hits === 0 ? "\n✓ no banned claims or unpaired figures" : `\n✗ ${hits} problem(s)`);
process.exit(hits === 0 ? 0 : 1);
