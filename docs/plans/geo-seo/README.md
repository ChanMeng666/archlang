# GEO / SEO wave 3: authority, agent discovery, measurement

Planned 2026-11-06. The as-built surface, its gates and the off-site policy are in
[`docs/seo.md`](../../seo.md); this folder holds only the work that file does not yet record.
`handoff.md` is the resume point.

## 1. Where this starts

Waves 1 and 2 (2026-09) made every page static bytes a crawler can read, and the 2026-11-03 SERP
study added five topic pages. What is left is not on-page mechanics:

- **Thin authority.** Search Console on 2026-11-03: 53 pages indexed, 34 not, 24 of them
  "Discovered - currently not indexed". Bing's `site:` view shows the same ten URLs. No docs page
  links to any of the 34 static playground example pages, so the example corpus is reachable only
  from the playground's own index.
- **Agents cannot find the tool by what it does.** The official MCP registry searches server
  *names*; `search=floor` returns seventeen servers and never `archlang-mcp`. The registry entry
  declares no `remotes`, so the hosted `https://mcp.archlang.uk/mcp` is invisible to every
  registry client and to Glama's connector list, and its description is a list of verbs without
  the words "floor plan". ArchLang is absent from the GitHub MCP Registry (which feeds the VS Code
  and Copilot galleries), the Gemini CLI extensions gallery, ClawHub, the Cline marketplace and
  the Docker MCP Catalog. Awesome Copilot rejected the submission on 2026-10-21.
- **The entity is inconsistent.** Four one-liners across GitHub, the two npm packages and the
  registry; the playground's JSON-LD points at an `@id` the docs never define; `sameAs` omits
  most first-party listings; and the name now collides with `mcabezas/archlang`, a Go language
  that also compiles `.arch` files into MCP servers, as well as an unrelated npm package named
  `archlang`.
- **The instrument has not been read.** The 25-prompt GEO panel (`archcanvas-growth`
  `marketing/offsite/geo-prompt-panel.md`) has one run, the 2026-09-14 baseline. The October and
  November runs were missed. The monthly Search Console AI-impressions export has no record.

Evidence for every line above is in the wave's research pack (growth synthesis, live crawler and
entity audit, 2026 channel research), filed with the growth repository's record of this wave.

## 2. Decisions

Numbered GS-D*n*. Delegated decisions are marked; the rest are inherited and binding.

- **GS-D1 (inherited).** No post, reply, DM or outreach is published to a third party by an agent.
  Registry and directory forms may be driven through the owner's logged-in browser or CLI when the
  owner has asked for that listing; the owner does logins, terms, attestations and the final
  submit (`docs/seo.md` § 8).
- **GS-D2 (inherited).** The wording law holds on every new string: no "first"/"only", no
  Typst/LaTeX in a title or description, only reachability, exact areas and byte-identical
  determinism as measurements, no hype vocabulary, no `keywords` meta, no keyword stuffing.
  Competitors are named fairly and only with the approved comparison sentences.
- **GS-D3 (inherited).** No new schema type is added for citation reasons: the 2026 evidence
  shows no lift. Structured-data work in this wave is identity and freshness hygiene only.
- **GS-D4 (inherited).** `llms.txt` stays an agent aid, never a channel; Wikidata stays on hold;
  the paper stays a Zenodo preprint line; ArchCanvas stays in maintenance (hygiene fixes only, no
  new consumer content line).
