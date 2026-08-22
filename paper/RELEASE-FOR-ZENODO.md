# Cutting the release that Zenodo will archive

Prepared 2026-08-22. Everything below is ready; **nothing has been committed, tagged or
pushed** — those are yours to run.

## The one trap, and it is expensive

`.github/workflows/release.yml` triggers on `tags: ['v*']`, and it **publishes to npm and to
the MCP registry** via OIDC trusted publishing. So:

> **Do not tag this `v1.26.2`.**

The npm tarball is defined by `package.json`'s `files` field — `dist`, `examples`,
`spec.llm.md`, `llms-full.txt`, `SKILL.md`, `README.md`, `LICENSE`. None of the work being
released here is in it: `paper/`, `CITATION.cff` and the two new scripts are all outside that
list. A `v1.26.2` tag would therefore publish a **byte-identical library under a new version
number** — pure noise for every consumer, and a release that says something changed when
nothing they can see did.

Use a tag that does not start with `v`. Zenodo archives GitHub *releases* regardless of tag
name, so nothing is lost.

```
archive-1.26.1-paper
```

Verified: the glob `v*` anchors at the start, so this does not match and the publish workflow
will not fire.

## Order matters: enable Zenodo first

The Zenodo/GitHub integration archives releases **published after the webhook is enabled**. It
does not reach back. The existing `v1.26.1` release cannot be archived retroactively, which is
the second reason a new release is needed.

1. Sign in to Zenodo with GitHub, go to **GitHub** in your account menu, and flip the toggle on
   `ChanMeng666/archlang`.
2. *Then* create the release below.

## What ships

`CITATION.cff` (new, at the repository root) plus `paper/` — 56 files, including three papers,
the bibliography, the three checkers, and every experiment's harness and dataset.

`CITATION.cff` is **validated**, not assumed: `cffconvert` reports it valid against CFF 1.2.0.
GitHub will render a *"Cite this repository"* panel from it, and the Zenodo integration takes
the archive's metadata from it.

It carries two `TODO` comments that should be resolved as the DOIs come into existence — the
ORCID on the author entry, and an `identifiers:` block for the concept and version DOIs. Neither
blocks the release; both are cheap to add in a follow-up.

### `.gitignore` detail worth knowing about

`paper/.gitignore` ignores `*.pdf` as LaTeX build output, then re-admits figures with
`!**/fig-*.pdf`. Without that negation `paper/demo/fig-oneroom.pdf` would be ignored, the demo
paper would build here and fail for anyone who cloned it, and the failure would look like a
LaTeX problem rather than a missing file. Verified with `git add --dry-run`: the figure stages,
`main.pdf` does not.

## Staging

The working tree also contains **unrelated in-progress work of yours** — `AGENTS.md`,
`CLAUDE.md`, `CHANGELOG.md`, the docs-site theme, `playground/src/styles/tokens.css`, several
`scripts/gen-*.ts`, and two untracked `test/*.test.ts`. **Do not `git add -A`.** Stage exactly:

```bash
git add CITATION.cff paper/ \
        scripts/gen-paper-facts.ts scripts/snapshot-paper-scale.ts
git add -p package.json biome.jsonc   # review each hunk; see below
```

`package.json` gained four scripts (`gen:paper-facts`, `paper:build`, `paper:snapshot`,
`paper:check`) and one entry in `gen:all`. `biome.jsonc` gained exemptions for generated
experiment output. Everything else in both files is yours.

## Before tagging

```bash
npm run paper:check     # claims + anonymity + page limits + citations
npm run check:drift     # paper/facts.{json,tex} are drift-gated like every other artifact
npm run check           # typecheck + lint + test-wiring + the full suite
```

All three were green at preparation time.

## Cutting it

```bash
git commit -m "docs(paper): add CITATION.cff and the paper/ working set

Three papers with their bibliography, experiment harnesses and datasets, plus
three checkers that gate claims, anonymity and page limits. Structural numbers are
generated from the compiler's own tables and drift-gated; scale numbers are dated
snapshots. No src/ change."

git tag archive-1.26.1-paper -m "Archival snapshot for Zenodo: papers and experiment artifacts"
git push origin main
git push origin archive-1.26.1-paper
```

Then on GitHub: **Releases → Draft a new release → choose the existing tag
`archive-1.26.1-paper`**. Zenodo picks it up within a minute or two and mints the software DOI.

## Afterwards

- Record both DOIs in `CITATION.cff`'s `identifiers:` block and add your ORCID.
- Cite the **concept** DOI in the papers' availability sections — it always resolves to the
  latest version.
- Follow `ZENODO.md` for the paper deposit, which is a separate record with its own DOI.

One last check, because it is the kind of thing that only shows up later: the release notes and
the Zenodo record **must not mention ICSE**. ICSE grants the right to preprint and forbids
stating that a manuscript was submitted to it.
