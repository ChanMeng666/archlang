# `paper/demo/` — ICSE 2027 Tool Demonstrations

Build: `node paper/build.mjs demo` (must exit 0 — it enforces the 4-page limit, which is
inclusive of references, and fails on any undefined citation).

## `offwall.arch` — the plan behind the loop listing

Committed so the paper's transcript is **reproducible rather than asserted**. The paper claims
its transcripts are real output; this is what makes that checkable.

It is `examples/one-room.arch` with exactly one line changed — the door is given an absolute
coordinate lying off every wall instead of being pinned to the shell at 60%:

```
door   id=d_in on shell at 60% width 900  swing in     # original
door   id=d_in at (3200,5000) width 900 swing in       # here
```

That choice is deliberate: the fix the compiler offers restores the original line verbatim, so
the ground truth for "is the fix right?" is the file the example came from.

Regenerate it from the source of truth rather than editing it:

```bash
sed 's|door   id=d_in on shell at 60% width 900  swing in.*|door   id=d_in at (3200,5000) width 900 swing in|' \
  examples/one-room.arch > paper/demo/offwall.arch
```

Reproduce the listing:

```bash
npm run build
node dist/cli.js compile paper/demo/offwall.arch --json
node dist/cli.js fix     paper/demo/offwall.arch --dry-run
```

**Do not add a header comment to `offwall.arch`.** Verified values as of 2026-08-22:
`span [499, 547]`, `line 11`, `col 3`, fix title `attach the door to wall "shell" at 60%`,
`newText` `door id=d_in on shell at 60% width 900 swing in`, `fixId` `door-off-wall`. Byte spans
depend on the file's exact bytes — adding a nine-line provenance header during preparation moved
them to `[995, 1043]` and `line 21`, silently invalidating the listing. That is why the
provenance lives in this file instead, and it is a small instance of the companion paper's
subject: the note explaining an artifact changed the artifact it described.

## `fig-oneroom.pdf`

Rendered from `examples/one-room.arch`, which is drift-gated in the main repository.

## `VIDEO-SCRIPT.md`

Shot list for the 3–5 minute video the track requires, hosted on YouTube for the duration of
review. Presentation quality is an explicit review criterion.
