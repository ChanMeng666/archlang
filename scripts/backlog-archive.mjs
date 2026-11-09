#!/usr/bin/env node
/**
 * Move the closed entries of `docs/backlog.md` out of the repository (card EH3.2, ruling EH-D4).
 *
 *   node scripts/backlog-archive.mjs --lab <path to archlang-lab> [--date YYYY-MM-DD] [--dry]
 *
 * An entry is a `### ` heading and its body up to the next `### ` or `## `. Its status is read from
 * the heading's tail (`— \`todo\``, `— closed by W3b`, ...):
 *
 *   ARCHIVE  closed…, done, won't fix, decided…, measured…   moved VERBATIM to
 *            `<lab>/backlog-archive.md` under a dated section, in backlog order
 *   KEEP     todo, declared, parked, deferred, decision, note   stay; the heading is normalised to
 *            `### <id> · <title> — \`<status>\`` (a qualifier such as "(needs a decision)" moves
 *            into the title as a parenthetical; the body is untouched). A `todo` whose qualifier
 *            says it waits on the owner reads `decision`, so the /loop driver skips it.
 *
 * Where another tracked file (docs/, src/, test/, .claude/, CHANGELOG.md, or what stays of the
 * backlog) cites an archived id, the entry leaves a one-line tombstone
 * `- <id> · <title> — <status> → archived (lab)`; otherwise it is deleted. A `## ` section whose
 * entries were all archived is dropped unless one of them keeps a tombstone. Re-running on a clean
 * backlog changes nothing.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = join(ROOT, "docs", "backlog.md");

/** Headings that carry no `<id> · ` today: the id they get. */
const NOTE_IDS = new Map([
  ["Not scheduled — recorded so they are not lost", "NS"],
  ["Settled — never re-propose", "SET"],
]);

/** The axe section reused A.1–A.3, which are also the a11y section's ids: it becomes AX.*. */
const RENAME_SECTION = { prefix: "Accessibility — axe findings", from: /^A\.(\d+)$/, to: "AX.$1" };

const STATUS_WORD = "(?:todo|declared|deferred|parked|done|won't fix|closed|decided|measured)";
const SPLIT = new RegExp(`\\s—\\s(?=\`?${STATUS_WORD}\\b)`, "g");

/** Qualifiers that make a `todo` a `decision`: an owner ruling, or a rejection awaiting reversal. */
const DECISION =
  /needs (?:an? )?(?:owner-approved|decision)|owner decision|decision needed|rejected for now|^\(?decision:/i;

/** `{ id, title, status, qualifier, archive, original }` for one `### ` line, or throws. */
export function parseHeading(line) {
  const text = line.replace(/^###\s+/, "");
  let cut = -1;
  for (const m of text.matchAll(SPLIT)) cut = m.index;
  let head = text;
  let tail = "";
  if (cut >= 0) {
    head = text.slice(0, cut);
    tail = text.slice(cut).replace(/^\s—\s/, "");
  }
  const bare = tail.replace(/^`([^`]+)`/, "$1");
  const word = new RegExp(`^${STATUS_WORD}`).exec(bare)?.[0];
  const idm = /^(\S+) · (.*)$/s.exec(head);
  if (!word) {
    // No status in the heading: an id-bearing one is a note, a bare one needs NOTE_IDS.
    const whole = NOTE_IDS.get(text);
    if (whole) return { id: whole, title: text, status: "note", qualifier: "", archive: false, original: "" };
    if (idm) return { id: idm[1], title: idm[2], status: "note", qualifier: "", archive: false, original: "" };
    throw new Error(`cannot classify the heading: ${line}`);
  }
  if (!idm) throw new Error(`heading has a status but no "<id> · ": ${line}`);
  const archive = /^(closed|done|won't fix|decided|measured)$/.test(word);
  const qualifier = bare
    .slice(word.length)
    .replace(/^[\s,:]+/, "")
    .trim();
  const status = word === "todo" && DECISION.test(qualifier) ? "decision" : word;
  return { id: idm[1], title: idm[2], status, qualifier, archive, original: tail.replace(/`/g, "") };
}

/** `### <id> · <title> — \`<status>\`` for a kept entry. */
export function normaliseHeading(h) {
  let title = h.title;
  if (h.qualifier) title += /^\(.*\)$/.test(h.qualifier) ? ` ${h.qualifier}` : ` (${h.qualifier})`;
  return `### ${h.id} · ${title} — \`${h.status}\``;
}

/** Split into preamble + sections; a section is `{ title, head, preface[], entries[] }`. */
export function parseBacklog(src) {
  const out = { preamble: [], sections: [] };
  let sec = null;
  let ent = null;
  for (const line of src.split("\n")) {
    if (/^## /.test(line)) {
      sec = { title: line.slice(3), head: line, preface: [], entries: [] };
      out.sections.push(sec);
      ent = null;
    } else if (/^### /.test(line)) {
      if (!sec) throw new Error("an entry before the first section");
      ent = { heading: line, body: [] };
      sec.entries.push(ent);
    } else if (ent) ent.body.push(line);
    else if (sec) sec.preface.push(line);
    else out.preamble.push(line);
  }
  return out;
}

function idsOf(id) {
  const range = /^([A-Z]+)\.(\d+)–[A-Z]+\.(\d+)$/.exec(id);
  if (!range) return [id];
  const ids = [];
  for (let n = Number(range[2]); n <= Number(range[3]); n++) ids.push(`${range[1]}.${n}`);
  return ids;
}

