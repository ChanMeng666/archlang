# Preview-and-remodel programme: handoff (state as of 2026-11-01, after core 1.48.0 and archlang-3d 0.1.1)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Waves 0–3 and wave 5 are done, except G6, which closes at the N10 read if no sample arrived (D22). G1–G5, G8, G9 and
G10 are cut to `done`; their notes are in `research/2026-10-30-as-built.md`. G11 holds the residue. A6 and B2 parked;
D1 in wave 4.

**Tier A is open and the N10 window has started.** First post 2026-10-30T10:42:54Z (status
2116118643063116081), first reply 10:44:40Z. **Read N10 on or after 2026-11-27.** Baseline in growth
`data/metrics-log.csv`: four weeks to the post, 8 signups and 4 first frames, weekly medians 2 and 0.5, so a
signal moved at 4 signups or 1 first frame a week. n is tiny. Posts 2–4 are ready in growth
`marketing/content/posts/2026-10-30-tier-a-replay-posts-final.md`; media on the owner's machine in
`D:\.claude-scratch\2026-10-29\tier-a-posts\`. Posting stays the owner's unless they ask again.

**Released:** core 1.48.0, MCP shim 0.2.31, `@chanmeng666/archlang-3d` 0.1.1 with provenance (D20); VS Code extension 0.36.0, uploaded by the owner on 2026-11-01. Cards H0–H7 are done (`research/2026-11-01-as-built.md`); L1 is merged, and L2 and H10 share release 1.49.0.

**Day 90 is read as STOP on the consumer product (D26):** ArchCanvas is in maintenance; ArchLang continues at low cost. Wave 7 runs through S3, S4 is out, and nothing new opens until the Show HN and N10 reads. The question to the user is deferred by the owner.

**A real user:** Daniel Damm (X, GitHub bobsch-io) draws German houses with an agent and filed #362–#370.
Thread: growth `discovery/interviews/2026-10-30-daniel-damm-x-thread.md`. Also needs IFC: not close, never
promise it.

`packages/archlang-3d` is published at 0.x. Later versions go through `release.yml`: bump, merge, `gh workflow run release.yml --ref main`.

## 2. Pre-flight for a new session

1. `git fetch --all --prune`; `git switch main && git pull --ff-only && npm ci` in the primary checkout
   (the 3D package needs its own dependencies: earcut, three, playwright-core, esbuild,
   `@gltf-transform/core`, gltf-validator).
2. The open Dependabot PRs (#206/#207 vitest 2→5 and others) wait on owner decision 3.1(b); do not
   resolve them here.
3. Read `.claude/rules/archlang-3d.md` before touching `packages/archlang-3d`.

## 3. Next items, in order

1. **Wave 7, the `cards.md` L and S cards, in that order (D23).** It does not wait for N10. The G10 designs'
   open questions are answered in D24. New language forms freeze on 2026-11-24 until Show HN has run.
2. **ArchCanvas bump, card H8,** after 1.48.0: it replaces the old bump-to-1.47 item.
3. **The N10 read, on or after 2026-11-27.** Wave 4 and wave 6 wait for it. G6 closes then if no sample arrived (D22).
   Wave 7 releases fall inside the window; the growth `data/agent-reach.csv` notes date each one.
4. **G11,** whatever Wave 7 did not take, after Show HN.

A new npm package goes: `prove:pack` with no browser, first version by hand, register, dispatch within 48 hours.
Registering first is impossible, because npm needs the package to exist.

## 4. How a card is run

- Never wait idly on CI: pin, then start the next item that does not depend on it (owner, 2026-10-31).
- The main session plans, reviews and dispatches; one executor subagent per card in an isolated
  worktree branched from `main` (not from another card's branch), with its own `npm ci` (never a
  junctioned `node_modules`); the executor runs the card's gates and the touched tests; the
  coordinator merges `main` into the branch and runs the FULL `npm run check` (plus `check:drift`,
  `typecheck:all`, and `check:3d` / the playground chain where touched) on that head before pinning
  the merge; verify every completion claim with raw `git`/`gh`/`npm` output, not the summary.
- One independent red-team round per PR (at most two); its should-fix items are fixed in the PR,
  the rest becomes a card, never a scope creep.
- A landed card is cut to its `done` line in `cards.md`; its as-built note (what was built, what the
  gates measured, what was left) goes verbatim to `research/<date>-as-built.md` in this folder.
- Heavy probes (cross-machine pixel determinism, H1 artefacts under motion) run in Claude cloud
  sessions while credit lasts (to 2026-11-05), with an explicit `--permission-mode`.

- Run every claim in an approved draft against the CLI before it goes out: on 2026-10-30 three of five issue
  comments and three of four posts held false lines (`research/2026-10-30-as-built.md`).
- A red-team on a public claim is as useful as one on code: G3's blocker was a sentence.

## 5. Open questions

- The 45° end elevation of one-storey views (A9): the owner may veto on a look.
- Settled (see the as-built notes): B1 went on `impact --against`; a double door is two leaves from
  `doorLeaves`; the replay's phases and the combined view's exploded storeys with camera stops were
  set by the owner's look notes round 1 (D14) and A3.
