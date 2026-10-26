/**
 * The diagnostic-wording study (plan-soundness card PS1.4, `docs/plans/plan-soundness/README.md`
 * §8 Q3): the shared half of the harness. `build.ts` turns every defect-corpus case into four
 * author prompts that differ only in the diagnostic text; `score.ts` re-lints the replies.
 *
 * Every text an author sees is read from the compiler at run time: the case's own `lint()`
 * diagnostic (message and hints) and the catalogue (`ERROR_CATALOG`'s one-line `message` and its
 * `fix`). Nothing is retyped. The one hand-written part is `FACTS_EDITS`: per code, the edits that
 * cut a message down to its measured facts (no rule, no threshold, no consequence). An edit that
 * matches no message in the corpus throws, so a reworded message cannot silently pass through uncut. The method and its decisions are recorded in
 * `docs/plans/plan-soundness/research/2026-10-26-ps14-diagnostic-wording.md`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, ERROR_CATALOG, lint, offsetToLineCol } from "../../../src/index.js";
import type { Diagnostic } from "../../../src/index.js";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CORPUS = join(REPO, "test", "defect-corpus");

export const VARIANTS = ["facts", "rule", "fix", "current"] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * Per code, the edits that turn the message's first sentence into its measured facts. A code
 * not listed here uses its first sentence unchanged. Each pair is `[pattern, replacement]`.
 */
export const FACTS_EDITS: Readonly<Record<string, ReadonlyArray<readonly [RegExp, string]>>> = {
  W_ANNOTATION_OVERLAP: [[/, so the (?:label and the symbol|two) overprint each other on the drawing\.$/, "."]],
  W_LEAF_ACROSS_DOORWAY: [
    [/ \(\d+ mm needed\)/, ""],
    [/, so one door must be shut to use the other\.$/, "."],
  ],
  W_FURNITURE_OVER_WINDOW: [[/: a tall unit against the glass blocks its light and view\.$/, "."]],
  W_FOOTPRINT_TRANSPOSED: [
    [/ is drawn turned a quarter: its symbol is /, "'s symbol is "],
    [/, but an? \S+ is wider than it is deep .*$/, "."],
  ],
  W_WC_SIDE_CLEARANCE: [[/; a WC needs \d+ mm to each side \(\d+ mm short\)\.$/, "."]],
  W_HABITABLE_NO_WINDOW: [[/; a room people live in needs daylight\.$/, "."]],
  W_ROOM_MISSING_DEFINING: [[/: the pieces? that makes? it an? [^.]+\.$/, "."]],
  W_PATH_TOO_NARROW: [[/ \([^)]*\d+ mm minimum\)\.$/, "."]],
  W_OPENING_OVERLAP: [[/, under the \d+ mm of a mullion\.$/, "."]],
  W_DOOR_NEAR_CORNER: [
    [/^Door leaves too little wall at a corner — the nib between its jamb/, "The nib between the door's jamb"],
    [/ should be at least \d+ mm, the wall's own thickness, but measures /, " measures "],
    [/ \(\d+ mm short\)\.$/, "."],
  ],
  W_SWING_OBSTRUCTED: [
    [
      /^Door swing is obstructed — the swing needs (\d+) mm of clear radius but (.+) is (\d+) mm from the hinge \(\d+ mm short\)\.$/,
      "The door's leaf sweeps a radius of $1 mm from its hinge, and $2 is $3 mm from the hinge.",
    ],
  ],
  W_CONNECTOR_AMBIGUOUS: [
    [/ does not join two rooms cleanly — /, ": "],
    [/, so which room it opens into is a guess \(the access graph reads it as [^)]*\)\.$/, "."],
  ],
  W_FLOOR_UNASSIGNED: [[/, under \d+ %\.$/, "."]],
  W_BOUNDARY_NO_WALL: [[/, wider than a \d+ mm doorway\.$/, "."]],
};

