/**
 * The variant builder of the diagnostic-wording study (card PS1.4; shared code and the method's
 * pointer in `lib.ts`).
 *
 * Run: `npx tsx scripts/research/diagnostic-wording/build.ts --out <dir> [--models sonnet,haiku] [--missing]`
 *
 * Writes, under `<dir>` (keep it outside the repository; replies and scores never enter it):
 *  - `cases.json`: every case used, its baseline codes and its four diagnostic texts;
 *  - `tasks/<case>__<variant>.md`: the author prompt, the same for all four variants but the text;
 *  - `run-<model>/`: the dispatching session's working directory, with `agents.json` (the
 *    `wording-author` definition, from `author-agent.md`), `jobs.tsv` (task path, tab, reply path)
 *    and `dispatcher-prompt.txt` (from `dispatcher-prompt.md`). Replies land in `run-<model>/replies/`.
 *
 * `--missing` writes `run-<model>/jobs-missing.tsv` instead, listing only the jobs that have no
 * reply yet, for a resumed dispatch. More than 80 cases are sampled round-robin by code (the card's
 * cost bound); the corpus of record had 59, so no run so far sampled.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authorPrompt, corpusCases, type StudyCase, VARIANTS } from "./lib.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_CASES = 80;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outArg = arg("--out");
if (!outArg) {
  console.error("usage: build.ts --out <dir> [--models sonnet,haiku] [--missing]");
  process.exit(3);
}
const OUT = resolve(outArg);
const MODELS = (arg("--models") ?? "sonnet,haiku").split(",").filter(Boolean);
const MISSING = process.argv.includes("--missing");

/** At most `MAX_CASES`, taken one per code in turn so every code family keeps a share. */
function sample(cases: StudyCase[]): StudyCase[] {
  if (cases.length <= MAX_CASES) return cases;
  const byCode = new Map<string, StudyCase[]>();
  for (const c of cases) byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]);
  const picked: StudyCase[] = [];
  for (let round = 0; picked.length < MAX_CASES; round++)
    for (const group of byCode.values()) if (group[round] && picked.length < MAX_CASES) picked.push(group[round]!);
  return picked.sort((a, b) => a.id.localeCompare(b.id));
}

const { all, skipped, cases: eligible } = corpusCases();
const cases = sample(eligible);

mkdirSync(join(OUT, "tasks"), { recursive: true });
writeFileSync(
  join(OUT, "cases.json"),
  `${JSON.stringify({ corpusCases: all, eligible: eligible.length, used: cases.length, skipped, cases }, null, 2)}\n`,
);

const jobs: { id: string; task: string }[] = [];
for (const c of cases)
  for (const v of VARIANTS) {
    const id = `${c.id}__${v}`;
    const task = join(OUT, "tasks", `${id}.md`);
    writeFileSync(task, authorPrompt(c, c.texts[v]));
    jobs.push({ id, task });
  }

const authorBody = readFileSync(join(HERE, "author-agent.md"), "utf8").trim();
const dispatcherTemplate = readFileSync(join(HERE, "dispatcher-prompt.md"), "utf8").trim();

for (const model of MODELS) {
  const run = join(OUT, `run-${model}`);
  mkdirSync(join(run, "replies"), { recursive: true });
  const agents = {
    "wording-author": {
      description: "Edits one file for the diagnostic-wording study: reads its task file, writes its reply file.",
      prompt: authorBody,
      tools: ["Read", "Write"],
      model: "inherit",
    },
  };
  writeFileSync(join(run, "agents.json"), `${JSON.stringify(agents, null, 2)}\n`);
  const rows = jobs
    .map((j) => ({ ...j, reply: join(run, "replies", `${j.id}.arch`) }))
    .filter((j) => !MISSING || !existsSync(j.reply));
  const jobsFile = join(run, MISSING ? "jobs-missing.tsv" : "jobs.tsv");
  writeFileSync(jobsFile, rows.map((j) => `${j.task}\t${j.reply}\n`).join(""));
  writeFileSync(
    join(run, MISSING ? "dispatcher-prompt-missing.txt" : "dispatcher-prompt.txt"),
    `${dispatcherTemplate.replace("{{JOBS}}", jobsFile).replace("{{COUNT}}", String(rows.length))}\n`,
  );
  console.log(`${model}: ${rows.length} jobs -> ${jobsFile}`);
}

console.log(
  `corpus cases ${all}; eligible (default lint reports the expected code) ${eligible.length}; used ${cases.length}; skipped ${skipped.length}`,
);
