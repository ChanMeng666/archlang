# The SEO / GEO surface

What the two public sites publish for search engines and answer engines, which file owns each
piece, and which gate catches it when it drifts.

This is contributor documentation. It is **not** published to the docs site — it is absent from
`docs-site/sync-docs.mjs`'s `PAGES` table on purpose, the same way [`testing.md`](testing.md) is,
because publishing it would add a route to every list downstream (the sitemap, the raw `/<page>.md`
copies, `PAGE_META`, the smoke checks) for a page no reader of the language needs.

---

## 1. What the surface is, and why it is bytes

No AI crawler executes JavaScript. Measured over roughly a billion requests, the answer-engine
fetchers render nothing: what they read is the HTML the server sent. So everything here is **static
bytes in the response** — a heading, a lede, a canonical link, a description, a JSON-LD block — and
nothing is painted by script. That is why the playground serves a visible heading and lede (the header's brand and a line under the drawing) and 34 static
example pages: a Vite shell with five empty mount points and a `#z=` fragment (which never reaches a
server at all) is, to every engine, one contentless URL. The tactics with measured lift are
quotations, statistics, cited sources and answer-first prose; **keyword stuffing is the one tactic
measured to hurt**, which is why no page carries a `keywords` meta and every description is gated to
read as a sentence.

## 2. Surface → owner → gate

| Surface | Owning file | Gate that catches drift |
|---|---|---|
| Docs `robots.txt` (every crawler named and allowed, `Sitemap:`) | `docs-site/public/robots.txt` | `test/docs-page-meta.test.ts` (names + sitemap line); `scripts/smoke.mjs` docs route; `docs-site/e2e/routes.spec.ts` `@prod` |
| Playground `robots.txt` | `playground/public/robots.txt` | `scripts/smoke.mjs` playground route |
| Docs sitemap + per-route `lastmod` | `docs-site/.vitepress/config.ts` `sitemap.transformItems`, dates written to `.vitepress/lastmod.json` by `sync-docs.mjs` from `git log` over each page's source | `@prod` "sitemap lists every page route"; `scripts/smoke.mjs`. The writer is wrapped in try/catch — a shallow clone emits no dates rather than failing the build |
| Playground sitemap (36 URLs: `/`, `/examples/`, 34 pages) and its per-URL `lastmod`: each example page from `git log -1 --format=%cI` over its `examples/<name>.arch`, floored by the generator's own commit date; `/` and `/examples/` take the newest of those | `playground/scripts/gen-static.mjs` (`exampleDates`) | `test/playground-examples-rows.test.ts`; `scripts/smoke.mjs`. The git call is wrapped in try/catch, as the docs writer is: no git emits no dates rather than failing the build |
| Canonical, per-page `<title>` and description, `og:*` / `twitter:*` | `PAGE_META` + `transformPageData` + `transformHead` in `docs-site/.vitepress/config.ts` | `test/docs-page-meta.test.ts` (two-way route coverage, 80–170 chars, sentence shape, killed-claim regexes); `@prod` "head metadata" |
| JSON-LD (`WebSite` + `Person` + `SoftwareApplication` + `SoftwareSourceCode` on `/`; `TechArticle` + `BreadcrumbList` elsewhere). The ids `#website`, `#author`, `#software`, the `SoftwareApplication`'s `sameAs` (every first-party listing: GitHub, both npm packages, skills.sh, VS Code Marketplace, Open VSX, the MCP registry entry, Glama, Context7, PulseMCP, the Hugging Face dataset, the Zenodo concept DOI) and its `disambiguatingDescription` come from `site-shared/identity.json`; the `Person.sameAs` adds the ORCID read from `CITATION.cff`; each `TechArticle` carries `dateModified`, the same date as its sitemap entry (`lastmod.json`, else VitePress's git date for a tracked page, else omitted) | `structuredData()` in `docs-site/.vitepress/config.ts`; `site-shared/identity.json` | `@prod` "head metadata" parses it; descriptions come from `PAGE_META`, so the wording law is enforced in one place. A `sameAs` URL is added only after it was fetched and resolved |
| Five topic pages, one search cluster each: `/floor-plans-as-code`, `/floor-plan-dsl`, `/mcp`, `/javascript`, `/vs-mermaid` (added 2026-11-03, PR #452, from the SERP study in §8). Each opens with the standalone definition, carries a `.arch` plan compiled and linted clean, and ends in a visible `## FAQ` (no FAQPage markup, §11) | `docs-site/<page>.md`, rows in `PAGE_META` and `sync-docs.mjs` `PAGES` | `test/docs-page-meta.test.ts`; `test/docs-flags.test.ts`; `test/docs-sync-list.test.ts` |
| The docs H1 keyword sub-line | `docs-site/.vitepress/theme/CompileSeam.vue` | **No gate of its own.** `npm run docs:build` compiles it; the `@prod` home case asserts the agents band, not this line. Treat it as hand-checked |
| Playground heading, lede, `<noscript>`, JSON-LD (ruling PG-D6, card PG4: the one `h1` is the header's brand, "ArchLang Playground" as real text; the lede is the canonical line from `site-shared/doors.json`, filled in at build time, small and visible at the right of the stage's foot; the `<noscript>` note sits under the header). Every `archlang.uk` `@id` it references is a node the docs home defines; its `SoftwareApplication` (the web app, a different entity from the library, so it carries no `sameAs`) has `softwareVersion` from the root `package.json`, filled at build time, and `isPartOf`/`isBasedOn` the docs `#software` | `playground/index.html`; the `identityJsonLd` and `canonicalLine` plugins in `playground/vite.config.js` | `scripts/smoke.mjs` (`<h1 class="tb-brand">`, the lede paragraph with the canonical line read from `doors.json`); `playground/e2e/boot.spec.ts` `@prod` case, which navigates with `waitUntil: "commit"` so it reads pre-hydration bytes |
| `/embed.html` de-indexed | `playground/public/_headers` (`X-Robots-Tag: noindex, follow`) plus a `<meta name="robots">` in `playground/embed.html` | `scripts/smoke.mjs`'s `header()` assertion — the one check in that file that reads a response header rather than a body |
| 34 static example pages, `/examples/` index and its gallery thumbnails (`/examples/thumbs/*.svg`), the `#z=` deep link on each; on `/` itself, the header's plan gallery (card PG3, ruling PG-D2), one `<a href="/examples/<name>.html">` card per example plus "All plans" to `/examples/`, in the served bytes (it replaced the thumbnail strip, whose crawl links it carries, one for one) | `playground/scripts/gen-static.mjs`, driven by `EXAMPLE_ROWS` in `playground/src/examples.ts`; the `/examples/` rewrite in `playground/public/_redirects`. The page's tokens are sliced from `playground/src/styles/tokens.css` and its `@font-face` rules harvested from `playground/dist/assets/*.css` — neither is retyped | `test/playground-examples-rows.test.ts` (both directions against `examples/*.arch`, blurb length and killed claims, the gallery's card template); `playground/e2e/examples-static.spec.ts` (incl. the `document.fonts` case and the thumbnail case); `playground/e2e/gallery.spec.ts` (every example's card link in the pre-hydration bytes of `/`, in `EXAMPLE_ROWS` order); `scripts/smoke.mjs` (`<a class="gal-card" href="/examples/`) |
| Redirects for two dead inbound URLs: `/error-codes` → `/errors`, `/language-reference` → `/reference`, 301 (added 2026-11-06; the Worker has no `main` script, so this is a static-asset rule) | `docs-site/public/_redirects` | `scripts/smoke.mjs` (`redirectCheck`: status 301 and the `Location`) |
| Raw `/<page>.md` copies and `rel=alternate` links to them | `docs-site/sync-docs.mjs` `PAGES`; `transformHead` | `test/docs-sync-list.test.ts`; the `@prod` byte-equality cases, which double as a deploy-staleness probe |
| `X-Robots-Tag: noindex` on each raw `/<page>.md` copy, and on nothing else (`/llms.txt`, `/llms-full.txt` and the HTML pages stay indexable; see §5) | `scripts/gen-docs-headers.ts` → the generated block of `docs-site/public/_headers` | `test/docs-headers-drift.test.ts` (closed-world: only the `.md` rules carry it); `scripts/smoke.mjs` (present on `/showcase.md`, absent on `/showcase` and the `llms` files) |
| Cross-host example links: each plan's widget on the docs `/examples` page links its static playground page, and each static page links back to the docs `/examples` | `page="<name>"` on each `<ArchLive>` in `docs-site/examples.md` (rendered by `ArchLive.vue`, and as a link in the raw copy by `site-markdown.mjs`); `examplePage()` in `playground/scripts/gen-static.mjs` | `test/playground-examples-rows.test.ts` ("the two hosts link each example plan both ways") |
| `llms.txt` / `llms-full.txt` | repo root, copied by `sync-docs.mjs`; `llms-full.txt` from `npm run gen:llms` | `npm run check:drift`; `scripts/smoke.mjs`. See §5 |
| IndexNow key file and post-deploy ping | `docs-site/public/<key>.txt`, `playground/public/<key>.txt`, `scripts/indexnow.mjs`, a step per matrix leg in `deploy.yml` | `test/indexnow-script.test.ts` (sitemap parsing; the always-exit-0 promise, checked by spawning the script). The key is public by design and lives in a repository **variable**, not a secret — see `docs/hosting-and-domains.md` § IndexNow |

## 3. Crawler policy: allow everything

Both sites allow every crawler, **training crawlers included**, and name them one by one so the
policy is legible to an auditor rather than implied by a wildcard. The reason is the project's own
thesis: this language is written by models as much as by people, so a corpus containing ArchLang
source and its error catalogue is a distribution channel, not a leak. Everything published is MIT
and already on npm and GitHub.

- **Search and answer indexes** — `Googlebot`, `Bingbot`, `Applebot`, `Amazonbot`,
  `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `DuckDuckBot`, `ShapBot` (Parallel Web
  Systems, a Claude web-search provider since 2026-10-15).
- **Live per-request fetchers** (a user asked something now) — `ChatGPT-User`, `Claude-User`,
  `Perplexity-User`.
- **Training and corpus crawlers** — `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`
  (Common Crawl), `Meta-ExternalAgent`, `Bytespider`, `Applebot-Extended`.

Two things that are easy to get wrong. **A Cloudflare crawler block is a zone setting no test in this
repo can see**, so it is part of this surface even though no file here expresses it — audited by hand
on 2026-09-14, when nothing was blocked on either zone; the per-crawler table and its two companion
switches are written down in [`hosting-and-domains.md`](hosting-and-domains.md). And `/embed.html` is
de-indexed by a header, never by a `Disallow`: a `Disallow` stops the fetch, and a header nobody
fetches de-indexes nothing.

## 4. The wording law

Every public string here traces to the approved boilerplate in the private growth repository, at
`marketing/copy/messaging-library.md`. Two hand-written tables carry that text — `PAGE_META` in the
VitePress config and `EXAMPLE_ROWS` in the playground — and a hand-written table is acceptable
**because** the regexes run over it: `test/docs-page-meta.test.ts` and
`test/playground-examples-rows.test.ts` reject the Typst/LaTeX analogy as a differentiation claim
(it stays in body copy), novelty claims of the "first"/"only" shape, the retired positioning lines
(`Design Compiler`, `Code as CAD`, `checked design`, `every clearance measured`) and hype
vocabulary. Each regex is paired with the reason it exists, so a failure says what was decided.

Exactly three measurements are claimable, because exactly three are things the compiler computes:
**room reachability from an entrance**, **exact floor areas**, and **byte-identical determinism**.
The statistics sentence on each example page is built from `describe()`, and its reachability
clause is emitted only when `describe()` reports it.

## 5. `llms.txt`: kept, never claimed

**No engine is known to read `llms.txt`.** A 300,000-domain study by SE Ranking found no
correlation between serving one and being cited; Google has said publicly that it does not support
the convention; Anthropic's crawler documentation describes `robots.txt` and nothing else. Ours is
kept because it is genuinely useful to an agent pointed at the repo, and because it costs a
generator run. It is **not** an SEO channel, must never be described as one in any copy, and must
not be expanded in the hope that it becomes one. Applied on 2026-11-03 (PR #456): of the five topic
pages it lists only `/mcp` and `/javascript`, which carry agent setup and API facts found nowhere
else in the file; the three search-intent pages stay out.

The raw `/<page>.md` copies send `X-Robots-Tag: noindex` (GS-D7, 2026-11-06), because a raw copy
had become a `site:` result (`/showcase.md`, with no navigation and no structured data) in place of
its HTML page. The copies stay fetchable for agents and every page keeps its `rel=alternate` link;
`llms.txt` and `llms-full.txt` carry no such header.

## 6. Dashboards

Both consoles belong to the owner. **No account address, property id or verification token is
recorded here or anywhere else in this public repository** — ask the owner rather than re-verifying.

- **Google Search Console** holds the `archlang.uk` **Domain** property (verified 2026-09-14) by DNS
  TXT. A Domain property covers every subdomain, so
  `playground.archlang.uk` needs none of its own — which is why TXT beat the meta tag: no repository
  change, one property for both hosts. Decline the one-click Cloudflare verification Google offers;
  it grants write access to the whole DNS account, and the manual path proves the same thing.
- **Bing Webmaster Tools** holds the same property, imported from Search Console. **The import does not
  carry sitemaps** — observed on two separate imports, despite the card promising it — so submit them
  by hand afterwards, every time.
- **Two sitemaps** (counted live 2026-11-07): `archlang.uk` 69 URLs, `playground.archlang.uk` 36
  (34 and 29 at the 2026-09-14 setup). Both
  engines report Success on both and agree on every number; a disagreement means a deploy or a
  generator has drifted, not that a console is being odd.
- **The generative-AI impressions report** in Search Console is where AI-Overview visibility shows
  up, worldwide since 2026-08-31. Export it by hand, monthly, for three months before automating.
- **IndexNow** — mechanics (public key, repository variable, a script that always exits 0) in
  [`hosting-and-domains.md`](hosting-and-domains.md) § IndexNow. The first live pings both returned
  **HTTP 202**, for 34 URLs on the docs host and 29 on the playground. Bing's IndexNow panel stays
  empty until a ping arrives: the key is validated at ping time against the hosted file, never
  registered in advance through the dashboard.
- **Snapshot, 2026-11-06** (read by hand, read-only; Google data to 2026-11-04). `archlang.uk`:
  53 pages indexed, 34 not (24 "Discovered - currently not indexed", the usual sign of thin
  external authority; 5 "Crawled - currently not indexed"; 4 redirects; 1 "Blocked due to other
  4xx", which is `mcp.archlang.uk/mcp` and expected). Last three months 561 impressions, 13 clicks,
  average position 6.5; last 28 days 372 impressions, 8 clicks; top query `archlang` (79
  impressions, 7 clicks). The **Generative AI features** report (Beta, impressions only) shows 88
  impressions over three months and 55 over 28 days: the first reading of that report. External
  links 70 (archcanvas.uk 17, reddit.com 12, github.com 8, libraries.io 8, mcpservers.org 7).
  Bing: 45 pages indexed, 17 impressions since 2026-09-18, IndexNow submissions arriving.
  `archcanvas.uk`: 16 pages indexed, 12 not; 129 impressions, 10 clicks; 38 AI impressions.
  **Do not add properties under any other Google account**: on 2026-11-03 an agent did so by
  mistake and removed them; the owner's account already holds them.
- **Neither ArchLang site has analytics**, by design, so there is no referrer count from
  `chatgpt.com` or `perplexity.ai` here. State that gap rather than inventing a number.

## 7. Safe Browsing incident, 2026-09-14

Search Console reported a site-level **"Deceptive pages"** verdict against the `archlang.uk` apex:
one issue, **no sample URLs** (the field reads `N/A`), no first-detected date, manual actions clean,
and **no Chrome interstitial** at any point — a meaningful negative, because Google's own Safe
Browsing test page *was* blocked in the same profile. The transparency report gave the same verdict
for every path under the apex, the shape of a host-level classification rather than a page detection;
`www` and the playground host carried nothing.

The audit found nothing to fix: across every published docs page, zero forms, zero inputs, zero
iframes, zero cross-origin scripts, no ads, no downloads, no login, and no `eval` / `atob` /
`new Function` / `document.write`. The DNS zone holds four records and both hosts are static Workers,
so no subdomain and no writable endpoint could have served a deceptive page, and the edge log shows
no traffic anomaly. The likeliest explanation is a classifier false positive on a two-month-old
domain. A review was requested on **2026-09-15** through both channels — Search Console's *Request
review* and the separate "report incorrect phishing warning" form; Google documents reviews as taking
several days.

**Cleared.** Search Console's Security issues report read "No issues detected" on 2026-11-03.

Two mitigations shipped anyway (PR #99), because both are right regardless of the verdict:

- **The playground shell refuses to be framed; `/embed.html` deliberately still allows it.** `/` and
  `/index.html` send `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`; the embed viewer,
  the surface that is *meant* to sit in other people's pages, carries neither. **Both paths are
  listed because `_headers` binds to the REQUEST path**, not to the file the asset layer resolves to —
  proved on a local `wrangler dev` with two probe rules carrying different values, where `/` came
  back with only the `/` rule's header, so the `/  /index.html  200` rewrite carries nothing across.
  `scripts/smoke.mjs` asserts the presence on both and the **absence** on `/embed.html`; that
  negative check is the embed contract.
- **A shared plan is attributed.** A load whose decoded `#z=` payload is not byte-equal to a bundled
  example shows a dismissible `role="status"` strip saying the text was written by whoever shared the
  link. Silent for stock-example permalinks, so the notice never becomes furniture.

**If it recurs:** re-run the audit above, request the review once rather than repeatedly, and **never
add a `robots.txt` Disallow for `/embed.html`** — a page a crawler cannot fetch is a page the
`noindex` header cannot de-index. The one real mechanism on the domain is the `#z=` channel: labels
are author text, so a room called `Session expired — sign in` is a lint-clean plan. The language
cannot police the words and should not try; framing and attribution are the levers.

## 8. Off-site

Third-party mentions correlate with being cited by an answer engine far more strongly than backlinks
do, so off-site work belongs to this surface even though no file here expresses it. **No post or
outreach is published to a third party by an agent.** Drafts live in the private growth repository
under `marketing/offsite/`, with the manual submission guide at
`marketing/launches/runbook-2026-09.md`; the owner posts. Opened 2026-09-14 from the owner's
account, awaiting maintainers (except where marked):

| List | Pull request |
|---|---|
| punkpeye/awesome-mcp-servers | [#14383](https://github.com/punkpeye/awesome-mcp-servers/pull/14383) — waits on the Glama badge (below) |
| osama-ata/Awesome-AECO | [#13](https://github.com/osama-ata/Awesome-AECO/pull/13) — merged 2026-10-03 |
| Daviidro/awesome-aec-mcp | [#1](https://github.com/Daviidro/awesome-aec-mcp/pull/1) |
| steven2358/awesome-generative-ai | [#1375](https://github.com/steven2358/awesome-generative-ai/pull/1375) |
| semlinker/awesome-typescript | [#192](https://github.com/semlinker/awesome-typescript/pull/192) |
| BehiSecc/awesome-claude-skills | [#1212](https://github.com/BehiSecc/awesome-claude-skills/pull/1212) — opened 2026-11-06 |
| THUCBIMS/Awesome-AIGC4AEC | [#21](https://github.com/THUCBIMS/Awesome-AIGC4AEC/pull/21) — opened 2026-11-06; a papers list, so ArchLang is offered as a project and may be declined |
| hashgraph-online/awesome-ai-plugins | [#1209](https://github.com/hashgraph-online/awesome-ai-plugins/pull/1209) — opened 2026-11-07 at the owner's word, answering their outreach issue [archlang#554](https://github.com/ChanMeng666/archlang/issues/554); Agent Skills section; their source scan must reach 75 to merge and `main` scored 70, so #558 (plugin-bundle LICENSE/SECURITY.md, pinned actions) raises it to 80 locally |

On 2026-11-06, with the owner's approval in chat, an agent rebased #14383 and #1375 (both had
conflicts; the re-added lines no longer claim DXF/PDF from the MCP server), left one short comment
on #1375, #192 and aec-mcp #1, and opened the two new entries above, every text disclosing the
maintainer's account and the AI draft. `mlightcad/awesome-cad` was skipped (no merge since
2026-06-05); `punkpeye/awesome-remote-mcp-servers` waits for the registry `remotes` to publish at
the next release; `VoltAgent/awesome-openclaw-skills` waits for a ClawHub publish (owner login).

**One exception on record, 2026-11-03.** A SERP study run from the owner's `serpdata-api-test`
repository (`reports/arch-projects-analysis.md`, with an errata block at its head) led an agent,
on a broad "implement the recommendations" instruction and without reading this file, to post a
disclosed reply on [mermaid-js/mermaid#6134](https://github.com/mermaid-js/mermaid/issues/6134#issuecomment-6596671947)
(the floorplan-syntax request, Google's first result for "mermaid for floor plans") and to open a
duplicate awesome-mcp-servers PR (#18435, closed in favour of #14383). The owner kept the reply; it
is logged with its approval gap in the growth repository's `data/community-replies.json`. Read
this section before any off-site step. The open wave of authority, agent-discovery and
measurement work is planned in [`plans/geo-seo/README.md`](plans/geo-seo/README.md).

**Registries and directories are a different class from posts**: a listing is how an agent finds
the tool. This section is the single statement of the submission policy (owner, 2026-10-14): an
agent may drive a submission form or publish step through the owner's logged-in browser or CLI when
the owner has asked for that listing. The owner personally does account creation, logins, 2FA/OTP,
API-token and secret creation, acceptance of terms and attestations, native file pickers, and the
final submit of anything that accepts terms, and edits in the Cloudflare dashboard (WAF rules, DNS,
custom domains): the agent's browser session is refused there by its permission layer, so the agent
writes the exact steps and verifies the result afterwards (for a rate limit: a burst of requests and
the 429s). An agent never passes a CAPTCHA or pays. State on
2026-10-25 (the site, not this table, is the truth for what is live):

| Where | State | Kept current by |
|---|---|---|
| Official MCP registry (`io.github.ChanMeng666/archlang-mcp`) | live, latest 0.2.40 (2026-11-06) | `release.yml` on a `v*` tag |
| [Context7](https://context7.com/chanmeng666/archlang) | live | parsed from the public repository |
| Smithery | gone: acquired by Arcade on 2026-08-05, publishing and its MCP proxy closed on 2026-10-31; the `chanmeng-dev/archlang` page is a 404 (checked 2026-11-04) and the `.smithery.mcpb` variant is retired | — |
| Claude plugin directory (claude.ai) | submitted by the owner, in review | reads `plugins/archlang/`; the push-updates webhook it offered is not set up |
| mcpservers.org | live, approved 2026-10-10 | — |
| [Glama](https://glama.ai/mcp/servers/ChanMeng666/archlang) | listed and claimed; builds from the Dockerfile set in its admin (installs `@chanmeng666/archlang-mcp`, runs `archlang-mcp` behind `mcp-proxy`), release 0.1.0 passed on 2026-10-25 and was rated A (TDQS 4.3/5 over 11 tools, maintenance A); the description leads with the canonical line since 2026-11-06; the listing description was set to the canonical one-liner on 2026-11-06 and the listing shows the hosted `https://mcp.archlang.uk/mcp` remote | Glama's Auto-Release on each GitHub release; the badge is on #14383 (backlog O.1) |
| mcp.so | not listed: submission is paid | — |
| VS Code Marketplace (`ChanMeng.archlang`) | live, 0.31.0 uploaded by the owner (the gallery API lags minutes) | the owner's web upload (`/release-check`) |
| [OpenAI plugin directory](https://chatgpt.com/plugins/plugin_asdk_app_6acf8381cca08191bfb3eb7305fb6970) (Codex, ChatGPT) | live: 1.55.0, uploaded by an agent and submitted and published by the owner on 2026-11-05 (portal: "Listed publicly", ChatGPT page reads 1.55.0), no findings, its skills pinning CLI 1.55.0; earlier 1.43.0, 1.50.0 and 1.50.1; all three starter prompts verified in ChatGPT; hosted MCP server `archlang` with no authentication, domain verified through the Worker's `OPENAI_APPS_CHALLENGE`, 12 tools; the review information on file holds countries, five test cases, three negative cases, release notes and the video walkthrough (the unlisted narrated demo of the command line; its URL lives in the portal and in the private `archlang-demo-video` repo, never here) | `npm run build:openai-plugin` in the primary checkout, from `plugins/archlang/` (generated by `gen:agent-manifests`); steps in [`integrations.md`](integrations.md) |
| [Awesome Copilot](https://github.com/github/awesome-copilot) (Copilot CLI marketplace) | submitted by the owner as an issue, not a pull request: [github/awesome-copilot#5075](https://github.com/github/awesome-copilot/issues/5075) (ref `v1.43.0`, commit `f07a3b4`, path `plugins/archlang`), closed as not relevant on 2026-10-21 (its intake had failed quality gates on 2026-10-14); the owner used its external-plugin issue form | `plugins/archlang/` (`plugin.json` + `skills/`), generated by `gen:agent-manifests` |
| [Open VSX](https://open-vsx.org) | live (0.38.0 published by the workflow on 2026-11-01, in Open VSX's review at first); namespace `ChanMeng` verified ([EclipseFdn/open-vsx.org#14189](https://github.com/EclipseFdn/open-vsx.org/issues/14189) closed as completed 2026-10-15) | `publish-openvsx.yml` by manual dispatch after the Marketplace upload, tokenless through its registered trusted publisher (`editors/vscode/DEVELOPMENT.md`) |
| Hosted MCP (`https://mcp.archlang.uk`) | live: Worker `archlang-mcp`, deployed on every `main` push by `deploy.yml`'s `deploy-mcp`; custom domain attached in the dashboard (the workers.dev URL also answers); renders `compile` as an MCP App card in a claude.ai custom connector (no sign-in); the precise guard is the zone WAF rule `mcp abuse guard` (100 requests per 10 s per IP to every path on `mcp.archlang.uk`, block 10 s, dashboard-only), because the Worker's own bindings are best-effort (ADR 0026 addendum) | `deploy.yml` |
| `@chanmeng666/arch-plan` | on npm (0.1.0 published by the owner by hand, the first version a trusted publisher can be registered on); jsDelivr serves `dist/arch-plan.js` | `release.yml`'s `publish-arch-plan` job (OIDC trusted publisher registered 2026-10-15) |
| [Cursor Marketplace](https://cursor.com/marketplace/publish) | publisher application submitted by the owner under the owner's own Cursor account (organization ArchLang, handle @archlang, logotype `plugins/archlang/.claude-plugin/icon.png` at the v1.43.0 tag, the subfolder note, repository and website); awaiting Cursor's manual review | `plugins/archlang/.cursor-plugin/plugin.json` + `rules/`, generated by `gen:agent-manifests` |

| [GitHub MCP Registry](https://github.com/mcp) (feeds the VS Code MCP gallery and Copilot) | requested 2026-11-06 in the maintainers' intake thread, one discussion per server: [github/github-mcp-server#3711](https://github.com/github/github-mcp-server/discussions/3711); not yet listed | the official registry entry; the hosted `remotes` reach it at the next release |
| Gemini CLI extensions gallery | `gemini-extension.json` at the repo root (#531, generated by `gen:agent-manifests`) and the `gemini-cli-extension` topic (swapped for `zero-dependency` on 2026-11-06); the gallery crawls tagged repositories daily, listing unverified | `gen:agent-manifests`; the version in the manifest follows each release |
| Cline MCP marketplace | deferred by the owner on 2026-11-07: its issue form requires a hands-on test with Cline (a model key, one setup run) and covers one client; the filled text and a 400×400 logo are kept in the session archive should it be wanted later | `llms-install.md` at the repo root (#531) |
| Docker MCP Catalog | submitted: [docker/mcp-registry#6704](https://github.com/docker/mcp-registry/pull/6704), opened 2026-11-06 from the owner's fork after `task validate` and `task build` both passed locally (11 tools found, image `mcp/archlang`); awaiting Docker's review | `packages/mcp/Dockerfile` (#531); the entry pins an archlang commit, so a later release means a follow-up PR there |
| [ClawHub](https://clawhub.ai/chanmeng666/skills/archlang) (OpenClaw skill registry) | live: `archlang` 1.57.0 published 2026-11-07 from the owner's account (`clawhub skill publish skills/archlang`), scan clean; the `VoltAgent/awesome-openclaw-skills` entry was filed on 2026-11-07 at the owner's word as [#610](https://github.com/VoltAgent/awesome-openclaw-skills/pull/610), with the skills.sh and repository links as evidence of use and an offer to withdraw, because that list says it declines brand-new skills | `skills/archlang/`; republish with `clawhub skill publish skills/archlang --version <core>` at a release |
| dev.to (two articles) | published 2026-11-07 by an agent at the owner's instruction in chat (an owner-directed exception to the "owner posts" rule; recorded in the growth repository's `data/social-posts.json`): "Floor plans that compile" and "Reproducible is not correct", every quoted output re-run on 1.57.0 | the growth repository's `marketing/content/posts/` drafts |
| YouTube (the narrated demo) | the 4:46 narrated demo `youtu.be/HVRRvgif8cQ` (1.36.0-era) was made public on 2026-11-07 at the owner's word, with a last description line linking archlang.uk and the playground; a current film would supersede it | the owner's channel |
| Install deep links (`/mcp`, README) | the Cursor stdio link was verified on 2026-11-06 (it wrote the `archlang` entry into `~/.cursor/mcp.json`); the VS Code links decode to the documented configs but are unverified in VS Code, which this machine does not have | `docs-site/mcp.md`, `README.md` |
| Brave Search (feeds Claude web search, Le Chat and Leo) | nine URLs submitted through `search.brave.com/submit-url` on 2026-11-06 (home, `/mcp`, the five topic pages, `/3d`, the playground and its `/examples/`), each confirmed; Brave already returned archlang.uk pages for a `site:` query | no channel beyond the form; re-submit new pages by hand |

**There is no separate Claude connectors directory**: claude.ai takes a custom connector URL per user
(`https://mcp.archlang.uk/mcp`); the Claude plugin directory above is the only claude.ai listing.

**Hosted MCP traffic.** The growth repository's weekly metrics job reads the Analytics Engine
dataset through the SQL API (an Account Analytics Read token held as secrets there). It counts
`tools/call` only, so `tools/list` traffic and WAF-blocked requests never appear, and the first
~1,500 requests on 2026-10-14 were the owner's own burst tests: discount them in any reading.

**Two lists forbid AI-authored submissions** — `travisvn/awesome-claude-skills` and
`hesreallyhim/awesome-claude-code`. An agent never opens a pull request or issue there; only the
owner can, by hand.

**Wikidata is on HOLD.** Items were drafted for both projects and deliberately not submitted:
notability needs an independent source, and an item created without one is deleted rather than
ignored. Hold until somebody unconnected has written about the project.

## 9. Measurement: the frozen prompt panel

The growth repository holds 25 prompts across five bands in `marketing/offsite/geo-prompt-panel.md`,
run monthly against the answer engines with results appended to `data/geo-citations.csv`. **The
prompt text is frozen** — changing one makes months non-comparable, exactly as changing
`JUDGE_VERSION` does in `eval/`. Append rows; never edit one. Baseline of 2026-09-14, taken before
any of this work had been crawled:

| Engine | Prompts | Mentions | Citations |
|---|---|---|---|
| Perplexity | 25 | 8 | 6 |
| Google AI Mode | 15 | 11 | 7 |

The split by band matters more than either total, and it splits at our own name: **5 of 5**
direct-name prompts produced a mention, **1 of 5** category prompts did, and **0 of 10** across the
buyer-word and competitor bands. An engine told what to look for finds it; nothing yet surfaces the
project to somebody who does not already know it exists. That is the number to move.

## 10. When a guard goes red

- **`test/docs-page-meta.test.ts`** — a route without a `PAGE_META` row means a new page would ship
  the site description; write the row. An orphaned row means a page was renamed; delete it. A
  length or sentence failure means the description was written as a keyword list. A killed claim
  means the copy is off the approved boilerplate. **Never widen a regex to green the suite.**
- **`test/playground-examples-rows.test.ts`** — a missing row means a new `examples/*.arch` is
  invisible in the playground and absent from the sitemap (this happened to `garden-house`); add
  the row, or add the file to `EXCLUDED_EXAMPLES` with a reason. A parse failure means the tuple
  table stopped being literal; keep it literal, because `gen-static.mjs` parses it too.
- **`test/indexnow-script.test.ts`** — a non-zero exit means the ping can now fail a deploy. Fix the
  script, not the test.
- **`@prod` head cases (docs), `boot.spec.ts` / `examples-static.spec.ts` (playground)** — red here
  means production is broken or stale, not that a pull request is bad. Check the deploy first.
- **`scripts/smoke.mjs`** — it retries a network error or non-200 six times; a 200 whose body fails
  an assertion is never retried, because waiting cannot fix wrong bytes.

## 11. What is deliberately not done

- **No FAQPage or HowTo structured data.** Both rich results were retired by Google in May 2026;
  the markup would be work with no surface left to earn. (PR #452 briefly emitted FAQPage on the
  topic pages; removed 2026-11-03. Their visible FAQ sections stay.)
- **No Cloudflare log analysis.** The free plan exposes no per-user-agent request dimension
  (Logpush is an Enterprise feature), so a script to "read the crawler logs" would be a script that
  cannot answer the question.
- **No `keywords` meta anywhere**, per §1.
- **Hash permalinks are not indexable and never will be.** A `#z=` fragment never reaches the
  server, so all the shared plan links collapse onto one URL. The static example pages exist
  precisely to give each plan an address a crawler can fetch.
