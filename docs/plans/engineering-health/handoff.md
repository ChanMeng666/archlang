# Resume point

**Where (2026-11-09):** programme planned from seven audits of `main@b59d088d`; rulings EH-D1…D9
taken by delegation (`README.md` § 6), owner may overturn. Wave 0 started: EH0.1 is PR #581 (in
review); EH0.2–EH0.9 next. Nothing in waves 1–3 started.

**How to continue:** take the first `todo` card of the lowest open wave in `cards.md`, honour its
`depends`, dispatch one executor into a worktree from `main` with the card text plus the finding's
section from the audit report, at most two executors at once (EH-D1). Merge by tier
(`scripts/risk-tier.mjs`): low on green CI pinned to the full SHA; medium after one fresh-context
review against `REVIEW.md`; high after the owner's words (EH-D6). Record each landing here as
`EHx.y · done (#PR)`, and move the card's status in `cards.md`.

**Owner queue:** EH0.5 (required checks: `3D package (check:3d)`, CodeQL `Analyze`); EH-D6 (a
standing "merge the EH high-tier set once CI is green", or per-PR words); any ruling in § 6 to
overturn.

**Landed:** none yet.