- **GS-D5 (delegated).** One category-bearing one-liner is used in every package description
  slot (npm packages, marketplaces, JSON-LD): the `canonicalLine` in `site-shared/doors.json`
  ("Floor plans as code. Your AI writes ArchLang; the compiler draws a precise, dimensioned plan
  and tells it what's wrong."), which is already the docs hero and the playground lede and is
  pinned by `test/site-doors.test.ts`. The GitHub repository description keeps the longer form the
  owner approved on 2026-11-06 (it adds "(SVG, DXF, PDF)" and "Open source, MIT"). The approved
  long sentence ("ArchLang is an open-source (MIT) DSL for floor plans that compiles `.arch`
  source to SVG/DXF/PDF with linting and geometric validation...") stays the first paragraph of
  the README and the docs. **No site wording changes under this card**; the name is always paired
  with "floor plan" on the first mention.
- **GS-D6 (delegated).** The MCP registry entry declares the hosted server as a remote and gains
  a description that names floor plans. The registry schema caps the description at 100
  characters, so it can no longer name all eleven tools; the anti-drift lockstep that
  `packages/mcp/test/server.test.ts` held against the description moves to the package README,
  which has room, and the test keeps asserting that the description says "floor plan" and fits.
  `packages/mcp/server.json` is a high-risk-tier file: **the PR merges only on the owner's words.**
- **GS-D7 (delegated, default yes).** Raw `/<page>.md` copies send `X-Robots-Tag: noindex` so
  the HTML page, not its Markdown twin, is the search result (`/showcase.md` is a `site:` result
  today). The copies stay fetchable and `rel=alternate` stays. The owner may veto.
- **GS-D8 (delegated).** The GEO panel run of 2026-11-06 is appended as the second reading, with
  its session state recorded per row; the cadence returns to the first weekday of each month and
  the handoff names the owner of that run.

## 3. Cards

Each card is one PR unless bundled below. Executors run in worktrees from `main`, one at a time
(the machine hosts other sessions). Local gate: `npm run check:quick` (+ `docs:build` for
`docs-site/` changes); CI is the gate.

### Stage 0: record (PR A, low risk)

- **G0 · This plan.** This folder, a row in `docs/plans/README.md`, and `docs/seo.md` brought to
  the live state: § 8 Awesome-AECO #13 **merged 2026-10-03**, Awesome Copilot #5075 **rejected
  2026-10-21**, registry 0.2.40, Smithery acquired 2026-08-05 and closed 2026-10-31; § 2 and § 6
  counts (34 static example pages; docs 65 and playground 36 sitemap URLs on 2026-11-06).
- **G6 · Crawler names.** `ShapBot` (Parallel Web Systems, a Claude web-search provider since
  2026-10-15) and `DuckDuckBot` named in both `robots.txt` files; `test/docs-page-meta.test.ts`
  name list and `docs/seo.md` § 3 follow.
- **G7 · Dead inbound links.** `docs-site/public/_redirects`: `/error-codes` → `/errors` and
  `/language-reference` → `/reference`, 301. The docs sitemap stops listing `/adr/` (a 307 to
  `/adr`). `scripts/smoke.mjs` asserts both redirects. Proved on `wrangler dev` before merge,
  because the docs Worker has no `main` script and `_redirects` must work as a static-asset rule.

### Stage 1: agent discovery (PR B, high tier because of `server.json`)

- **G1 · Registry entry.** `packages/mcp/server.json`: `remotes: [{ type: "streamable-http",
  url: "https://mcp.archlang.uk/mcp" }]` and the description
  "Floor plans as code: compile, lint and repair ArchLang (.arch) floor plans to SVG, DXF and PDF."
  Validate against the registry schema named in the file. Publishes on the next `v*` tag.
- **G2 · npm and package metadata.** Core `package.json` keywords: drop `typst`, add `floorplan`,
  `floor-plans`, `dxf`, `pdf`, `mcp`, `llm`, `ai-agents`; `packages/mcp` keywords gain `llm`,
  `ai-agents`; descriptions per GS-D5 where the slot is a one-liner; `packages/mcp` and
  `packages/archlang-3d` `homepage` become `https://archlang.uk/mcp` and `https://archlang.uk/3d`.
  README: the "Floor plans as code." heading becomes the page's H1 (same text; scrapers key on the
  first H1 and there is none).
- **G3 · Gemini CLI extension.** `gemini-extension.json` at the repo root, emitted by
  `scripts/gen-agent-manifests.ts` (drift-checked), declaring the stdio MCP server
  (`npx -y @chanmeng666/archlang-mcp`) and a context file derived from the plugin rules. The
  gallery crawler also needs the `gemini-cli-extension` topic; the repo has GitHub's twenty, so
  `zero-dependency` goes. The topic swap is a one-line `gh repo edit`, run after the PR merges and
  recorded in `handoff.md`.
- **G4 · Install deep links.** `docs-site/mcp.md` and the README gain `vscode:mcp/install`,
  `vscode-insiders:mcp/install` and the Cursor deeplink for the hosted server and the stdio
  package, formats taken from the vendors' current docs, not memory. `llms-install.md` at the repo
  root: the install guide an agent follows (Cline reads it).
- **G5 · Docker MCP Catalog.** `packages/mcp/Dockerfile` (the Glama build, in-repo) and the
  `docker/mcp-registry` entry prepared under `docs/plans/geo-seo/docker-mcp-catalog/`; the PR to
  Docker's repository is opened only on the owner's word (GS-D1).

### Stage 2: identity, freshness, internal links (PR C; high tier because `docs-site/public/_headers` is deploy config)

- **G8 · Identity graph.** Playground JSON-LD `@id`s resolve to the docs' `#author`;
  playground `SoftwareApplication` gains `sameAs`, `softwareVersion`, `isPartOf`; docs
  `SoftwareApplication.sameAs` lists every first-party listing (npm `-mcp`, VS Code Marketplace,
  Open VSX, MCP registry, Glama, Context7, PulseMCP, Hugging Face dataset, Zenodo concept DOI);
  `Person.sameAs` adds the ORCID from `CITATION.cff`; a `disambiguatingDescription` names the
  floor-plan language at archlang.uk. `dateModified` on every page from `lastmod.json`.
  `CITATION.cff` version follows the release (or its note explains why not).
- **G9 · Freshness.** Playground sitemap `lastmod` per example from `git log` over its `.arch`
  file (the docs already do this); archcanvas is a separate card (AC1).
- **G10 · Cross-host links.** The docs `/examples` and `/gallery` pages link each plan to its
  static playground page (`/examples/<name>.html`) beside the `#z=` deep link; each static example
  page links to the docs page for its main construct. `test/playground-examples-rows.test.ts` or a
  sibling asserts the two-way coverage.
- **G7b · `.md` copies noindex** (GS-D7): `gen:docs-headers` emits `X-Robots-Tag: noindex` for
  `/*.md` except `llms.txt`/`llms-full.txt`; `scripts/smoke.mjs` asserts it on one `.md` and its
  absence on the HTML twin.

### Stage 3: content (PR D, medium risk: one fresh-context review against `REVIEW.md` and the wording law)

- **G11 · "Floor-plan tools for AI agents".** One neutral, answer-first comparison page listing
  the tools an agent might be offered for the same job (FloorGen, OpenPlan3D, parti-mcp, Skopia,
  Simple House Planner, mermaid-floorplan, WalkMyPlan, Autodesk OAS skills), what each takes in
  and gives out, with a `last_verified` date per row and every fact traceable to
  `archcanvas-growth/data/competitors.json`. Only the approved comparison sentences; a visible FAQ;
  `PAGE_META`, `PAGES` and the sitemap follow.
- **G12 · Three query-shaped articles**, each opening with the answer, carrying a compiled and
  linted `.arch`, a static playground link and a visible FAQ: "generate a floor plan with Claude
  Code / Cursor / Codex" (the install path), "floor plan to DXF from text, open source", "check a
  floor plan for reachability and room areas". Clusters chosen from the SERP study and Search
  Console queries; more follow in later waves if the first three draw impressions.

### Stage 4: measurement and records (growth repository PR E; archcanvas PR AC1)

- **G13 · The reading.** Append the 2026-11-06 panel rows to `data/geo-citations.csv`, the run
  log to `data/geo-citations-notes.md`, a dated `research/2026-11-06-geo-panel-run-2.md`; fix the
  stale items in `ops/seo-dashboards.md` (Safe Browsing cleared 2026-11-03; IndexNow pinged); a
  decision record for this wave pointing here.
- **G14 · Console snapshot.** Read Search Console and Bing Webmaster in the owner's browser,
  read-only: indexed counts, the generative-AI impressions export (first of the three monthly
  hand exports), the inbound 404 list, Bing's IndexNow panel. Recorded in `docs/seo.md` § 6.
- **G15 · Brave.** Submit the home page, `/mcp`, the five topic pages, `/3d` and the playground
  `/examples/` to `search.brave.com/submit-url` (one URL per form; Brave feeds Claude, Le Chat and
  Leo and has no other channel). A form submission, so it runs on the owner's yes.
- **AC1 · ArchCanvas hygiene.** Sitemap `lastmod`; `/ai-floor-plan-generator-dxf` description
  under 160 characters; the duplicated H1 text in the home DOM; a `WebPage` node with dates on the
  three search pages. Local gate there: typecheck + lint only.

## 4. Owner queue (nothing here is done by an agent)

In the order of expected reach. Each is prepared by an agent to the point of a click. **The state
of each item lives in `handoff.md`**, which records what the owner later approved, what agents did
on that word, and what proved impossible for an agent (message requests on X and LinkedIn are
paywalled for non-followers; Reddit refuses every agent route).

1. **Approve PR B** (GS-D6, high tier) and the `zero-dependency` → `gemini-cli-extension` topic swap.
2. **GitHub MCP Registry onboarding**: a post in GitHub's MCP registry discussion asking for
   `io.github.ChanMeng666/archlang-mcp` to be listed (gates the VS Code MCP gallery and Copilot).
3. **ClawHub**: `clawhub skill publish` for the `archlang` skill after login; then the agent files
   the `VoltAgent/awesome-openclaw-skills` entry (it accepts only skills already on ClawHub).
4. **Cline marketplace issue** (needs a 400×400 logo and `llms-install.md`, G4) and the **Docker
   MCP Catalog PR** (G5): the owner says yes, the agent drives the forms from the owner's account.
5. **Awesome lists**: nudge `punkpeye/awesome-mcp-servers` #14383 (no maintainer action since the
   badge on 2026-10-25), `steven2358/awesome-generative-ai` #1375, `semlinker/awesome-typescript`
   #192, `Daviidro/awesome-aec-mcp` #1; new entries for `punkpeye/awesome-remote-mcp-servers`
   (after G1 publishes), `BehiSecc/awesome-claude-skills`, `THUCBIMS/Awesome-AIGC4AEC`,
   `mlightcad/awesome-cad`. `hesreallyhim/awesome-claude-code` and `travisvn/awesome-claude-skills`
   by the owner's hand only.
