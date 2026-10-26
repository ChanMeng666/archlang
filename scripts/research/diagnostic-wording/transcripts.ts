/**
 * The compliance check of the diagnostic-wording study (card PS1.4): did every author do only
 * what the fixed prompt allowed?
 *
 * Run: `npx tsx scripts/research/diagnostic-wording/transcripts.ts --subagents <dir> [--json <file>]`
 * where `<dir>` is the dispatching session's `subagents/` folder (Claude Code keeps it under
 * `~/.claude/projects/<cwd slug>/<session id>/subagents/`). For each author transcript it lists
 * the model that answered and every tool call. An author is `strict` when it made exactly one
 * `Read` of its task file and then one `Write` of the same job's reply file; `own job` when every
 * call it made named only those two files (or no file); anything else touched a foreign file. It
 * also lists a job dispatched more than once.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dir = arg("--subagents");
if (!dir) {
  console.error("usage: transcripts.ts --subagents <dir> [--json <file>]");
  process.exit(3);
}

interface Entry {
  type?: string;
  message?: { model?: string; content?: unknown };
}
interface Block {
  type?: string;
  name?: string;
  input?: { file_path?: string };
}

const jobOf = (p: string | undefined, ext: string) =>
  p && basename(p).endsWith(ext) ? basename(p).slice(0, -ext.length) : undefined;

const agents = readdirSync(dir)
  .filter((f) => f.endsWith(".jsonl"))
  .map((f) => {
    const models = new Set<string>();
    const calls: { name: string; path?: string }[] = [];
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as Entry;
      if (e.type !== "assistant") continue;
      if (e.message?.model) models.add(e.message.model);
      const content = Array.isArray(e.message?.content) ? (e.message!.content as Block[]) : [];
      for (const b of content) if (b.type === "tool_use") calls.push({ name: b.name ?? "?", path: b.input?.file_path });
    }
    const read = calls[0]?.name === "Read" ? jobOf(calls[0].path, ".md") : undefined;
    const wrote = calls[1]?.name === "Write" ? jobOf(calls[1].path, ".arch") : undefined;
    const job = read && read === wrote ? read : undefined;
    const strict = !!job && calls.length === 2;
    const ownJob =
      !!job && calls.every((c) => !c.path || jobOf(c.path, ".md") === job || jobOf(c.path, ".arch") === job);
    return { file: f, models: [...models], calls, job, strict, ownJob };
  });

const perJob = new Map<string, number>();
for (const a of agents) if (a.job) perJob.set(a.job, (perJob.get(a.job) ?? 0) + 1);
const twice = [...perJob].filter(([, n]) => n > 1).map(([j]) => j);
const models = [...new Set(agents.flatMap((a) => a.models))];
const deviations = agents.filter((a) => !a.strict);
const foreign = agents.filter((a) => !a.ownJob);

console.log(
  `authors ${agents.length}; strict ${agents.length - deviations.length}; own job only ${agents.length - foreign.length}; models ${models.join(", ")}`,
);
console.log(
  `distinct jobs written ${perJob.size}; dispatched more than once ${twice.length}${twice.length ? `: ${twice.join(", ")}` : ""}`,
);
for (const d of deviations)
  console.log(
    `${d.ownJob ? "extra call" : "FOREIGN FILE"} ${d.file}: ${d.calls.map((c) => `${c.name}(${c.path ? basename(c.path) : ""})`).join(" ")}`,
  );

const out = arg("--json");
if (out) writeFileSync(out, `${JSON.stringify({ models, twice, agents }, null, 2)}\n`);
