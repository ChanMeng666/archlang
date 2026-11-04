#!/usr/bin/env node
// PreToolUse hook (Bash | PowerShell): the local gate is `check:quick` (+ `docs:build`).
// Heavy suites are CI's. A command that must run one locally (a release gate) carries the
// comment token `#allow-local-heavy` with a reason; it is a comment in both shells.
// The gate covers THIS repository only: a command that runs in another repository (a leading
// `cd`, `Set-Location` or `pushd`, or `npm --prefix`) is that repository's business.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEAVY = [
  [/(?:^|[;&|(]|\bnpx|\bpnpm|\byarn|\bbunx|\.bin[\\/])\s*vitest\b/, "vitest"],
  [/\bnpm\s+(?:run\s+)?test\b/, "npm test"],
  [/\bnpm\s+run\s+check(?![\w:-])/, "npm run check"],
  [/\bcheck:drift\b/, "check:drift (check:quick runs it)"],
  [/\btypecheck:all\b/, "typecheck:all"],
  [/\bcheck:3d\b/, "check:3d"],
  [/\bnpm\s+run\s+(?:e2e|bench)\b|\bplaywright\s+test\b/, "e2e / bench"],
];

/** Git Bash writes `/d/x`; Node on Windows wants `D:/x`. */
function nativePath(p) {
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return process.platform === "win32" && m ? `${m[1].toUpperCase()}:${m[2] ?? "/"}` : p;
}

/** The directory a command runs in: its leading `cd`/`Set-Location`/`pushd`, else `npm --prefix`, else cwd. */
export function targetDir(command, cwd) {
  const lead =
    /^\s*(?:cd|Set-Location|pushd)\s+(?:-(?:Literal)?Path\s+)?(["']?)([^"'&;|\r\n]+?)\1\s*(?:&&|;|\|\||$)/i.exec(
      command,
    );
  const prefix = /\bnpm\s+(?:[^&;|]*\s)?--prefix[=\s]+(["']?)([^"'\s&;|]+)\1/.exec(command);
  const raw = lead?.[2] ?? prefix?.[2];
  return raw ? resolve(cwd, nativePath(raw.trim())) : cwd;
}

/** The git common dir (shared by a repository's checkout and all its worktrees), or null. */
export function repoId(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return resolve(out.trim()).toLowerCase();
  } catch {
    return null;
  }
}

export function verdict(command, cwd, hookRepo) {
  if (!command || command.includes("#allow-local-heavy")) return null;
  // Match invocations, not mentions: drop heredoc bodies and quoted strings first.
  const bare = command.replace(/<<-?\s*['"]?\w+['"]?[\s\S]*$/, "").replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
  const hit = HEAVY.find(([re]) => re.test(bare));
  if (!hit) return null;
  const here = repoId(targetDir(command, cwd));
  // Another repository runs under its own rules. A directory outside any repository, or one that
  // cannot be read, is treated as this one: the gate fails closed.
  if (here !== null && here !== repoId(hookRepo)) return null;
  return hit[1];
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const hookRepo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const reason = verdict(String(input?.tool_input?.command ?? ""), input?.cwd || process.cwd(), hookRepo);
  if (!reason) process.exit(0);
  process.stderr.write(
    `Blocked by .claude/hooks/local-gate.mjs: ${reason} is CI's job, not a local gate.\n` +
      "Run `npm run check:quick` (+ `npm run docs:build` for docs), push, and read the PR's CI.\n" +
      "Only for an owner-sanctioned local run (release gates), append `#allow-local-heavy <reason>`.\n",
  );
  process.exit(2);
}

// Compare real paths: started through a junction or symlink, argv[1] keeps the link path.
const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) main();