6. **YouTube**: make the narrated long-form demo public with a transcript, or publish a public
   walkthrough. YouTube is the most-cited domain in Google AI Overviews and small channels are cited.
7. **Glama** description (login), **Claude plugin directory** and **Cursor Marketplace** status checks.
8. **Posts already drafted** (growth `marketing/`): Show HN 2026-12-01 (karma gate; facts to 1.57),
   two dev.to articles, the two ArchLang listicle messages (deskflex, fast.io), the r/floorplan plan.
   The agent refreshes facts to the current release before each; the owner posts.
9. **GS-D7 veto window**: say so before PR C merges if `.md` copies should stay indexable.

## 5. Order

1. PR A (G0, G6, G7), then PR B (G1–G5) in one worktree each, sequentially.
2. PR C (G8, G9, G10, G7b) and PR E (G13) in parallel: different repositories.
3. G14 and G15 in the owner's browser once the panel run has released it.
4. PR D (G11, G12) last, with its review round (at most two).
5. AC1 whenever a slot is free.

## 6. Measures

The wave is read against the instruments that already exist; none is changed.

- GEO panel, bands C–E (`archcanvas-growth/data/geo-citations.csv`): any first citation in bands
  D or E, and band C mentions above the baseline's 1 of 5, over the December and January runs.
- Search Console: "Discovered - currently not indexed" below 24 and the five topic pages plus
  static example pages drawing impressions by 2027-01-15 (the SERP study's own falsifier).
- Agent reach (growth `data/agent-reach.csv`, frozen thresholds, read 2027-01-09): Worker MCP tool
  calls per week, the one measure not yet met (389 against 1,000).
- Registry: `search=archlang` shows `remotes`; Glama lists the connector; the Gemini gallery lists
  the extension; the GitHub MCP Registry lists the server.

## 7. What would prove this wrong

- The panel's December run shows no movement in bands C–E after PRs A–D are live and crawled:
  on-site and registry work does not move citations, and the remaining lever is third-party
  mentions, which only the owner queue can produce.
- Registry `remotes` and the Gemini gallery produce no tool calls: agents do not discover tools by
  browsing registries, and the lever is web search plus the clients' own curated catalogues.
- Impressions grow on brand queries without any disambiguation copy: the collision mattered less
  than authority.
