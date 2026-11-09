#!/usr/bin/env node
// PreToolUse hook (Bash | PowerShell): the local gate is `check:quick` (+ `docs:build`).
// Heavy suites are CI's. A command that must run one locally (a release gate) carries the
// comment token `#allow-local-heavy` with a reason; it is a comment in both shells.
// The gate covers THIS repository only: a command that runs in another repository (a leading
// `cd`, `Set-Location` or `pushd`, or `npm --prefix`) is that repository's business.
//
// It also runs for Edit | Write | MultiEdit | NotebookEdit, and holds `RULES`: the recurring
// mistakes it refuses outright, whatever `#allow-local-heavy` says (see `RULES` below).
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEAVY = [
  [/(?:^|[;&|(]|\bnpx|\bpnpm|\byarn|\bbunx|\.bin[\\/])\s*vitest\b/, "vitest"],
  // `(?:--prefix…\s+)?`: `npm --prefix <dir> test` is the same call.
  [/\bnpm\s+(?:--prefix[=\s]+\S+\s+)?(?:run\s+)?test\b/, "npm test"],
  [/\bnpm\s+(?:--prefix[=\s]+\S+\s+)?run\s+check(?![\w:-])/, "npm run check"],
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

const DIR_CHANGE = /(?:^|&&|;|\|\||\||\()\s*(?:cd|chdir|Set-Location|sl|Push-Location|pushd|Pop-Location|popd)\b/gi;

/**
 * The directory a command runs in: its leading `cd`/`Set-Location`/`sl`/`Push-Location`/`pushd`,
 * else `npm --prefix`, else cwd. Null when that cannot be told from the text: more than one
 * directory change, `||` before the heavy call, a `cd` together with `--prefix`, or more than one
 * `--prefix`. Counting reads `bare` (quotes stripped), so a commit message never counts;
 * `heavyAt` is where the heavy call starts in `bare`.
 */
export function targetDir(command, cwd, bare = command, heavyAt = Number.POSITIVE_INFINITY) {
  const lead =
    /^\s*(?:cd|Set-Location|sl|Push-Location|pushd)\s+(?:-(?:Literal)?Path\s+)?(["']?)([^"'&;|\r\n]+?)\1\s*(?:&&|;|$)/i.exec(
      command,
    );
  const prefixes = [...bare.matchAll(/--prefix[=\s]+(\S+)/g)];
  const changes = bare.match(DIR_CHANGE)?.length ?? 0;
  const orAt = bare.indexOf("||");
  const orFirst = orAt !== -1 && orAt < heavyAt;
  if (changes > 1 || orFirst || prefixes.length > 1 || (changes > 0 && prefixes.length > 0)) return null;
  if (changes === 1 && !lead) return null;
  // `--prefix` moves only the npm call that carries it, so it decides only a single-call command.
  if (prefixes.length === 1 && (bare.match(/\b(?:npm|npx|vitest)\b/g)?.length ?? 0) > 1) return null;
  const prefixRaw = prefixes.length === 1 ? /--prefix[=\s]+(["']?)([^"'\s&;|]+)\1/.exec(command)?.[2] : undefined;
  const raw = lead?.[2] ?? prefixRaw;
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

/** Heredoc bodies are data, not commands. */
const dropHeredocs = (command) => command.replace(/<<-?\s*['"]?\w+['"]?[\s\S]*$/, "");
/** Invocations, not mentions: heredoc bodies dropped and every quoted string emptied. */
const bareOf = (command) => dropHeredocs(command).replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');

export function verdict(command, cwd, hookRepo) {
  if (!command || command.includes("#allow-local-heavy")) return null;
  // Match invocations, not mentions: drop heredoc bodies and quoted strings first.
  const bare = bareOf(command);
  const hit = HEAVY.find(([re]) => re.test(bare));
  if (!hit) return null;
  const heavyAt = Math.min(...HEAVY.map(([re]) => bare.search(re)).filter((i) => i >= 0));
  const dir = targetDir(command, cwd, bare, heavyAt);
  const here = dir === null ? null : repoId(dir);
  // Another repository runs under its own rules. An ambiguous command, a directory outside any
  // repository, or one that cannot be read is treated as this one: the gate fails closed.
  if (here !== null && here !== repoId(hookRepo)) return null;
  return hit[1];
}

// ---- RULES: recurring mistakes, refused outright ------------------------------------------------
//
// Each row: the tools it reads, why it exists (the incident), and `check(call)`, which returns the
// reason to refuse or null. `call` is `{ tool, input, cwd, hookRepo, env }` (`input` is the hook's
// `tool_input`). `#allow-local-heavy` does not lift a rule. Every row is exercised by
// `test/local-gate-hook.test.ts`, refused and allowed.

const SHELLS = ["Bash", "PowerShell"];
const EDITS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

const slash = (p) => p.replace(/\\/g, "/");
const fold = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

const REPO_IDS = new Map();
/** `repoId`, remembered: a hook process answers one call, but a test asks many. */
const repoIdOf = (dir) => {
  if (!REPO_IDS.has(dir)) REPO_IDS.set(dir, repoId(dir));
  return REPO_IDS.get(dir);
};

/**
 * A best-effort shell split: the simple commands of `command` (split on unquoted `;`, `&`, `|`,
 * parentheses and newlines), each as its words with the quotes removed. Bash escapes with `\`;
 * PowerShell with a backtick, its backslash being a path separator. A `#` that starts a word starts a
 * comment. Redirections (`2>&1`, `> f`) are dropped. A word holding `$` keeps it, so a rule can tell
 * it cannot read the word.
 */
export function simpleCommands(command, shell) {
  const esc = shell === "PowerShell" ? "`" : "\\";
  const s = dropHeredocs(command);
  const out = [];
  let words = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    const kept = [];
    // `> f` and `2> f` drop the file word too; `2>&1` and `>f` drop only themselves.
    for (let i = 0; i < words.length; i++) {
      if (/^(?:\d*|&)>>?$|^<$/.test(words[i])) i++;
      else if (!/^(?:\d*|&)>>?|^</.test(words[i])) kept.push(words[i]);
    }
    if (kept.length > 0) out.push(kept);
    words = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === esc && i + 1 < s.length) {
      if (s[i + 1] !== "\n") word += s[i + 1];
      i++;
      inWord = inWord || s[i] !== "\n";
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      const end = j < 0 ? s.length : j;
      word += s.slice(i + 1, end);
      i = end;
      inWord = true;
    } else if (c === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) {
        if (s[i] === esc && i + 1 < s.length && (shell === "PowerShell" || '"\\$`'.includes(s[i + 1]))) i++;
        word += s[i];
      }
      inWord = true;
    } else if (c === "#" && !inWord) {
      const j = s.indexOf("\n", i);
      if (j < 0) break;
      i = j - 1;
    } else if (c === "&" && (s[i - 1] === ">" || s[i + 1] === ">")) {
      word += c;
      inWord = true;
    } else if (";&|()\n".includes(c)) {
      endCommand();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return out;
}

/** The command's own name: `node_modules/.bin/vitest.cmd` → `vitest`. */
const commandName = (word) =>
  basename(slash(word))
    .toLowerCase()
    .replace(/\.(?:cmd|exe|ps1)$/, "");

/** The directory a command runs in, for a rule: its leading `cd`, else `cwd` (also when unclear). */
function runDir(command, cwd) {
  return targetDir(command, cwd, bareOf(command)) ?? cwd;
}

/** Whether `command` runs in another repository than the hook's (unclear counts as this one). */
function elsewhere(command, cwd, hookRepo) {
  const dir = targetDir(command, cwd, bareOf(command));
  const here = dir === null ? null : repoIdOf(dir);
  return here !== null && here !== repoIdOf(hookRepo);
}

// -- rule: a hand edit of a generated file --

const ARTIFACTS_JSON = ".claude/hooks/generated-artifacts.json";

/**
 * `{ "<path>": "<gen:script>" }` for every generated artifact: `GENERATORS` in
 * `scripts/generators.ts` (the table `check:drift` runs), rendered as JSON by
 * `npm run gen:generated-artifacts` because this hook cannot import TypeScript. Empty if unreadable.
 */
export function generatedArtifacts(repo) {
  try {
    return JSON.parse(readFileSync(resolve(repo, ARTIFACTS_JSON), "utf8")).artifacts ?? {};
  } catch {
    return {};
  }
}

/** The checkout `file` belongs to (its nearest existing folder's `git rev-parse --show-toplevel`), or null. */
function toplevelOf(file) {
  let dir = dirname(file);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return resolve(nativePath(out.trim()));
  } catch {
    return null;
  }
}

function generatedEdit({ input, cwd, hookRepo, env }) {
  const raw = input?.file_path ?? input?.notebook_path;
  if (typeof raw !== "string" || raw === "" || env.ARCHLANG_ALLOW_GENERATED_EDIT === "1") return null;
  const abs = resolve(cwd, nativePath(raw));
  const artifacts = generatedArtifacts(hookRepo);
  // A cheap text test first, so an ordinary edit spawns no git.
  const tail = fold(slash(abs));
  if (!tail.includes("/dist/") && !Object.keys(artifacts).some((a) => tail.endsWith(`/${fold(a)}`))) return null;
  const top = toplevelOf(abs);
  if (top === null || repoIdOf(top) !== repoIdOf(hookRepo)) return null; // every worktree of this repository counts
  const rel = slash(relative(top, abs));
  const key = Object.keys(artifacts).find((a) => fold(a) === fold(rel));
  if (key) return `${key} is generated by \`npm run ${artifacts[key]}\`; edit the generator or its source, then run it`;
  const parts = rel.split("/");
  if (parts.includes("dist") && !parts.includes("node_modules") && !parts.includes("..")) {
    return `${rel} is build output under dist/; edit the source and rebuild (\`npm run build\`)`;
  }
  return null;
}

// -- rule: a filtered snapshot update --

/** The arguments a simple command passes to vitest (`npx vitest …`, `npm test -- …`), or null. */
function vitestArgs(words) {
  const at = words.findIndex((w) => commandName(w) === "vitest");
  if (at >= 0) return words.slice(at + 1);
  if (commandName(words[0] ?? "") !== "npm") return null;
  // `--prefix <dir>` and `--prefix=<dir>` move the call, not its arguments: drop the flag and its value.
  const rest = [];
  for (let i = 1; i < words.length; i++) {
    if (words[i] === "--prefix") i++;
    else if (!words[i].startsWith("--prefix=")) rest.push(words[i]);
  }
  const i = rest[0] === "run" || rest[0] === "run-script" ? 1 : 0;
  return rest[i] === "test" || rest[i] === "t" ? rest.slice(i + 1) : null;
}

/** Vitest flags that take the next word as their value (so it is not a file filter). */
const VITEST_VALUE_FLAG =
  /^(?:-c|--config|-r|--root|--dir|--project|--shard|--reporter|--outputFile|--environment|--pool|--mode|--exclude)$/;
/** The one scoped update `docs/testing.md` § 3 allows: groups 2–4 of fixture-byte-identity. */
const REBLESS = "re-blessed when redrawn";
const FIXTURE_PINS = "fixture-byte-identity";
const PINS_FILE = `test/${FIXTURE_PINS}.test.ts`;

/**
 * Whether a vitest file filter selects the pins file. Vitest matches a filter as a substring of the
 * path, so `fixture-byte`, `byte-identity` or `test/fixture-byte-identity` select it as surely as the
 * full name; a filter with no part of its stem (`test`) selects the whole suite, an unfiltered run.
 */
const selectsPins = (f) => {
  const p = f.replace(/^(?:\.\/)+/, "");
  return p.includes(FIXTURE_PINS) || (PINS_FILE.includes(p) && /fixture|byte|ident/.test(p));
};

/** `{ update, filter, files }` read from vitest's arguments. */
export function vitestRun(args) {
  const run = { update: false, filter: undefined, files: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = /^(-t|--testNamePattern)=([\s\S]*)$/.exec(a);
    if (a === "-u" || a === "--update" || /^--update=(?!false$)/.test(a)) run.update = true;
    else if (eq) run.filter = eq[2];
    else if (a === "-t" || a === "--testNamePattern") run.filter = args[++i] ?? "";
    else if (VITEST_VALUE_FLAG.test(a)) i++;
    else if (!a.startsWith("-") && a !== "run" && a !== "watch") run.files.push(slash(a));
  }
  return run;
}

function filteredUpdate({ tool, input, cwd, hookRepo }) {
  const command = typeof input?.command === "string" ? input.command : "";
  if (!/(?:^|\s)(?:-u|--update)(?:\s|=|$)/.test(command)) return null;
  for (const words of simpleCommands(command, tool)) {
    const args = vitestArgs(words);
    if (!args) continue;
    const { update, filter, files } = vitestRun(args);
    if (!update) continue;
    const pins = files.some(selectsPins);
    let reason = null;
    if (filter !== undefined) {
      const scoped = filter === REBLESS && files.length > 0 && files.every((f) => f.includes(FIXTURE_PINS));
      if (!scoped)
        reason =
          "a filtered snapshot update (`-u` with `-t`) deletes every snapshot the filter skipped as obsolete; " +
          `run \`-u\` unfiltered and read the diff. The one scoped form is \`-u -t "${REBLESS}" test/${FIXTURE_PINS}.test.ts\``;
    } else if (pins) {
      reason =
        `\`-u\` on ${FIXTURE_PINS} rewrites its PERMANENT group 1 too; scope it: ` +
        `\`-u -t "${REBLESS}" test/${FIXTURE_PINS}.test.ts\`, then confirm group 1 is untouched in the diff`;
    }
    if (reason && !elsewhere(command, cwd, hookRepo)) return reason;
  }
  return null;
}

// -- rule: a recursive delete through a junction or symlink --

const PS_REMOVE = new Set(["remove-item", "rm", "ri", "del", "erase", "rd", "rmdir"]);
const PS_RECURSE = /^-r(?:e(?:c(?:u(?:r(?:se?)?)?)?)?)?(?::\$true)?$/i;
const PS_PATH = /^-(?:path|literalpath|lp|pspath)$/i;
const PS_VALUE = /^-(?:filter|include|exclude|credential|stream)$/i;

/**
 * The paths a command deletes recursively, best effort: `rm -r…` (Bash), `Remove-Item … -Recurse`
 * and its aliases (PowerShell), `git worktree remove` (with or without `--force`; it deletes the
 * worktree folder either way) and `[System.IO.Directory]::Delete(<literal>, $true)`. Each is
 * `{ path, base? }`; `base` is a `git -C` folder.
 */
export function deleteTargets(command, shell) {
  const targets = [];
  for (const raw of simpleCommands(command, shell)) {
    const start = raw.findIndex((w) => !/^[A-Za-z_]\w*=/.test(w)); // drop `X=1` prefixes
    if (start < 0) continue;
    const words = raw.slice(start);
    const name = commandName(words[0] ?? "");
    if (name === "git") {
      let base;
      let i = 1;
      for (; i < words.length && words[i].startsWith("-"); i++) if (words[i] === "-C") base = words[++i];
      if (words[i] === "worktree" && words[i + 1] === "remove") {
        for (const a of words.slice(i + 2)) if (!a.startsWith("-")) targets.push({ path: a, base });
      }
    } else if (shell !== "PowerShell" && name === "rm") {
      let options = true;
      let recursive = false;
      const paths = [];
      for (const a of words.slice(1)) {
        if (options && a === "--") options = false;
        else if (options && a === "--recursive") recursive = true;
        else if (options && /^-[A-Za-z]+$/.test(a)) recursive ||= /[rR]/.test(a);
        else if (!(options && a.startsWith("--"))) paths.push(a);
      }
      if (recursive) for (const path of paths) targets.push({ path });
    } else if (shell === "PowerShell" && PS_REMOVE.has(name)) {
      let recursive = false;
      const paths = [];
      for (let i = 1; i < words.length; i++) {
        const a = words[i];
        const named = /^(-\w+):(.+)$/.exec(a);
        if (PS_RECURSE.test(a)) recursive = true;
        else if (named && PS_PATH.test(named[1])) paths.push(...named[2].split(","));
        else if (PS_PATH.test(a)) paths.push(...(words[++i] ?? "").split(","));
        else if (PS_VALUE.test(a)) i++;
        else if (!a.startsWith("-")) paths.push(...a.split(","));
      }
      if (recursive) for (const path of paths) if (path) targets.push({ path });
    }
  }
  const dotnet = /\[(?:System\.)?IO\.Directory\]::Delete\(\s*(["'])([^"']+)\1\s*,\s*\$true\s*\)/gi;
  for (const m of dropHeredocs(command).matchAll(dotnet)) targets.push({ path: m[2] });
  return targets;
}

/** How many folder entries one check reads at most; a larger tree is read only that far. */
const LINK_SCAN_LIMIT = 5000;

/** How deep below a delete's target the link check reads (a scratch folder holds worktrees 2–4 down). */
const LINK_SCAN_DEPTH = 6;

/**
 * The junctions and symlinks at `path` or below it to `depth` levels, never following one. Read
 * breadth-first, so the scan cap is spent on the shallow levels, where a worktree's `node_modules`
 * sits, before a deep tree. On Windows, Node reports a junction as a symbolic link.
 */
export function linksUnder(path, depth = LINK_SCAN_DEPTH) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return [];
  }
  if (st.isSymbolicLink()) return [path];
  if (!st.isDirectory()) return [];
  const found = [];
  let read = 0;
  let level = [path];
  for (let d = 0; d < depth && level.length > 0; d++) {
    const next = [];
    for (const dir of level) {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (++read > LINK_SCAN_LIMIT) return found;
        const child = resolve(dir, e.name);
        if (e.isSymbolicLink()) found.push(child);
        else if (e.isDirectory()) next.push(child);
      }
    }
    level = next;
  }
  return found;
}

/** The absolute paths a target word names (a `*`/`?` in its last segment expanded), or [] if unreadable. */
function expandTarget(word, base) {
  if (word === "" || /[$`%]/.test(word)) return []; // a variable or a substitution: cannot tell
  const abs = resolve(base, nativePath(word.replace(/^~(?=$|[\\/])/, homedir())));
  if (!/[*?]/.test(abs)) return [abs];
  const dir = dirname(abs);
  if (/[*?]/.test(dir)) return [];
  const glob = basename(abs)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const re = new RegExp(`^${glob}$`, process.platform === "win32" ? "i" : "");
  try {
    return readdirSync(dir)
      .filter((n) => re.test(n))
      .map((n) => resolve(dir, n));
  } catch {
    return [];
  }
}

function deleteThroughLink({ tool, input, cwd }) {
  const command = typeof input?.command === "string" ? input.command : "";
  if (!/\b(?:rm|Remove-Item|ri|del|erase|rd|rmdir)\b|worktree\s+remove|Directory\]::Delete/i.test(command)) return null;
  const here = runDir(command, cwd);
  for (const { path, base } of deleteTargets(command, tool)) {
    const from = base ? resolve(here, nativePath(base)) : here;
    for (const abs of expandTarget(path, from)) {
      const links = linksUnder(abs);
      if (links.length === 0) continue;
      const more = links.length > 1 ? ` (and ${links.length - 1} more: ${links.slice(1, 4).join(", ")})` : "";
      return (
        `a recursive delete of ${abs} would follow the link ${links[0]}${more}; ` +
        `unlink the junction first: \`[System.IO.Directory]::Delete('${links[0]}')\` (never recursive), then delete`
      );
    }
  }
  return null;
}

export const RULES = [
  {
    id: "generated-edit",
    tools: EDITS,
    why:
      "A hand edit of a generated file is overwritten by its `gen:*` and was caught only by CI's drift gate. " +
      "A hook sees only `tool_input` (no comment channel), so the escape is the environment: " +
      "ARCHLANG_ALLOW_GENERATED_EDIT=1 in the shell that starts Claude Code.",
    check: generatedEdit,
  },
  {
    id: "filtered-update",
    tools: SHELLS,
    why:
      "A filtered `vitest -u -t` deleted snapshot.test.ts's multi-level plans, and a scoped `-u` on " +
      "fixture-byte-identity rewrites its PERMANENT group 1 (docs/testing.md § 3). `#allow-local-heavy` does not lift it.",
    check: filteredUpdate,
  },
  {
    id: "delete-through-link",
    tools: SHELLS,
    why:
      "A recursive delete follows a worktree's node_modules junction into the primary checkout " +
      "(26 orphan worktree husks, 2026-11-09). The PowerShell tool blocks `cmd /c rmdir`.",
    check: deleteThroughLink,
  },
];

/** The first rule that refuses this hook input (`{ tool_name, tool_input, cwd }`), or null. */
export function decide(input, hookRepo, env = process.env) {
  const call = {
    tool: String(input?.tool_name ?? ""),
    input: input?.tool_input ?? {},
    cwd: input?.cwd || process.cwd(),
    hookRepo,
    env,
  };
  for (const rule of RULES) {
    if (!rule.tools.includes(call.tool)) continue;
    const reason = rule.check(call);
    if (reason) return { rule: rule.id, reason, why: rule.why };
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const hookRepo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  let hit = null;
  try {
    hit = decide(input, hookRepo);
  } catch (e) {
    // A rule that cannot read its input never blocks the tool; it says so.
    process.stderr.write(`local-gate.mjs: a rule failed (${e?.message ?? e}); not blocking.\n`);
  }
  if (hit) {
    process.stderr.write(`Blocked by .claude/hooks/local-gate.mjs [${hit.rule}]: ${hit.reason}.\nWhy: ${hit.why}\n`);
    process.exit(2);
  }
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
