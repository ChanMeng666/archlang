# Preview-and-remodel programme: handoff (state as of 2026-11-02, the J round released)

> **Moved:** this programme's `research/` now lives in the private sibling repository, at
> `archlang-lab/plans/preview-and-remodel/research/`.

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

**Released:** core 1.53.0, MCP shim 0.2.36 and `@chanmeng666/archlang-3d` 0.1.2 with provenance (D20). VS Code extension 0.41.0 is on the Marketplace and Open VSX. The J round is done: `research/2026-11-02-as-built.md`.

**Day 90 is read as STOP on the consumer product (D26):** ArchCanvas is in maintenance. ArchLang keeps being built on its merit (D29), which replaces the line that nothing new opens before the reads. The question to the user is deferred by the owner.

ArchCanvas stays on core 1.48 (D28); the draft bump PR there is not to be merged.

**OpenAI plugin directory:** ArchLang is live at 1.50.1 (`docs/seo.md` section 8), so its skills pin an older CLI than npm's 1.53.0. A new ZIP is the owner's submit; the listing's open items are O.11 to O.14 in `docs/backlog.md`.

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

1. **Residue J16–J18 in `cards.md`, then the drawing-set programme (`docs/plans/drawing-set/`), DS0 first.** `spec.llm.md` stands within about 30 units of its cap, so no language form can land before DS1 pays for it. From 2026-11-24 `main` takes bug fixes only until Show HN (2026-12-01) has run.
2. **The N10 read, on or after 2026-11-27.** Wave 4 and wave 6 wait for it. G6 closes then if no sample arrived (D22).
   Wave 7 releases fall inside the window; the growth `data/agent-reach.csv` notes date each one.
3. **G11 and H9,** the older residue. D27 closed with J15.

A new npm package goes: `prove:pack` with no browser, first version by hand, register, dispatch within 48 hours.
Registering first is impossible, because npm needs the package to exist.

## 4. How a card is run

- Never wait idly on CI: pin, then start the next item that does not depend on it (owner, 2026-10-31).
- One executor and one heavy command at a time (the owner's laptop froze on 2026-11-02): two vitest workers, no local full suite, CI is the gate.
- The main session plans, reviews and dispatches; one executor subagent per card in an isolated
  worktree branched from `main` (not from another card's branch), with its own `npm ci` (never a
  junctioned `node_modules`); the executor runs the local gate (`check:quick`, + `docs:build`
  for docs) and pushes; CI runs `check`, drift, `typecheck:all`, `check:3d` (not a required check) and the playground chain,
  and the PR merges by risk tier (`docs/agents/commands.md` § Merging a PR); verify every completion claim with raw `git`/`gh`/`npm` output, not the summary.
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
