#!/usr/bin/env node
// Risk tier of a change, read from the paths it touches (the change sets the tier, not the author).
//   low    — CI green is enough to merge.
//   medium — plus one independent review in a fresh context, against REVIEW.md.
//   high   — plus the owner's approval in words; an agent never merges it.
// The highest tier any path reaches wins. Usage:
//   node scripts/risk-tier.mjs [base]        (default base: origin/main; diffs base...HEAD)
//   node scripts/risk-tier.mjs --files a b c
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Each rule: [tier, pattern, why]. Checked high first; the first match decides a path's tier. */
export const RULES = [
  ["high", /^\.github\/(workflows|actions)\//, "CI or release workflow"],
  ["high", /^\.github\/CODEOWNERS$/, "ownership"],
  ["high", /^\.claude\/(settings\.json|hooks\/)/, "agent permissions or hooks"],
  ["high", /^(AGENTS\.md|CLAUDE\.md|docs\/agents\/iron-laws\.md|REVIEW\.md)$/, "owner rules"],
  ["high", /^brand\/archlang-logo-master\.svg$/, "byte-sacred logo master"],
  ["high", /^(dataset\/canary\.ts|eval\/rubric\.md)$/, "frozen eval artifact"],
  ["high", /^(LICENSE|SECURITY\.md|GOVERNANCE\.md)$/, "project policy"],
  ["high", /(^|\/)server\.json$/, "MCP registry manifest"],
  ["medium", /^(src|packages\/[^/]+\/src|editors|playground\/src|docs-site\/\.vitepress)\//, "code"],
  [
    "medium",
    /^(scripts|tools|bench|eval|dataset|plugins|skills|integrations|schemas|grammars)\//,
    "tooling or shipped asset",
  ],
  ["medium", /^(test|playground\/test|packages\/[^/]+\/test|e2e)\//, "tests (a weakened check is a blocker)"],
  ["medium", /^examples\//, "examples feed goldens and digests"],
  ["medium", /(^|\/)package(-lock)?\.json$/, "dependencies or versions"],
  [
    "medium",
    /^(README\.md|spec\.llm\.md|llms(-full)?\.txt|CITATION\.cff|tsconfig[^/]*\.json|biome\.jsonc|vitest\.config\.ts|tsup\.config\.ts)$/,
    "public face or build config",
  ],
  ["low", /\.md$/, "prose"],
  ["low", /^\.claude\/(rules|commands|agents)\//, "agent prose"],
];

const RANK = { low: 0, medium: 1, high: 2 };

/** Unmatched paths default to medium: an unknown path is not evidence of low risk. */
export function classify(files) {
  let tier = "low";
  const reasons = [];
  for (const file of files) {
    const rule = RULES.find(([, re]) => re.test(file));
    const [t, , why] = rule ?? ["medium", null, "unclassified path"];
    reasons.push({ file, tier: t, why });
    if (RANK[t] > RANK[tier]) tier = t;
  }
  if (files.length === 0) tier = "low";
  return { tier, reasons };
}

function main(argv) {
  let files;
  if (argv[0] === "--files") files = argv.slice(1);
  else {
    const base = argv[0] ?? "origin/main";
    const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    // Committed on the branch, plus anything not yet committed: an unpushed edit still counts.
    files = [
      ...new Set([
        ...git("diff", "--name-only", `${base}...HEAD`),
        ...git("diff", "--name-only", "HEAD"),
        ...git("ls-files", "--others", "--exclude-standard"),
      ]),
    ];
  }
  if (files.length === 0) console.log("  (no changed files)");
  const { tier, reasons } = classify(files);
  for (const r of reasons.filter((x) => x.tier === tier)) console.log(`  ${r.tier.padEnd(6)} ${r.file}  (${r.why})`);
  console.log(`risk tier: ${tier}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
