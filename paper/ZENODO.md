# Zenodo — the preprint route that has no gatekeeper

Researched 2026-08-22 against `help.zenodo.org` and the ICSE 2027 NIER policy. Companion to
`ARXIV-ENDORSEMENT.md`, which explains why arXiv is not immediately available.

## Why this is the right first move

Zenodo is run by CERN with OpenAIRE, is free, has **no endorsement system and no gatekeeper**,
mints a real DataCite DOI, and is harvested by OpenAIRE into the European Open Science Cloud
within a day or two. It is a legitimate archive, not a workaround — and, decisively, ICSE's own
policy anticipates it.

## The ICSE policy question, answered

This is the load-bearing check, so here it is verbatim from the ICSE 2027 NIER track:

> While authors have the right to upload preprints on ArXiV **or similar sites**, they must
> avoid specifying that the manuscript was submitted to ICSE 2027.

Zenodo is a "similar site". There is **no cutoff date**. So posting is permitted before, during
and after review.

The same policy also says:

> papers submitted to ICSE 2027 must not have been published elsewhere and must not be under
> review or submitted for review elsewhere whilst under consideration for ICSE 2027.
> Contravention … will be deemed a serious breach of scientific ethics.

A preprint archive is not "published elsewhere" and performs no review — which is why the same
document grants the right to preprint in the sentence above. But the line is sharp enough to be
worth a rule:

> **Post the flagship only.** The NIER cut and the Demo paper do not go on any preprint server
> before their notifications (2026-12-18 and 2026-12-11). Nothing is gained by posting them —
> the flagship contains their content — and posting a submitted paper is the one move that could
> be read as contravening the clause above.

And, mechanically: **the Zenodo record must not say "submitted to ICSE 2027"** anywhere — not in
the description, not in the notes field, not in the PDF.

## The anonymity trade-off, stated plainly

You already chose to post named and submit NIER anonymised, which the policy permits. Two things
are worth being clear-eyed about now that the papers exist:

- The flagship and the NIER cut share whole sentences. A reviewer searching a distinctive phrase
  finds the named version immediately. Anonymity here is procedural, not real.
- It is *already* partial regardless: the Demo paper is single-anonymous and carries your name to
  the same conference in the same cycle.

That is an acceptable position and a common one. It is not a secret being kept badly; it is a
policy being followed exactly.

## Required metadata — the whole list

Zenodo's minimal required fields (marked with a red star in the deposit form) are only four:

| Field | For this paper |
|---|---|
| **Resource type** | Publication → Preprint |
| **Title** | *Reproducible Is Not Correct: Reflexive Gates and the Self-Descriptions We Ship to Language Models* |
| **Publication date** | date of deposit |
| **Creators** | Chan Meng. **Attach an ORCID** — creators are validated against ORCID, and it is the single cheapest thing an unaffiliated researcher can do for discoverability. Register at orcid.org if there is none. |

Worth filling even though optional: description (use the abstract), licence (**CC-BY-4.0** is the
normal choice for a preprint), keywords, and a related-identifier link to the software DOI below.

Limits: 100 files, 50 GB.

## Two mechanics worth using

**Reserve the DOI before publishing.** The deposit form has a *"Get a DOI now!"* button that
reserves the DOI on a draft, so it can be typed into the PDF before the record goes live. That
means the paper can carry its own DOI on page one rather than acquiring one afterwards. Caveat
from the docs: *"If you delete the draft upload, the reserved DOI will be lost."*

**Versioning is first-class.** Zenodo mints a per-version DOI plus a **concept DOI** that always
resolves to the latest version. Cite the concept DOI everywhere; publish a new version when the
paper changes. This matters because of one restriction: after publishing, **files can only be
modified by the depositor within 45 days**, while metadata stays editable indefinitely. With
versioning that limit is not binding — a revision is a new version, not an edit.

## The second DOI: archive the software

Zenodo has a GitHub integration — enable the repository, and each GitHub **release** is archived
automatically with its own DOI, and deposited into Software Heritage. It reads `CITATION.cff` and
`.zenodo.json` for metadata.

This is worth doing independently of the paper, and it directly improves the ICSE Demo
submission: the track scores *potential applications and usefulness*, and an availability section
that cites a DOI for a specific archived release is stronger than one that cites a moving branch.

The archived artifact should be a tagged release, so the DOI names an exact state rather than
whatever `main` held that day. `CITATION.cff` now exists at the repository root and validates
against CFF 1.2.0 (`cffconvert`).

### Do not add `.zenodo.json`

Zenodo supports a second metadata file, and the documentation is blunt about what happens if
both are present:

> If your repository contains both a `.zenodo.json` and a `CITATION.cff` file, Zenodo will only
> use the `.zenodo.json` metadata. **The `CITATION.cff` will be completely ignored** for the
> GitHub release archiving.

`.zenodo.json` exists for Zenodo-specific fields — `grants`, `communities`, `related_identifiers`,
contributor roles — and the same page says a `CITATION.cff` alone is sufficient without them. We
need none of them today; `related_identifiers` would be useful for linking the software archive to
the paper record, but that DOI does not exist yet.

So the file is deliberately **not** added. Adding it would silently disable the metadata file that
GitHub also renders and that Zotero imports, leaving two descriptions of the same artifact with one
of them quietly ignored — the exact shape this paper is about, in this paper's own repository.

If `related_identifiers` becomes necessary once both DOIs exist, migrate rather than duplicate:
move the metadata into `.zenodo.json`, keep `CITATION.cff` for GitHub and Zotero, and record in
both that Zenodo reads only the former.

## Recommended sequence

1. **Register an ORCID** if there is none. Five minutes, and it makes the Zenodo record and every
   later submission attributable.
2. **Add `CITATION.cff`** to the repository and cut a release.
3. **Enable the Zenodo/GitHub integration** and archive that release → software DOI.
4. **Reserve a paper DOI** on a Zenodo draft, put it on the flagship's title page, rebuild, upload
   the PDF, and publish → paper DOI. Add a related-identifier link to the software DOI.
5. **Start the arXiv submission** to generate an endorsement code, and begin the candidate list in
   `ARXIV-ENDORSEMENT.md`. Cross-post when endorsed; arXiv does not object to a paper already on
   Zenodo.
6. **Submit both ICSE papers on 2026-10-23**, neither of them posted anywhere, and neither the
   Zenodo record nor the repository saying anything about an ICSE submission.

## What Zenodo does not give

Honesty about the trade: arXiv is where this audience reads, and a Zenodo DOI does not replace
that. Zenodo gives citability, permanence, indexing through OpenAIRE, and immediacy. It does not
give the cs.SE listing traffic. **Do both** — Zenodo now for the DOI and the timestamp, arXiv when
an endorser answers.
