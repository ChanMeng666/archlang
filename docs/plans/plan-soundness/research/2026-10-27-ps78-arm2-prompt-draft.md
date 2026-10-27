# PS7.8 · Arm 2 ("whole loop") dispatch prompt — DRAFT for the owner's confirmation (D26)

Status: draft, 2026-10-27, not yet in the repository. The protocol file
`docs/plans/plan-soundness/audits/first-contact-protocol.md` stays frozen; per card PS7.8 this prompt
is written into it as a second, dated prompt beside the frozen one **in the re-measure's PR**, and the
re-measure runs only when the owner says so.

## Design rules this draft keeps

- Same six briefs (verbatim, protocol § The six briefs), same commit under test, same role file
  (`.claude/agents/arch-author.md` as it stands on that commit), same model (`claude-sonnet-5-5`,
  inherited), same spec-only reading, same output file names, same "no nudge" rule.
- Arm 1 = the frozen 2026-10-24/25 per-brief prompt, unchanged ("stop when it compiles").
- Arm 2 differs from arm 1 in ONE sentence: the "Write the plan; …" line names the whole loop and the
  stopping rule the role already states. Nothing else moves: no hints, no extra verbs beyond the loop's
  own (`compile`, `validate`, `lint`, `repair`), no `describe`, no `score`, no `context`, no
  `preview`. (Naming `describe` would change a second surface at once, PS7.4's lesson.)
- Both arms run from the same dispatcher recipe (row 6's headless `claude -p` session in the run's
  worktree, six `arch-author` subagents in one message, the `dist/cli.js` call-counting shim), with
  separate output folders and separate call logs.

## Arm 2 per-brief prompt (brief 4 as the example; the other five swap only the bold brief line and the file name)

```text
Brief (metric, dimensioned, furnished, with doors and windows, a `title`, and `dims auto` where the spec allows):

**Corner café, ~90 m²**: entrance on the corner, seating for 24, counter and back-of-house kitchen, accessible WC, staff WC, store.

The language specification is the file <repo>\spec.llm.md — read all of it; it is your only documentation. Do not read any other file in the repository.

Write the plan and run the whole loop with `node <repo>\dist\cli.js <verb> <file> --json`: compile, then `validate --stage rooms|walls|openings|fixtures` as you add each stage, then `lint`, then repair; iterate until `validate`'s `next` is null (or every remaining warning is a choice you state in your reply).

Save the plan to <repo>\docs\plans\plan-soundness\audits\first-contact-plans\<run-folder>\4-cafe.arch. When done, reply with the number of compile/validate/lint rounds you ran, the final lint codes, the warnings you chose to leave and why, and anything in the language you were unsure about.
```

Diff against the frozen prompt (arm 1), for the protocol's record:

- Replaced: `Write the plan; you may run `node <repo>\dist\cli.js compile|lint <file> --json` to check; stop when it compiles.`
- With: the "Write the plan and run the whole loop …" sentence above.
- Reply line: adds "validate" to the round count and "the warnings you chose to leave and why".
- `<run-folder>`: `<date>-rerun-arm2`; arm 1 uses `<date>-rerun-arm1`.

## Dispatcher recipe (per arm; the row-6 recipe, two folders)

1. Worktree from the commit under test; `npm ci && npm run build`; record `git rev-parse --short HEAD`
   and `node dist/cli.js --version`. Install the call-counting shim: move `dist/cli.js` to
   `dist/cli.real.js`, write a `dist/cli.js` that appends `JSON.stringify({t: Date.now(), argv})` to
   `calls-<arm>.jsonl` and `require`s/imports the real one (the row-6 shim, `calls-r6.jsonl`).
2. Confirm the loaded role with `/agents` (description must read "compile → validate → lint →
   repair"); copy the listing into `replies.md`.
3. One headless dispatcher per arm: `claude -p --model sonnet --permission-mode bypassPermissions
   --output-format json` started in that worktree, with a lead prompt = row 6's `lead-r6.txt` with the
   folder and the per-brief prompt swapped (arm 1 frozen, arm 2 above). Six `arch-author` subagents
   in one message, background, no follow-up, no nudge. Arms run one after the other on this machine
   (RAM), or in two worktrees in the owner's cloud sessions.
4. Save the six plans per arm under `first-contact-plans/<date>-rerun-arm1/` and `…-arm2/`; keep
   intermediates outside the repository; keep both `calls-*.jsonl` and both `replies.md` with the run.
5. Audit (protocol rubric, read-only opus auditors; one per arm, as D15's run did) and report both arms
   side by side: defects by class and B/N/m, calls per verb, authors stopping with warnings standing,
   `validate --stage` uptake, `next` sequence actually followed (from the shim log).
6. PR: the two plan folders, the audit, the protocol's new dated prompt block ("### <date>: arm 2, the
   whole-loop prompt") beside the frozen one, D26's reading in `README.md` §3, cards PS7.8 → done.

## What the owner is asked to confirm before the run

- The arm-2 sentence above (one-sentence change, verbs `compile|validate --stage|lint|repair` only).
- The commit under test: the `main` that holds #296, #297, #298 (PS2.64/2.65/7.7) and whatever of the
  PS2.66+ tranche has merged by then.
- Where it runs: locally (two sequential headless sessions, ~3 min and ~$1.5 each on row 6's figures)
  or in the owner's cloud sessions.
