#!/usr/bin/env node
/**
 * Anonymity check for the double-anonymous NIER submission.
 *
 * ICSE NIER is double-anonymous. A leaked author name, e-mail, artifact URL or
 * package name is a desk-reject, and the failure is silent: the paper compiles,
 * looks finished, and identifies its authors. So this is a program.
 *
 *   node paper/check-anon.mjs            # check paper/nier
 *   node paper/check-anon.mjs <dir>      # check another target
 *
 * It scans the LaTeX source AND the generated `.bbl`, because the bibliography is
 * assembled at build time and is where a self-citation would appear without ever
 * being visible in `main.tex`. Exits non-zero on any hit.
 *
 * Deliberately over-broad: a false positive costs a glance, a false negative costs
 * the submission.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] ?? join(HERE, "nier"));

/** Identifying strings. Case-insensitive; `re` where a pattern is needed. */
const FORBIDDEN = [
  { what: "author name", re: /\bChan\s*Meng\b/i },
  { what: "author name (no space)", re: /\bchanmeng\b/i },
  { what: "GitHub owner", re: /ChanMeng666/i },
  { what: "e-mail", re: /ai@gavigo\.com/i },
  { what: "e-mail domain", re: /gavigo/i },
  { what: "subject system name", re: /\bArchLang\b/i },
  { what: "subject system name (lowercase id)", re: /\barchlang\b/i },
  { what: "project domain", re: /archlang\.uk/i },
  { what: "sibling project", re: /\bArchCanvas\b/i },
  { what: "npm scope", re: /@chanmeng666/i },
  { what: "marketplace publisher", re: /ChanMeng\.archlang/i },
  { what: "acknowledgements", re: /\\(section|subsection)\*?\{Acknowledg/i },
  { what: "funding note", re: /\\thanks\{/ },
  { what: "IEEE thanks block", re: /IEEEcompsocitemizethanks|IEEEauthorblockA/ },
  // First-person self-citation: "our previous work", "we previously showed", etc.
  { what: "first-person self-citation", re: /\bour (?:previous|earlier|prior) (?:work|paper|tool|system)\b/i },
  { what: "de-anonymising phrase", re: /\bin our (?:tool|compiler|language)\b/i },
];

/** Third-party names that MUST survive — anonymising them destroys the evidence. */
const MUST_KEEP = ["PlanScript", "ifc-lite", "arch-plotter", "shiplightai"];

const files = ["main.tex", "main.bbl"].map((f) => join(dir, f)).filter(existsSync);
if (files.length === 0) {
  console.error(`no main.tex / main.bbl under ${dir} — build first`);
  process.exit(1);
}

let hits = 0;
for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Strip %% comment lines: a note to ourselves about anonymity is not a leak, and
  // flagging it trains people to delete the note instead of reading it.
  const text = raw
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("%"))
    .join("\n");
  for (const { what, re } of FORBIDDEN) {
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags.includes("i") ? "gi" : "g"}`))) {
      const line = text.slice(0, m.index).split("\n").length;
      const ctx = text.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, " ");
      console.log(`LEAK  ${file}:${line}  ${what}: "${m[0]}"`);
      console.log(`        …${ctx}…`);
      hits++;
    }
  }
}

console.log("");
for (const name of MUST_KEEP) {
  const present = files.some((f) => readFileSync(f, "utf8").includes(name));
  console.log(`  ${present ? "kept" : "ABSENT"}  third-party name "${name}"`);
}

console.log(
  hits === 0
    ? `\n✓ no identifying strings in ${files.length} file(s) under ${dir}`
    : `\n✗ ${hits} identifying string(s) found — this submission is not anonymous`,
);
process.exit(hits === 0 ? 0 : 1);
