#!/usr/bin/env node
// Risk tier of a change, read from the paths it touches (the change sets the tier, not the author).
//   low    — CI green is enough to merge.
//   medium — plus one independent review in a fresh context, against REVIEW.md.
//   high   — plus the owner's approval in words; an agent never merges it.
// The highest tier any path reaches wins; a path no rule names is medium. Usage:
//   node scripts/risk-tier.mjs [base]        (default base: origin/main; base...HEAD plus uncommitted)
//   node scripts/risk-tier.mjs --files a b c
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Each rule: [tier, pattern, why]. The first match decides a path's tier, so high rules come first. */
export const RULES = [
  // The rules that decide review depth, and everything that decides what CI checks.
  ["high", /^(scripts\/risk-tier\.mjs|REVIEW\.md|docs\/agents\/commands\.md)$/, "the review policy itself"],
  ["high", /^\.github\/(workflows|actions)\/|^\.github\/(CODEOWNERS|dependabot\.yml)$/, "CI, release or ownership"],
  ["high", /^(package\.json|vitest\.config\.ts|scripts\/check-[^/]+)$/, "what CI runs and checks"],
  ["high", /(^|\/)[^/]*baseline[^/]*\.json$/, "a pinned baseline"],
  ["high", /^\.(gitleaksignore|gitattributes)$/, "secret scan or byte handling"],
  ["high", /^\.claude\/(settings\.json|hooks\/)/, "agent permissions or hooks"],
  ["high", /^(AGENTS\.md|CLAUDE\.md|docs\/agents\/iron-laws\.md)$/, "owner rules"],
  ["high", /^brand\/archlang-logo-master\.svg$/, "byte-sacred logo master"],
  ["high", /^(dataset\/canary\.ts|eval\/rubric\.md)$/, "frozen eval artifact"],
  ["high", /^(LICENSE|SECURITY\.md|GOVERNANCE\.md)$/, "project policy"],
  ["high", /(^|\/)server\.json$|^\.claude-plugin\//, "registry or marketplace manifest"],
  ["high", /(^|\/)wrangler\.jsonc?$|(^|\/)public\/_(headers|redirects)$/, "deploy config"],
  // Internal prose that ships nowhere and that no check reads as truth.
  ["low", /^docs\/(plans|agents)\/.*\.md$/, "internal prose"],
  ["low", /^docs\/(cli-reference|error-codes)\.md$/, "generated; the drift gate catches hand edits"],
  ["low", /^\.claude\/(rules|commands|agents)\//, "agent prose"],
  ["low", /^\.github\/ISSUE_TEMPLATE\/|^(CONTRIBUTING|CODE_OF_CONDUCT|SUPPORT)\.md$/, "contributor prose"],
  // Everything else is medium: code, tests, examples, tooling, published and public text.
];

const RANK = { low: 0, medium: 1, high: 2 };

/** Normalise `.\a\b`, `./a/b` and `a\b` to `a/b`, so a path form never lowers a tier. */
export function normalise(file) {
  return file.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

export function classify(files) {
  let tier = "low";
  const reasons = [];
  for (const raw of files) {
    const file = normalise(raw);
    const rule = RULES.find(([, re]) => re.test(file));
    const [t, , why] = rule ?? ["medium", null, "code, tests, tooling or public text"];
    reasons.push({ file, tier: t, why });
    if (RANK[t] > RANK[tier]) tier = t;
  }
  return { tier, reasons };
}

function changedFiles(base) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  // --no-renames: a rename reports the deleted old path too, so moving a workflow cannot hide it.
  return [
    ...new Set([
      ...git("diff", "--name-only", "--no-renames", `${base}...HEAD`),
      ...git("diff", "--name-only", "--no-renames", "HEAD"),
      ...git("ls-files", "--others", "--exclude-standard"),
    ]),
  ];
}

function main(argv) {
  let files;
  if (argv[0] === "--files") files = argv.slice(1);
  else {
    const base = argv[0] ?? "origin/main";
    try {
      files = changedFiles(base);
    } catch {
      console.error(`risk-tier: cannot diff against ${base} (not a git checkout, or the ref is missing).`);
      process.exit(1);
    }
  }
  if (files.length === 0) console.log("  (no changed files)");
  const { tier, reasons } = classify(files);
  for (const r of reasons.filter((x) => x.tier === tier)) console.log(`  ${r.tier.padEnd(6)} ${r.file}  (${r.why})`);
  console.log(`risk tier: ${tier}`);
}

// Compare real paths: started through a junction or symlink, argv[1] keeps the link path.
const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) main(process.argv.slice(2));