/** Does any line cite `id`? Numeric ids (6.8) also need the line to talk about the backlog. */
function cited(id, lines) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w.])${esc}(?![\\w]|\\.\\d)`);
  const numeric = /^\d/.test(id);
  return lines.some((l) => re.test(l) && (!numeric || /backlog|entry|item|§/i.test(l)));
}

/**
 * The pure core: `src` is the backlog text, `otherLines` the lines of every other tracked file that
 * may cite an id. Returns the new backlog, the archive body, the tombstoned ids and the heading mapping.
 */
export function archiveBacklog(src, otherLines) {
  const doc = parseBacklog(src);
  const mapping = new Map();
  for (const sec of doc.sections) {
    for (const e of sec.entries) {
      e.h = parseHeading(e.heading);
      if (sec.title.startsWith(RENAME_SECTION.prefix)) e.h.id = e.h.id.replace(RENAME_SECTION.from, RENAME_SECTION.to);
      if (!e.h.archive) {
        const key = `${e.heading.replace(/^###\s+\S+ · /, "").replace(/^.*\s—\s/, "— ")} => ${e.h.status}`;
        mapping.set(key, (mapping.get(key) ?? 0) + 1);
      }
    }
  }

  // What stays (before any tombstone), to know which archived ids it still cites.
  const stays = doc.sections.filter((sec) => sec.entries.length === 0 || sec.entries.some((e) => !e.h.archive));
  const keptText = [
    ...doc.preamble,
    ...stays.flatMap((s) => [
      s.head,
      ...s.preface,
      ...s.entries.filter((e) => !e.h.archive).flatMap((e) => [e.heading, ...e.body]),
    ]),
  ].join("\n");
  const lines = [...otherLines, ...keptText.split("\n")];
  for (const sec of doc.sections) {
    for (const e of sec.entries) e.tomb = e.h.archive && idsOf(e.h.id).some((i) => cited(i, lines));
  }
  // A section with a tombstone stays, so the tombstone is not lost with it.
  const keptSections = doc.sections.filter(
    (sec) => sec.entries.length === 0 || sec.entries.some((e) => !e.h.archive || e.tomb),
  );

  const tombstoned = [];
  const out = [...doc.preamble];
  for (const sec of keptSections) {
    out.push(sec.head, ...sec.preface);
    let pending = [];
    const flush = () => {
      if (pending.length) out.push(...pending, "");
      pending = [];
    };
    for (const e of sec.entries) {
      if (e.tomb) {
        tombstoned.push(e.h.id);
        pending.push(`- ${e.h.id} · ${e.h.title} — ${e.h.original} → archived (lab)`);
      } else if (!e.h.archive) {
        flush();
        out.push(normaliseHeading(e.h), ...e.body);
      }
    }
    flush();
  }
  const text = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*$/, "\n");

  const arch = [];
  let archived = 0;
  for (const sec of doc.sections) {
    const gone = sec.entries.filter((e) => e.h.archive);
    if (!gone.length) continue;
    arch.push(`<!-- from: ${sec.title} -->`, "");
    for (const e of gone) arch.push(e.heading, ...e.body);
    archived += gone.length;
  }
  return { text, arch, archived, tombstoned, mapping };
}

function otherTrackedLines() {
  const files = execFileSync("git", ["ls-files", "docs", "src", "test", ".claude", "CHANGELOG.md"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\n")
    .filter((f) => f && f !== "docs/backlog.md" && /\.(md|ts|mjs|js|json|arch|txt|yml|yaml|sh)$/.test(f));
  const texts = [];
  for (const f of files) if (existsSync(join(ROOT, f))) texts.push(readFileSync(join(ROOT, f), "utf8"));
  return texts.join("\n").split("\n");
}

function main() {
  const args = process.argv.slice(2);
  const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const lab = arg("--lab");
  const dry = args.includes("--dry");
  const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
  if (!lab && !dry) throw new Error("--lab <archlang-lab path> is required (or --dry)");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

  const src = readFileSync(BACKLOG, "utf8");
  const { text, arch, archived, tombstoned, mapping } = archiveBacklog(src, otherTrackedLines());
  const count = (s) => `${Buffer.byteLength(s)} bytes, ${s.split("\n").length - 1} lines`;
  console.log(`before: ${count(src)}\nafter:  ${count(text)}`);
  console.log(`archived entries: ${archived}; tombstones (${tombstoned.length}): ${tombstoned.join(", ")}`);
  console.log("heading mapping (kept):");
  for (const [k, n] of mapping) console.log(`  ${n} x ${k}`);
  if (dry) return;
  if (archived) {
    const file = join(lab, "backlog-archive.md");
    const head = `## Archived from archlang docs/backlog.md on ${date}, commit ${sha}\n\n`;
    const body = arch.join("\n").replace(/\n*$/, "\n");
    if (existsSync(file)) appendFileSync(file, `\n${head}${body}`);
    else
      writeFileSync(
        file,
        `# ArchLang backlog archive\n\nClosed entries of \`archlang/docs/backlog.md\`, moved verbatim (card EH3.2, ruling EH-D4).\n\n${head}${body}`,
      );
  }
  writeFileSync(BACKLOG, text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
