# GEO / SEO wave 3: handoff

This is the resume point. Update it at the end of every session.

## State (2026-11-06, session 1)

| Card | PR | State |
|---|---|---|
| G0 plan, G6 crawler names, G7 redirects | #530 | CI green; **high tier** (`_redirects` is deploy config), waits for the owner's words |
| G1–G5 agent discovery | #531 | open; **high tier** (`server.json`, root `package.json`, `docs/agents/commands.md`), waits for the owner's words; the GitHub topic swap runs after merge. The new `remotes` and description reach the registry only at the next `v*` release (no version bump, by design). The ten install deep links decode to the documented configs but have not been clicked in VS Code or Cursor: the owner clicks one of each at approval, or records a waiver. One fresh-context review done, no blocker |
| G8–G10, G7b identity, freshness, links | #535 | open; **high tier** (`_headers` is deploy config), waits for the owner's words; rebase on #530 first (both touch `docs/seo.md` § 2 and `scripts/smoke.mjs`). Departures from the cards, by design: the playground app node carries no `sameAs` (it is a different entity from the library), `/gallery` is unchanged (agent-written plans have no static pages), the static pages link back to `/examples` rather than per-construct pages, the docs home has no article node so no `dateModified`. One fresh-context review done (blocker: the risk label; fixed) |
| G11–G12 content | PR D | not started |
| G13 panel reading, records | growth #54 | **merged 2026-11-06**: 49 rows appended (Perplexity 10 answered, signed in by One Tap, then rate-limited; Google AI Mode 23 answered, signed in; ChatGPT not reached); bands D and E still 0; `research/2026-11-06-geo-panel-run-2.md` |
| G14 console snapshot | owner's browser, read-only | done 2026-11-06; to be written into `docs/seo.md` § 6 by PR C. archlang.uk: 53 indexed / 34 not (24 discovered-not-indexed, unchanged); 3 months 561 impressions, 13 clicks, position 6.5; the Generative AI features report (Beta) shows 88 AI impressions in 3 months and 55 in 28 days; external links 70 (archcanvas.uk 17, reddit 12, github 8, libraries.io 8, mcpservers.org 7); Bing: 45 pages indexed, IndexNow submissions arriving. archcanvas.uk: 16 / 12; 129 impressions, 10 clicks; 38 AI impressions |
| G15 Brave | form | waits for the owner's yes |
| AC1 archcanvas hygiene | archcanvas | not started |

## Owner queue

See `README.md` § 4. Added from the panel run: the next Perplexity leg needs a signed-out
session, so the owner signs out of Perplexity in Chrome (or says an agent may) before 2026-12-01.
The run also found the frozen P25 prompt contains an em dash (recorded as a finding, not changed).

## Cadence

- GEO panel: first weekday of each month; next 2026-12-01. Runner: an agent in the owner's Chrome,
  signed-out where the engine allows, rows appended to `archcanvas-growth/data/geo-citations.csv`.
- Search Console AI-impressions export: monthly by hand, three times, then decide on automation.
- Awesome-list and registry state: re-read before every `docs/seo.md` § 8 edit; the site is the truth.
