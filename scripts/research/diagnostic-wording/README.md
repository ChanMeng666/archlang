# Diagnostic-wording study harness (card PS1.4)

Measures which diagnostic wording an AI author repairs correctly in one pass. Each defect-corpus case
(`test/defect-corpus/**/*.arch`, not the `.clean` twins) whose default `lint()` reports its expected
code becomes four author prompts that differ only in the diagnostic text: `facts`, `rule`, `fix` and
`current`. The method, the prompts verbatim and the results of record are in
`docs/plans/plan-soundness/research/2026-10-26-ps14-diagnostic-wording.md`.

Local and unpaid: the authors are this machine's Claude Code subscription models through a headless
`claude -p` session. It is not `eval:live` and reads nothing under `eval/` or `dataset/`.

| File | Role |
|---|---|
| `lib.ts` | Reads the corpus, the case's `lint()` diagnostic and `ERROR_CATALOG`; builds the four texts and the fixed author prompt; `FACTS_EDITS` is the one hand-written template |
| `build.ts` | Writes `cases.json`, the task files and one dispatch folder per model |
| `author-agent.md` | The `wording-author` subagent's prompt (tools `Read` and `Write` only) |
| `dispatcher-prompt.md` | The dispatching session's prompt (six authors at a time) |
| `score.ts` | Re-lints every reply and prints the tables. `fixed` is strict by default (the expected code is gone); `--lenient` also counts fewer instances |
| `transcripts.ts` | Checks that every author made only one `Read` of its task and one `Write` of its reply |

Keep `<out>` outside the repository: replies and scores never enter it.

```sh
npx tsx scripts/research/diagnostic-wording/build.ts --out <out> --models sonnet,haiku
cd <out>/run-sonnet   # then the same in <out>/run-haiku with --model haiku
env -u CLAUDECODE claude -p --model sonnet --dangerously-skip-permissions --strict-mcp-config \
  --settings '{"disableAllHooks":true}' --agents agents.json --output-format json \
  "$(cat dispatcher-prompt.txt)" < /dev/null > session.json
npx tsx scripts/research/diagnostic-wording/transcripts.ts \
  --subagents ~/.claude/projects/<cwd slug>/<session id>/subagents
npx tsx scripts/research/diagnostic-wording/score.ts --out <out> --models sonnet,haiku
```

`CLAUDECODE` must be unset, or `claude` refuses to start inside another Claude Code session. Run
the `claude -p` line from the dispatch folder, so the session reads no project instructions. If a
dispatcher stops before every job has a reply, run `build.ts` again with `--missing` and resume the
same session (`claude -p --resume <session id>`) with `dispatcher-prompt-missing.txt`.