/** The message's first sentence: up to the first `.` that a space and a capital, quote or `(` follow. */
export function firstSentence(message: string): string {
  const m = /\.\s+(?=[A-Z"(])/.exec(message);
  return m ? message.slice(0, m.index + 1) : message;
}

/** Which `FACTS_EDITS` patterns have matched some message this run: one that never does is stale. */
const editsUsed = new Set<RegExp>();

/**
 * The facts variant of a message, and how it was derived. A code's edits apply where they match
 * (a code can have more than one message form); `corpusCases` throws on an edit no message matched.
 */
export function factsOf(code: string, message: string): { text: string; derivation: string } {
  let text = firstSentence(message);
  const whole = text === message ? "whole message" : "first sentence";
  let applied = 0;
  for (const [pattern, replacement] of FACTS_EDITS[code] ?? []) {
    if (!pattern.test(text)) continue;
    text = text.replace(pattern, replacement);
    editsUsed.add(pattern);
    applied++;
  }
  return { text, derivation: applied ? `${whole} + template (${applied} edit${applied > 1 ? "s" : ""})` : whole };
}

/** The leading `# key: value` header block of a corpus file, and the rest. */
export function splitHeader(src: string): { header: Record<string, string>; body: string } {
  const lines = src.split("\n");
  let i = 0;
  const header: Record<string, string> = {};
  let last = "";
  for (; i < lines.length && lines[i]!.startsWith("#"); i++) {
    const kv = /^# ([a-z-]+): (.+)$/.exec(lines[i]!.replace(/\r$/, ""));
    if (kv) {
      header[kv[1]!] = kv[2]!.trim();
      last = kv[1]!;
    } else if (last) header[last] += ` ${lines[i]!.replace(/^#\s+/, "").trim()}`;
  }
  return { header, body: lines.slice(i).join("\n") };
}

/** Every code a plan raises: `lint()` plus the compile channel's warnings; and its compile errors. */
export function codesOf(source: string): { errors: string[]; counts: Map<string, number>; lint: Diagnostic[] } {
  const compiled = compile(source).diagnostics;
  const errors = compiled.filter((d) => d.severity === "error").map((d) => d.code ?? "?");
  const lintDiags = errors.length ? [] : lint(source);
  const counts = new Map<string, number>();
  for (const d of [...compiled.filter((x) => x.severity === "warning"), ...lintDiags]) {
    const c = d.code ?? "?";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return { errors, counts, lint: lintDiags };
}

/** A fingerprint of every diagnostic's words (spans left out), to prove a title edit moves nothing. */
const wordsOf = (source: string): string =>
  JSON.stringify([...compile(source).diagnostics, ...lint(source)].map((d) => [d.code, d.message, d.hints ?? []]));

export interface StudyCase {
  /** `<class>--<case>` */
  id: string;
  path: string;
  cls: string;
  code: string;
  /** The source the author is shown: the header block removed, the title neutralised when that moves nothing. */
  source: string;
  titleNeutralised: boolean;
  /** 1-based line of the shown diagnostic's span start, in `source`. */
  line: number;
  sourceLine: string;
  /** How many diagnostics of `code` the case raises (the author is shown the first). */
  instances: number;
  baselineCodes: Record<string, number>;
  texts: Record<Variant, string>;
  factsDerivation: string;
}

/** Every non-`.clean` corpus case, with whether its default `lint()` reports its expected code. */
export function corpusCases(): { all: number; skipped: string[]; cases: StudyCase[] } {
  const cases: StudyCase[] = [];
  const skipped: string[] = [];
  let all = 0;
  for (const cls of readdirSync(CORPUS)
    .filter((d) => statSync(join(CORPUS, d)).isDirectory())
    .sort()) {
    for (const f of readdirSync(join(CORPUS, cls))
      .filter((n) => n.endsWith(".arch") && !n.endsWith(".clean.arch"))
      .sort()) {
      all++;
      const path = `test/defect-corpus/${cls}/${f}`;
      const raw = readFileSync(join(CORPUS, cls, f), "utf8").replace(/\r\n/g, "\n");
      const { header, body } = splitHeader(raw);
      const code = header.expect!;
      const neutral = body.replace(/^(\s*plan\s+)"[^"]*"/m, '$1"Plan"');
      const titleNeutralised = neutral !== body && wordsOf(neutral) === wordsOf(body);
      const source = titleNeutralised ? neutral : body;
      const base = codesOf(source);
      const hits = base.lint.filter((d) => d.code === code);
      if (base.errors.length || hits.length === 0) {
        skipped.push(`${path} (${code}${base.errors.length ? `, compile errors ${base.errors.join(",")}` : ""})`);
        continue;
      }
      const d = hits[0]!;
      const start = d.span?.start ?? 0;
      const { line } = offsetToLineCol(source, start);
      const entry = ERROR_CATALOG[code];
      if (!entry) throw new Error(`${code} is not catalogued`);
      if (/\d/.test(entry.message)) throw new Error(`${code}: catalogue message has a number: ${entry.message}`);
      const hints = d.hints ?? [];
      const help = hints.map((h) => `= help: ${h}`);
      const facts = factsOf(code, d.message);
      cases.push({
        id: `${cls}--${f.slice(0, -".arch".length)}`,
        path,
        cls,
        code,
        source,
        titleNeutralised,
        line,
        sourceLine: source.split("\n")[line - 1]!.trim(),
        instances: hits.length,
        baselineCodes: Object.fromEntries([...base.counts].sort()),
        texts: {
          facts: facts.text,
          rule: entry.message,
          // The instance's own hints; the catalogue `fix` only when a diagnostic carries none.
          fix: help.length ? help.join("\n") : `= help: ${entry.fix}`,
          // As `arch lint` prints them: the message, each hint, then the catalogue's fix line.
          current: [d.message, ...help, `= fix: ${entry.fix}`].join("\n"),
        },
        factsDerivation: facts.derivation,
      });
    }
  }
  for (const [code, edits] of Object.entries(FACTS_EDITS))
    for (const [pattern] of edits)
      if (!editsUsed.has(pattern)) throw new Error(`${code}: facts edit ${pattern} matched no message`);
  return { all, skipped, cases };
}

/** The fixed author prompt; only `text` varies between the four variants of a case. */
export function authorPrompt(c: StudyCase, text: string): string {
  return [
    "Here is a floor plan written in ArchLang, a language whose `.arch` source compiles to an SVG floor plan.",
    "",
    "```arch",
    c.source.replace(/\n+$/, ""),
    "```",
    "",
    `The linter reports one warning, on line ${c.line} (\`${c.sourceLine}\`):`,
    "",
    text,
    "",
    "Make the minimal edit to the source that resolves this. Reply with the full file only.",
    "",
  ].join("\n");
}

/** Lines added plus lines removed by an LCS line diff (the `git diff --numstat` sum). */
export function changedLines(a: string, b: string): number {
  const x = a.replace(/\n+$/, "").split("\n");
  const y = b.replace(/\n+$/, "").split("\n");
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const lcs = dp[0]![0]!;
  return x.length - lcs + (y.length - lcs);
}
