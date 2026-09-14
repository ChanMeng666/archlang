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
nothing is painted by script. That is why the playground grew a visible intro band and 27 static
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
| Playground sitemap (29 URLs: `/`, `/examples/`, 27 pages) | `playground/scripts/gen-static.mjs` | `test/playground-examples-rows.test.ts`; `scripts/smoke.mjs` |
| Canonical, per-page `<title>` and description, `og:*` / `twitter:*` | `PAGE_META` + `transformPageData` + `transformHead` in `docs-site/.vitepress/config.ts` | `test/docs-page-meta.test.ts` (two-way route coverage, 80–170 chars, sentence shape, killed-claim regexes); `@prod` "head metadata" |
| JSON-LD (`WebSite` + `SoftwareApplication` + `SoftwareSourceCode` on `/`, `TechArticle` + `BreadcrumbList` elsewhere) | `structuredData()` in `docs-site/.vitepress/config.ts` | `@prod` "head metadata" parses it; descriptions come from `PAGE_META`, so the wording law is enforced in one place |
| The docs H1 keyword sub-line | `docs-site/.vitepress/theme/CompileSeam.vue` | **No gate of its own.** `npm run docs:build` compiles it; the `@prod` home case asserts the agents band, not this line. Treat it as hand-checked |
| Playground intro band, lede, `<noscript>`, JSON-LD | `playground/index.html` | `scripts/smoke.mjs` (`<h1`, the lede string); `playground/e2e/boot.spec.ts` `@prod` case, which navigates with `waitUntil: "commit"` so it reads pre-hydration bytes |
| `/embed.html` de-indexed | `playground/public/_headers` (`X-Robots-Tag: noindex, follow`) plus a `<meta name="robots">` in `playground/embed.html` | `scripts/smoke.mjs`'s `header()` assertion — the one check in that file that reads a response header rather than a body |
| 27 static example pages, `/examples/` index, the `#z=` deep link on each | `playground/scripts/gen-static.mjs`, driven by `EXAMPLE_ROWS` in `playground/src/examples.ts`; the `/examples/` rewrite in `playground/public/_redirects` | `test/playground-examples-rows.test.ts` (both directions against `examples/*.arch`, blurb length and killed claims); `playground/e2e/examples-static.spec.ts`; `scripts/smoke.mjs` |
| Raw `/<page>.md` copies and `rel=alternate` links to them | `docs-site/sync-docs.mjs` `PAGES`; `transformHead` | `test/docs-sync-list.test.ts`; the `@prod` byte-equality cases, which double as a deploy-staleness probe |
| `llms.txt` / `llms-full.txt` | repo root, copied by `sync-docs.mjs`; `llms-full.txt` from `npm run gen:llms` | `npm run check:drift`; `scripts/smoke.mjs`. See §5 |
| IndexNow key file and post-deploy ping | `docs-site/public/<key>.txt`, `playground/public/<key>.txt`, `scripts/indexnow.mjs`, a step per matrix leg in `deploy.yml` | `test/indexnow-script.test.ts` (sitemap parsing; the always-exit-0 promise, checked by spawning the script). The key is public by design and lives in a repository **variable**, not a secret — see `docs/hosting-and-domains.md` § IndexNow |

## 3. Crawler policy: allow everything

Both sites allow every crawler, **training crawlers included**, and name them one by one so the
policy is legible to an auditor rather than implied by a wildcard. The reason is the project's own
thesis: this language is written by models as much as by people, so a corpus containing ArchLang
source and its error catalogue is a distribution channel, not a leak. Everything published is MIT
and already on npm and GitHub.

- **Search and answer indexes** — `Googlebot`, `Bingbot`, `Applebot`, `Amazonbot`,
  `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`.
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
not be expanded in the hope that it becomes one.

## 6. Dashboards

Both consoles belong to the owner. **No account address, property id or verification token is
recorded here or anywhere else in this public repository** — ask the owner rather than re-verifying.

