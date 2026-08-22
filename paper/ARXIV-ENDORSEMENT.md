# arXiv endorsement — what is required, and the plan

Researched 2026-08-22 against the official policy at `info.arxiv.org/help/endorsement` and the
policy-change announcement of 2026-01-21. **This is the only external dependency that can delay
the preprint, so it is worth starting before anything else on the submission list.**

## The rule

arXiv requires endorsement before a first submission to arXiv or to a new category. Since
**2026-01-21** there are exactly two paths, and the policy tightened rather than relaxed:

> As of January 21, 2026, arXiv will no longer accept institutional email addresses as the sole
> qualifier of endorsement for new authors.

| Path | Requires | Our position |
|---|---|---|
| 1 | An institutional email **and** previous authorship on a paper already accepted to the same arXiv endorsement domain | **Closed.** No institutional affiliation, no prior arXiv paper. Both conditions fail, and they are conjunctive. |
| 2 | **Personal endorsement from an established arXiv author** in the same endorsement domain | **The only route.** |

And there is no appeal:

> arXiv staff cannot waive endorsement requirements or provide a personal endorsement for authors.

## One piece of good news: the domain is all of `cs`

Endorsement domains are high-level archives, not subject classes. For computer science the
qualifying condition is **three papers submitted to *any* `cs.*` category, more than three months
and less than five years ago**. So an endorser does not need to publish in `cs.SE` specifically
— any active CS researcher on arXiv qualifies. That widens the candidate pool considerably.

## The mechanics

1. **Start the submission first.** Go to arXiv, begin a new submission, and select `cs.SE`
   (cross-list `cs.PL`). The endorsement request is generated *by* starting a submission — you
   cannot request one in the abstract.
2. arXiv emails a **six-character alphanumeric endorsement code** plus a link to give to
   prospective endorsers.
3. Send the code to a candidate. **One positive endorsement is enough.**
4. The endorser enters the code on arXiv's endorsement form and votes.

**The endorser's own standard is lower than it looks**, and this is the sentence that makes a
cold request legitimate:

> You should know the person that you endorse **or you should see the paper that the person
> intends to submit.** We do not expect you to read the paper in detail, or verify that the work
> is correct, but you should check that the paper is appropriate for the subject area.

So attaching the PDF is not presumptuous — it is the mechanism the policy anticipates for
someone who does not know you.

**Etiquette, which is policy, not manners:**

> it is inappropriate to email large numbers of potential endorsers at once, or to repeatedly
> email the same endorser with a request for endorsement.

Contact **one or two at a time**, wait about a week, then move down the list.

## Candidates, ranked

All are authors of work this paper cites, which satisfies "knowledgeable in the subject area of
your work" and gives the request an honest hook. Verify each is still an active arXiv author
before writing (an abstract page's *"Which authors of this paper are endorsers?"* link shows
this, but **it requires being logged in**, so it is a step for the account holder, not something
that can be checked from outside).

| # | Who | Why them |
|---|---|---|
| 1 | **Christoph Treude & Sebastian Baltes** — *Context Rot in AI-Assisted Software Development* (arXiv 2606.09090, 2026) | The nearest existing treatment of our artifact class, and we say so in Related Work. Both are prolific, active SE researchers. Highest-probability yes, and the most likely to find the paper genuinely relevant. |
| 2 | **Tobias Kiecker et al.** — *CASCADE* (arXiv 2604.19400, FSE 2026) | We engage their work directly as the closest prior art on code–documentation inconsistency. They will understand the contribution in one paragraph. |
| 3 | **Sathvik Joel, Jie JW Wu, Fatemeh Fard** — TOSEM survey on LLM code generation for low-resource and domain-specific languages (arXiv 2410.03981) | Survey authors know the territory and are used to being asked. |
| 4 | **Boyang Yang et al.** — survey of LLM-based automated program repair (arXiv 2506.23749, 2026) | Adjacent to the fix-protocol material. |
| 5 | **Theo Olausson et al.** — *Is Self-Repair a Silver Bullet for Code Generation?* (arXiv 2306.09896) | Cited; established group. Older, so check the three-month-to-five-year window still holds for a recent paper of theirs. |

## Draft request

Keep it short, state plainly that you are unaffiliated, and attach the PDF. Do not oversell.

> Subject: arXiv endorsement request — cs.SE preprint on drift in generated documentation
>
> Dear Prof. ―,
>
> I am an independent researcher with no institutional affiliation, and under arXiv's endorsement
> policy that leaves personal endorsement as the only route open to me. I am writing to ask
> whether you would be willing to consider endorsing me for cs.SE.
>
> My paper is *Reproducible Is Not Correct: Reflexive Gates and the Self-Descriptions We Ship to
> Language Models*. It observes that the `regenerate-and-diff` gate deployed over generated
> artifacts establishes determinism but not truth, and is sound only because such artifacts are
> normally *derived* from their subject — a precondition never stated and never checked. It
> reports a census of 7,272 npm packages behind every server on the Model Context Protocol
> registry, finding that 89.6% retype the identity they could derive and 41.1% state a version
> that once tracked the package and has since been left behind.
>
> I cite your work on ― in the related-work section, which is how I came to write to you. The
> PDF is attached; arXiv's guidance is that seeing the intended submission is sufficient basis
> for a decision, and I would not expect you to review it.
>
> My endorsement code is ―, at ―.
>
> If this is not something you are comfortable with, please simply disregard this — I will not
> write again.
>
> With thanks, ―

The last line matters: the policy forbids repeat requests to the same person, so saying so up
front is both honest and correct.

## Timeline and risk

Endorsement typically resolves in days to a couple of weeks, but it depends entirely on a
stranger answering email, and there is no escalation path. **Start it now.** Nothing else on the
submission list has an unbounded external wait.

The ICSE submissions are **not** affected: neither track requires arXiv, and the deadline is
2026-10-23 regardless.

## Fallbacks if endorsement does not come

None of these is as good as arXiv for reach, and all are honest.

- **Zenodo** — issues a DOI, no gatekeeping, indexed, and citable. The realistic substitute.
- **TechRxiv** (IEEE) — a preprint server for engineering, no endorsement system.
- **HAL** or **SSRN** — no endorsement requirement.
- **Self-host** the PDF alongside the artifact and let the ICSE submissions carry the credential.

A pragmatic sequence: post to Zenodo immediately for a citable DOI, pursue arXiv endorsement in
parallel, and cross-post once endorsed. Nothing about arXiv's policy prevents a paper already on
Zenodo from being submitted there later.
