# Public surfaces: handoff

This is the resume point. Update it at the end of every session.

## State (2026-11-06, end of session 1)

Stages 0–4 are done. Released as core 1.56.0 / MCP 0.2.39 / VS Code 0.44.0 (npm, MCP registry,
GitHub Release with the MCPB, Marketplace uploaded by the agent through Chrome, Open VSX). V1 ran
once with three fresh readers (developer, non-programmer, HN sceptic); its fixes are #514. #512
fixed the release workflow's registry re-run check; #513 recorded the agent Marketplace upload.

| Card | Where | PR |
|---|---|---|
| plan, A3 | archlang, archcanvas-growth | #499, growth #49 |
| S1 doors, O1 npm MCP page, O2 llms.txt | archlang | #500 |
| S2 no-install doors on the current sites | archlang | #502 |
| O3 owner database | ChanMeng666 | #48 |
| P1 view mode, lazy editor, prerendered drawing | archlang | #501 |
| P2 strip, P3 hover/card/facts line | archlang | #503, #504 |
| P4 knobs + `knob-flat` | archlang | #505 |
| P5 Make your own, P6 Checks + "Flat with one thing to fix" sample | archlang | #506, #507 |
| D1–D4 docs nav, `/start`, home, captions, proof line | archlang | #508 |
| SC1 showcase front door; Miraflores to the lab | archlang-showcase #3, archlang-lab #1 | |
| C1 card retold (24 s, 208 KB) | ChanMeng666 | #49 |
| R1 README, O4 VS Code listing image, O5 (no change needed) | archlang | #509 |
| O6 chanmeng.org stage refresh (premise corrected) | 2d-portfolio | #12 |
| O7 film homepage, awesome-aec-mcp entry | repo settings, awesome-aec-mcp #1 | |
| O8 archcanvas footer link | archcanvas | #289 |
| GitHub repo description and social preview | repo settings (done through `gh` and Chrome) | |

**Measured (desktop):**
- Playground startup JS without the compiler: about 625 KB → 13.9 KB gzip.
- Docs hero both doors above the fold at 1280×800 and 390×844; hero run 7.1 s.

**Open:**
- **Glama description:** done 2026-11-06 (the canonical line, then the tool list).
- **Next release:** #514 changed the README, the MCP README and the VS Code README after 1.56.0, so
  the npm pages and the listing lag until the next release (a 1.56.1 patch, or the next minor);
  the owner says "release" and the agent runs the whole path.
- **V1 residue (not fixed, judged out of scope or by design):** the playground has no
  plain-language prompt box (hosted generation is ArchCanvas's room); "Designs that compile." stays
  as the h1 (ADR 0010) with the plain lede under it; what ChatGPT renders on screen is unverified
  (the doors say only what the compiler returns).
- **Follow-ups:**
  - backlog PG.1–PG.3 (room keyboard access, bbox hit-testing, facts-line shift);
  - a fixable example pair for Checks inside the corpus (examples stay warning-free, so the demo is
    a playground sample);
  - `/start` real captures;
  - `2d-portfolio/public/cv-llms.txt` is a stale copy of the profile's (12,882 tests);
  - the McCallister post moves off 2026-12-01 (`chanmeng-marketing/calendar.yaml`);
  - the release marker in `archcanvas-growth/data/agent-reach.csv`.

## 3D on every surface (PS-D11, `3d.md`): done, released as 1.57.0

The owner ruled on 2026-11-06 that the archlang-3d preview goes on every ArchLang surface,
always beside its plan (PS-D12). Every card shipped the same day.

| Card | What | PR |
|---|---|---|
| X0 | The ruling recorded in both repos | #516, growth #51 |
| X1, X2 | The 3D view opens on the settled iso frame; storeys stack | #517 |
| X3 | Stairs as stepped solids (`treadCount` exported) | #518 |
| X4, X4b | `gen:3d-assets`: posters, replays and GLBs for 11 plans, a plan PNG each; an asset changes only when what it shows changes; storey-joint z-fight fixed | #519, #523 |
| X5 | Playground Plan \| 3D switch, `&3d`, Download GLB | #520 |
| X6 | Docs home band, gallery swap, `/3d` | #521, #525 |
| X7 | README plan and 3D pairs; npm MCP and VS Code pages | #522 |
| X8 | Showcase 3D for 11 plans, chanmeng.org, `llms.txt` | showcase #4, 2d-portfolio #13, #524 |
| X9 | Show HN 3D paragraph and answers | growth #52, #53 |
| V2 | Fresh readers; "checked against the plan" defined, limits above the pictures | #529 |

- **Release (`v1.57.0`):** core 1.57.0, archlang-3d 0.4.0 (peer `^1.57.0`), MCP 0.2.40, VS Code
  0.45.0 (Marketplace and Open VSX).
- **#529 after the release:** it changed the package README wording, so the npm pages carry it at
  the next release.
- **Residue:**
  - backlog ST.1, PG.1–PG.3 and 3D.1–3D.5;

## What the revision changed (and why)

- **The message stays in the developer room.** "Describe a home → get a plan" is ArchCanvas's line
  for Product Hunt on 12-15 (`category.md` §3).
- **Two lines were dropped:**
  - "before you see it", which is banned phrasing B12;
  - the "vs AI image vs CAD" table, which breaks B1 and the unverified ChatGPT-Images claim. It is
    replaced by a "what it is / isn't" table plus honest limits.
- **The doors are ordered per surface.** The coding agent comes first on the README. The VS Code
  extension is added, because it is one of the frozen success measures.
- **The short link is made on click only,** which keeps the "nothing sent to a server" promise.
- **Source stays visible:** the playground is the Show HN URL.
- **New cards:**
  - P6, the Checks receipts;
  - SC1, the showcase;
  - O1–O8: the npm MCP page, `llms.txt`, the owner database, VS Code, registries, chanmeng.org,
    the film repos and awesome list, and the archcanvas footer.

## Rulings

All of these were made by the owner's delegation on 2026-11-06. They are PS-D10 in `README.md`:

- View mode is the default, with Source visible.
- The README gate is cleared.
- Knobs use existing `let`s only, plus new examples where needed.
- Miraflores leaves the public showcase.
- Fan recreations go below the fold and get no new additions.
- The freeze does not cover site work, but there is a 11-24 fallback for P1.

## Still the owner's

See README §6:

- ~~the GitHub social preview and description~~ (done 2026-11-06);
- ~~the Marketplace upload~~ (the agent uploads through Chrome since 0.44.0);
- ~~Glama~~ (done 2026-11-06);
- the docs-only patch tag.

A3 was ruled on 2026-11-06 (README §6). The general claim waits for OAS; the OpenPlan3D import is
stated as a feature fact only.

**Owner instruction (2026-11-06):** for owner-only items, first do what can be done through Claude
in Chrome, then guide the owner through the steps that need their login or 2FA, then continue
automatically. The owner agreed to every design and decision in this plan.

## Next

1. The next release, when the owner says so.
2. The follow-ups above, as backlog cards.
