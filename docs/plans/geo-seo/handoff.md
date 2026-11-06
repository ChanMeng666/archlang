# GEO / SEO wave 3: handoff

This is the resume point. Update it at the end of every session.

## State (2026-11-06, session 1)

| Card | PR | State |
|---|---|---|
| G0 plan, G6 crawler names, G7 redirects | #530 | **merged 2026-11-06** (owner approved in chat) |
| G1–G5 agent discovery | #531 | **merged 2026-11-06**; topic `zero-dependency` → `gemini-cli-extension` swapped the same day. The registry `remotes` and description publish at the next `v*` release. The ten install deep links decode to the documented configs; the owner has not yet clicked one in VS Code or Cursor |
| G8–G10, G7b identity, freshness, links | #535 | **merged 2026-11-06** after a rebase on #530 (the `docs/seo.md` § 2 row and `scripts/smoke.mjs` conflicts resolved by hand). By design: the playground app node carries no `sameAs`; `/gallery` unchanged; static pages link back to `/examples`; the docs home has no `dateModified`. Playground `dateModified` values are floored by the generator's commit date, so they move when `gen-static.mjs` changes |
| G11–G12 content | #537 | review round 1 done (blocker: a permit claim about other tools, fixed in `a54813bc`); rebased on #535 with `_headers` regenerated; merges on green CI (high tier by `_headers`, approved by the owner in chat) |
| G13 panel reading, records | growth #54 | **merged 2026-11-06**: 49 rows appended (Perplexity 10 answered, signed in by One Tap, then rate-limited; Google AI Mode 23 answered, signed in; ChatGPT not reached); bands D and E still 0; `research/2026-11-06-geo-panel-run-2.md` |
| G14 console snapshot | owner's browser, read-only | done 2026-11-06; to be written into `docs/seo.md` § 6 by PR C. archlang.uk: 53 indexed / 34 not (24 discovered-not-indexed, unchanged); 3 months 561 impressions, 13 clicks, position 6.5; the Generative AI features report (Beta) shows 88 AI impressions in 3 months and 55 in 28 days; external links 70 (archcanvas.uk 17, reddit 12, github 8, libraries.io 8, mcpservers.org 7); Bing: 45 pages indexed, IndexNow submissions arriving. archcanvas.uk: 16 / 12; 129 impressions, 10 clicks; 38 AI impressions |
| G15 Brave | form | **done 2026-11-06**: nine URLs submitted and confirmed; Brave already indexed archlang.uk |
| AC1 archcanvas hygiene | archcanvas #290 | **merged 2026-11-06**; `lastmod` appears after the first `main` deploy runs the new `gen-lastmod` step (check the live sitemap); the home H1 duplicate was left as is (an `sr-only` name plus an `aria-hidden` visual copy, pinned by an NVDA test) |

## Owner queue

The owner approved the whole § 4 list in chat on 2026-11-06. Done by agents the same day: PR
merges, the topic swap, Brave, the GitHub MCP Registry request (discussion #3711), two new
awesome-list entries, three nudges and two rebases; the launch drafts were refreshed to 1.57.0
(growth #55). Later the same day, by agents: Docker catalog PR docker/mcp-registry#6704 (validate and build
passed locally), the Glama description, Perplexity signed out in Chrome, the Cursor install link
verified (the deeplink wrote the stdio entry into `~/.cursor/mcp.json`), the Cline form filled in
the owner's browser. On 2026-11-07, with the owner online: ClawHub skill published (live, scan clean); the YouTube demo
made public at the owner's word; two dev.to drafts saved (unpublished; the owner publishes after
re-running the snippets, since draft 1 still carries 1.36.0 notes and draft 2 lacks its
`pointInPolygon` helper); the Cursor install link verified; Cline deferred by the owner; the
awesome-openclaw entry deferred until the skill has users. Later on 2026-11-07, at the owner's
instruction in chat: the two dev.to articles were published by an agent (outputs re-run on 1.57.0;
growth #58 records the exception), the awesome-openclaw entry was filed (#610), the marketing
calendar's `show-hn-refresh` task was closed (the draft is at 1.57.0; 2026-12-01 holds only
`show-hn`). The listicle messages could not be sent by an agent: X and LinkedIn paywall a message
request to a non-follower and deskflex has only a demo form needing personal data (growth
`marketing/offsite/listicle-outreach-2026-11.md` has the routes left). **Still the owner's hands:**
the listicle messages, r/floorplan (rules unreadable by agents; post if wanted), Show HN on
2026-12-01 (the owner posts), Claude plugin directory and Cursor Marketplace status checks, and
the VS Code install link if a VS Code machine is at hand.

## Cadence

- GEO panel: first weekday of each month; next 2026-12-01. Runner: an agent in the owner's Chrome,
  signed-out where the engine allows, rows appended to `archcanvas-growth/data/geo-citations.csv`.
- Search Console AI-impressions export: monthly by hand, three times, then decide on automation.
- Awesome-list and registry state: re-read before every `docs/seo.md` § 8 edit; the site is the truth.
