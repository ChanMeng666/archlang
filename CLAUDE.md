# CLAUDE.md

The Claude Code operating brief. It asserts no project fact of its own: facts live in `AGENTS.md`
(always loaded, below) and in the `docs/agents/*.md` files its index names. If you catch yourself
writing the same rule here and there, delete the copy here and leave a pointer.

@AGENTS.md

## The rules most often broken here — checklist

These are the ones this repo has actually shipped violations of. The pointer after each names the
`docs/agents/` file that states it in full, with its evidence and its grep.

1. **`compile()` is pure, synchronous, deterministic.** No I/O, no `Date.now()`, no `Math.random()`
   in `src/`; Node APIs and real time only in `src/cli.ts` + `src/cli/`, everything else through the
   `World` seam; route number formatting through `fmt()`; never mutate the shared parse-stage
   `PlanNode` — clone first. → `architecture.md`, plus the determinism and parse-stage-memo entries
   in `gotchas.md`.
2. **Don't hand-edit generated files.** Edit the source and run the matching `npm run gen:*`; CI
   fails on drift. → `gotchas.md` (the list of artifacts and their sources).
3. **A generator's TEMPLATE can go stale even when `check:drift` is green** — the gate proves
   reproducibility, not correctness. Derive from the source of truth, never retype it.
   → `iron-laws.md`.
4. **A derived POSITION comes from the shape, never from its bounding box or centroid.** A defect
   CLASS, not a bug: six shipped silently and `arch lint` reported none of them. → `iron-laws.md`.
5. **Every new language form ships with a byte-identity law, pinned by test** — proved with a
   SHA-256 sweep over the whole agent-facing surface (SVG **and** `describe()` **and** `lint()`),
   never by eyeballing, and a moved golden is a finding to explain before it is a diff to bless.
   → `iron-laws.md`.
6. **Heights draw nothing; the axonometric view measures nothing.** The v1.35 datum is reported only
   when the source authored one (a single whole-plan flag), and `describe()`/`lint()` never learn
   `--view` exists. → the `datum.ts` and `src/view/` entries in `architecture.md`, and
   `docs/axonometric.md`.
7. **A drawn fixture symbol ignores its `label`, and fixture categories are DATA, not keywords** —
   one `FIXTURE_FAMILIES` row plus one `CATALOG` entry, never a new element and never a `switch`
   arm; the three catalog flags mean different things. → `gotchas.md`.
8. **Errors are returned, never thrown** for user-source problems — a `Diagnostic` carrying a byte
   `span` and a catalogued `E_*`/`W_*` code. → `architecture.md`.
9. **Adding an element = one module** in `src/elements/`, registered in `defs.ts`; dispatch goes
   through the registry, not a switch. → `architecture.md`.
10. **A clean auto-merge is not evidence** when one branch MOVED a function another MODIFIED — diff
    the moved body against the newer version and run both branches' fixtures together.
    → `gotchas.md` (parallel worktrees).

## Verify your work

Prove a change through the CLI (`arch compile|describe|lint --json`), not by eyeballing SVG.
`npm run check` + `npm run check:drift` is the floor; add `npm run typecheck:all` outside
`src/` — **including `test/`, which the root tsconfig excludes, so `check` never compiles it** —
`npm run docs:build` for any `docs/*.md` edit, and the Playwright E2E for the apps.
Update snapshots/goldens only after reviewing the diff — never to green a red suite. **Before calling
a change done, read `docs/agents/verification.md`** (per-surface CLI checks, prose gates).

## Conventions

Commit or push only when asked. When you change build steps, structure or conventions, update
`AGENTS.md` / `docs/agents/` — this file only gains a line when a rule joins the checklist above.
