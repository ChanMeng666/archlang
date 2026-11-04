#!/usr/bin/env node
// PreToolUse hook (Bash | PowerShell): the local gate is `check:quick` (+ `docs:build`).
// Heavy suites are CI's. A command that must run one locally (a release gate) carries the
// comment token `#allow-local-heavy` with a reason; it is a comment in both shells.
import { readFileSync } from "node:fs";

const HEAVY = [
  [/(?:^|[;&|(]|\bnpx|\bpnpm|\byarn|\bbunx|\.bin[\\/])\s*vitest\b/, "vitest"],
  [/\bnpm\s+(?:run\s+)?test\b/, "npm test"],
  [/\bnpm\s+run\s+check(?![\w:-])/, "npm run check"],
  [/\bcheck:drift\b/, "check:drift (check:quick runs it)"],
  [/\btypecheck:all\b/, "typecheck:all"],
  [/\bcheck:3d\b/, "check:3d"],
  [/\bnpm\s+run\s+(?:e2e|bench)\b|\bplaywright\s+test\b/, "e2e / bench"],
];

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const command = String(input?.tool_input?.command ?? "");
if (!command || command.includes("#allow-local-heavy")) process.exit(0);

// Match invocations, not mentions: drop heredoc bodies and quoted strings (commit messages,
// PR bodies, grep patterns) before testing.
const bare = command.replace(/<<-?\s*['"]?\w+['"]?[\s\S]*$/, "").replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
const hit = HEAVY.find(([re]) => re.test(bare));
if (!hit) process.exit(0);

process.stderr.write(
  `Blocked by .claude/hooks/local-gate.mjs: ${hit[1]} is CI's job, not a local gate.\n` +
    "Run `npm run check:quick` (+ `npm run docs:build` for docs), push, and read the PR's CI.\n" +
    "Only for an owner-sanctioned local run (release gates), append `#allow-local-heavy <reason>`.\n",
);
process.exit(2);
