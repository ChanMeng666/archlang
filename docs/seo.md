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
example pages: a Vite shell with five empty mount points and a `#z=` fragment (which never reaches
a server at all) is, to every engine, one contentless URL. The tactics with measured retrieval lift
are quotations, statistics, cited sources and answer-first prose; **keyword stuffing is the one
tactic measured to hurt**, which is why no page carries a `keywords` meta and why every description
is gated to read as a sentence.

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

Two things that are easy to get wrong. Cloudflare blocks the *Training* and *Agent* crawler
categories by default on zones created since 1 July 2025, and that block is a managed WAF rule **no
test in this repo can see** — the zone settings are part of this surface even though no file here
expresses them. And `/embed.html` is de-indexed by a header, never by a `Disallow`: a `Disallow`
stops the fetch, and a header nobody fetches de-indexes nothing.

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

## 6. Measurement

- **Google Search Console** — domain property `archlang.uk`, verified 2026-09-14 by DNS TXT. A
  domain property covers `playground.archlang.uk` automatically, which is why DNS was chosen over
  the meta-tag route: no repository change. The generative-AI impressions report has been worldwide
  since 2026-08-31; export it by hand, monthly, for three months before automating anything.
- **Bing Webmaster Tools** — **not yet set up.** It is where IndexNow submissions land and it feeds
  Copilot, so it is the next dashboard to add.
- **The prompt panel** — the growth repository holds 25 frozen prompts across five bands in
  `marketing/offsite/geo-prompt-panel.md`, run monthly against the answer engines, results appended
  to `data/geo-citations.csv`. **The panel text is frozen.** Changing a prompt makes months
  non-comparable, exactly as changing `JUDGE_VERSION` does in `eval/`.
- **Neither ArchLang site has analytics**, by design, so there is no referrer count from
  `chatgpt.com` or `perplexity.ai` here. State that gap rather than inventing a number.

## 7. When a guard goes red

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

## 8. What is deliberately not done

- **No FAQPage or HowTo structured data.** Both rich results were retired by Google in May 2026;
  the markup would be work with no surface left to earn.
- **No Cloudflare log analysis.** The free plan exposes no per-user-agent request dimension
  (Logpush is an Enterprise feature), so a script to "read the crawler logs" would be a script that
  cannot answer the question.
- **No `keywords` meta anywhere**, per §1.
- **Hash permalinks are not indexable and never will be.** A `#z=` fragment never reaches the
  server, so all the shared plan links collapse onto one URL. The static example pages exist
  precisely to give each plan an address a crawler can fetch.