- **Google Search Console** holds two **Domain** properties, `archlang.uk` (verified 2026-09-14) and
  `archcanvas.uk` (2026-09-15), both by DNS TXT. A Domain property covers every subdomain, so
  `playground.archlang.uk` needs none of its own — which is why TXT beat the meta tag: no repository
  change, one property for both hosts. Decline the one-click Cloudflare verification Google offers;
  it grants write access to the whole DNS account, and the manual path proves the same thing.
- **Bing Webmaster Tools** holds the same two, imported from Search Console. **The import does not
  carry sitemaps** — observed on two separate imports, despite the card promising it — so submit them
  by hand afterwards, every time.
- **Three sitemaps**: `archlang.uk` 34 URLs, `playground.archlang.uk` 29, `archcanvas.uk` 18. Both
  engines report Success on all three and agree on every number; a disagreement means a deploy or a
  generator has drifted, not that a console is being odd.
- **The generative-AI impressions report** in Search Console is where AI-Overview visibility shows
  up, worldwide since 2026-08-31. Export it by hand, monthly, for three months before automating.
- **IndexNow** — mechanics (public key, repository variable, a script that always exits 0) in
  [`hosting-and-domains.md`](hosting-and-domains.md) § IndexNow. The first live pings both returned
  **HTTP 202**, for 34 URLs on the docs host and 29 on the playground. Bing's IndexNow panel stays
  empty until a ping arrives: the key is validated at ping time against the hosted file, never
  registered in advance through the dashboard.
- **Neither ArchLang site has analytics**, by design, so there is no referrer count from
  `chatgpt.com` or `perplexity.ai` here. State that gap rather than inventing a number.

## 7. Safe Browsing incident, 2026-09-14

Search Console reported a site-level **"Deceptive pages"** verdict against the `archlang.uk` apex:
one issue, **no sample URLs** (the field reads `N/A`), no first-detected date, manual actions clean,
and **no Chrome interstitial** at any point — a meaningful negative, because Google's own Safe
Browsing test page *was* blocked in the same profile. The transparency report gave the same verdict
for every path under the apex, the shape of a host-level classification rather than a page detection;
`www`, the playground host and `archcanvas.uk` carried nothing.

The audit found nothing to fix: across every published docs page, zero forms, zero inputs, zero
iframes, zero cross-origin scripts, no ads, no downloads, no login, and no `eval` / `atob` /
`new Function` / `document.write`. The DNS zone holds four records and both hosts are static Workers,
so no subdomain and no writable endpoint could have served a deceptive page, and the edge log shows
no traffic anomaly. The likeliest explanation is a classifier false positive on a two-month-old
domain. A review was requested on **2026-09-15** through both channels — Search Console's *Request
review* and the separate "report incorrect phishing warning" form; Google documents reviews as taking
several days.

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
do, so off-site work belongs to this surface even though no file here expresses it. **Nothing is
published to a third party by an agent.** Drafts live in the private growth repository under
`marketing/offsite/`, with the manual submission guide at `marketing/launches/runbook-2026-09.md`;
the owner posts. Opened 2026-09-14 from the owner's account, awaiting maintainers:

| List | Pull request |
|---|---|
| punkpeye/awesome-mcp-servers | [#14383](https://github.com/punkpeye/awesome-mcp-servers/pull/14383) |
| osama-ata/Awesome-AECO | [#13](https://github.com/osama-ata/Awesome-AECO/pull/13) |
| Daviidro/awesome-aec-mcp | [#1](https://github.com/Daviidro/awesome-aec-mcp/pull/1) |
| steven2358/awesome-generative-ai | [#1375](https://github.com/steven2358/awesome-generative-ai/pull/1375) |
| semlinker/awesome-typescript | [#192](https://github.com/semlinker/awesome-typescript/pull/192) |

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
  the markup would be work with no surface left to earn.
- **No Cloudflare log analysis.** The free plan exposes no per-user-agent request dimension
  (Logpush is an Enterprise feature), so a script to "read the crawler logs" would be a script that
  cannot answer the question.
- **No `keywords` meta anywhere**, per §1.
- **Hash permalinks are not indexable and never will be.** A `#z=` fragment never reaches the
  server, so all the shared plan links collapse onto one URL. The static example pages exist
  precisely to give each plan an address a crawler can fetch.
