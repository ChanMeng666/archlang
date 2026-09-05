# 19. Both public sites on Cloudflare Workers static assets, deployed from CI

- **Status:** Accepted
- **Date:** 2026-09
- **Scope:** site hosting only. No core, language, or public-API change; no public URL change.

## Context

From 2026-07-15 the two public sites were **Vercel** deployments reached through the
`archlang.uk` zone on **Cloudflare DNS** — three grey-cloud ("DNS only") CNAMEs to
`*.vercel-dns-016.com`, with Vercel owning TLS and the `www` → apex redirect. That split
the operational surface across two vendors for no benefit: the zone, the second domain
(`archcanvas.uk`), and the account that manages both were already Cloudflare's.

Nothing about the Vercel deployment was broken. The move is a consolidation, and the
constraint that shaped every decision below is that **the public URLs must not change** —
`https://archlang.uk` and `https://playground.archlang.uk` are written into JSON Schema
`$id`s, the VitePress `sitemap.hostname`, README permalinks, `SKILL.md`, and the MCP
shim's baked context. A host move is cheap; a URL move is a repo-wide regeneration with
its own documented traps (`docs/hosting-and-domains.md`).

Both sites are wholly static: VitePress emits HTML, the playground is a Vite bundle whose
entire state lives in a `#z=` hash that never reaches the server. Neither has ever needed
a server-side request handler, and neither should acquire one by accident.

## Decision

**Serve both sites as Cloudflare Workers with static assets, with no `main` script, and
deploy them from GitHub Actions.**

- `docs-site/wrangler.jsonc` → Worker `archlang-docs`, assets from `.vitepress/dist`,
  custom domain `archlang.uk`.
- `playground/wrangler.jsonc` → Worker `archlang-playground`, assets from `dist`, custom
  domain `playground.archlang.uk`.
- `workers_dev: false` on both.
- `.github/workflows/deploy.yml` ("Deploy (Cloudflare)") keeps its push-to-`main` trigger
  and its two-site matrix: build the core, build the site, `wrangler deploy`, then the
  unchanged `scripts/smoke.mjs` check against the live origin.

### Why Workers static assets, and not Cloudflare Pages

Pages is the product whose name suggests it. It was rejected on three counts.

- **Workers is where Cloudflare is investing**; Pages is in maintenance for new projects,
  and its Functions model is a second, divergent way to write the same code we do not
  write anyway.
- **`wrangler.jsonc` is repository state.** A Pages project's build command, output
  directory, and redirect behaviour live in the dashboard. This repository's standing
  preference is that configuration which affects a deploy is committed and reviewable —
  the same reason `deploy.yml` pins its `wrangler` version.
- **The static-asset path is identical either way**, so Pages offered nothing to weigh
  against those two.

### Why there is no `main` script

With no script to invoke, **every request is a static-asset request**: free, unmetered,
and exempt from the Workers free plan's 100,000-requests/day cap. Adding a `main` — even
a trivial pass-through — opts both public sites into that cap in exchange for nothing.
This is a standing constraint, not an implementation detail: a future feature that wants
a request handler must justify the cap it buys.

### Why deploys stay in GitHub Actions, not Cloudflare's Git integration

Two reasons, both about what the deploy is actually made of.

- **The build is a monorepo build.** `npm run docs:build` and `npm run playground:build`
  build the **core first** and then the site — `docs-site/sync-docs.mjs` hard-exits when
  `dist/` is missing, deliberately, so a site can never deploy with a broken example
  gallery. Cloudflare's Git integration would need that expressed as a dashboard build
  command, moving a load-bearing ordering constraint out of the repository.
- **The smoke check belongs welded to the deploy that produced it.** `scripts/smoke.mjs`
  runs as the step immediately after `wrangler deploy`, against the live origin, in the
  same job. A dashboard-driven deploy has no step to weld it to.

A third, found rather than predicted: `docs-site/.vitepress/config.ts` sets
`lastUpdated: true`, which reads each page's **git commit time at build time**. The
workflow's `actions/checkout` therefore needs `fetch-depth: 0`. A depth-1 clone produces
no error — every "Last updated" stamp silently collapses to the deploy commit. That is a
CI-visible knob we control; on a hosted build integration it would be one more dashboard
setting able to corrupt content quietly.

### Why the `www` redirect is zone state, not an in-repo `_redirects`

`www.archlang.uk` → `301` → `archlang.uk` is a Cloudflare **Single Redirect Rule** in the
`http_request_dynamic_redirect` phase, configured on the zone.

It is not in a `_redirects` file because **Cloudflare's `_redirects` matches on path
only** and cannot express a scheme+host source. There is no way to say "requests whose
Host is `www.archlang.uk`" in that format; a path-only rule attached to the docs Worker
would fire for apex requests too and redirect the site to itself.

The rule's target is an **expression**, `concat("https://archlang.uk",
http.request.uri.path)`, with `preserve_query_string: true` — not a static value, which
would flatten every `www` deep link onto the home page. The exact API shape is recorded in
`docs/hosting-and-domains.md` so it can be recreated without guessing, since this is the
one piece of the setup that lives outside the repository.

### Why the two sites' asset routing differs

They differ on **both** knobs, and neither difference is an inconsistency to tidy up. One
site has a page per route; the other has two pages and a fragment.

- **Docs: `html_handling: "drop-trailing-slash"`, `not_found_handling: "404-page"`.** The
  first is the equivalent of Vercel's `cleanUrls: true` + `trailingSlash: false` —
  VitePress emits `guide.html` and links to `/guide`, so `/guide` must serve that file and
  `/guide/` must redirect to the extensionless form. The second is required by this
  repository's own checks: VitePress emits its own `404.html`, and both
  `docs-site/e2e/routes.spec.ts` and `scripts/smoke.mjs` treat a `text/html` 404 as a
  **negative signal** — an unmatched path must 404, not answer 200 with the shell.
- **Playground: `html_handling: "none"`, `not_found_handling: "none"`, plus one
  `_redirects` line.** `"none"` is an exact-path lookup, chosen for one measured reason:
  it keeps **`/embed.html` a literal 200**. Every other mode drops the `.html` and 307s to
  `/embed`, and `/embed.html` is a *published* URL pasted into third-party `<iframe>`
  snippets — a redirect would cost every embed on the internet a round trip and gain
  nothing. Vercel served it literally; this keeps that.

  The cost of `"none"` is that `/` is not a file and would fall through to
  `not_found_handling`. `playground/public/_redirects` answers it with
  `/  /index.html  200` — a **status-200 rule is a rewrite, not a redirect**, and the
  redirect layer runs *before* the asset lookup, so the root serves `index.html` with no
  redirect and no 404. (This is the one thing Cloudflare's `_redirects` *can* express that
  we need: a path-only rewrite. It still cannot express the host-matched `www` redirect
  above, which is why that one is zone state.)

  `not_found_handling: "none"` is explicit because the absence is the decision. There is
  no `404.html` here, and this is **not** a single-page application — `index.html` and
  `embed.html` are two real entries and all state is in the `#z=` hash, which never
  reaches the server. `"single-page-application"` would answer every mistyped path with a
  200 and the editor shell, turning a 404 into a false success.

## Consequences

- **The proxy iron law inverts.** The records are now **proxied (orange cloud)**, because
  a Workers custom domain necessarily is one. The old rule — "never proxy, it breaks
  Vercel's TLS" — was correct for its origin and is now superseded. It is recorded as an
  inversion in `docs/hosting-and-domains.md` rather than deleted, because a reader who
  meets the old advice in an archived doc needs to know why it existed.
- **A proxied zone can silently change what a machine reads**, where the grey cloud never
  touched a byte. Four zone features must therefore stay **off**: Bot Fight Mode and
  Browser Integrity Check (which would challenge `scripts/smoke.mjs`, a bare zero-dep
  `fetch`), Email Obfuscation (which rewrites HTML and would break the nightly raw-`.md`
  byte-equality staleness probe forever), and Rocket Loader (which defers and rewrites
  scripts, under which the client-compiling `@prod` Playwright cases would flake). This
  is a new standing hazard the Vercel arrangement did not have.
- **`archlang-docs.vercel.app` and `archlang-playground.vercel.app` are gone,
  permanently.** They used to `301` to the custom domains, and this repository's docs
  promised they were kept "so no external link ever breaks". **That promise is
  withdrawn**: those hostnames belong to Vercel and die with the projects. One known
  casualty is immutable — the MCP registry's first-published entry for
  `io.github.ChanMeng666/archlang-mcp` (`0.1.1`, 2026-07-10) carries
  `archlang-docs.vercel.app` as its website URL. It was already stale before this move
  (every later version points at `archlang.uk`), and registry history cannot be edited.
  Accepted: no `archlang.uk` link breaks, and the loss is confined to a hostname that had
  been redirect-only since 2026-07-15.
- **Three headers Vercel sent implicitly, Cloudflare sends not at all — and one of them is
  invisible to every check in this repository.** `Access-Control-Allow-Origin: *`,
  `Content-Disposition: inline` and `Strict-Transport-Security: max-age=63072000` are now
  declared explicitly under `/*` on both sites. The CORS one is the finding: the JSON
  Schemas are fetched by browser-context validators at their canonical `$id` URLs and
  `llms.txt` advertises the whole root as machine-fetchable, but **`scripts/smoke.mjs` is a
  Node `fetch` and Playwright's `request` fixture are both exempt from CORS**, so losing
  the header would have read as a healthy 200 to every gate while being broken for every
  browser consumer. It is documented as a standing gap in
  `docs/hosting-and-domains.md` rather than closed, because closing it means asserting a
  response header from a real browser origin — a test tier this repository does not have.
  (`includeSubDomains` is deliberately absent from the HSTS value, matching what Vercel
  sent: adding it would newly bind every subdomain of `archlang.uk`.)
- **The rest of `_headers` is a measured correction too, not a preference.**
  Cloudflare types `.md` as `text/markdown` with **no charset** (Vercel sent one — without
  it a `text/*` response is latin-1 in some clients, mojibaking every em-dash in the raw
  markdown copies), and sends **no `Content-Type` at all** for `.gbnf` (Vercel sent
  `application/octet-stream`; both deliver a machine-readable route as an opaque
  download). Both are corrected. Fingerprinted `/assets/*` also regained
  `max-age=31536000, immutable`, which Cloudflare does not assume; everything else keeps
  the revalidating default so a deploy is visible immediately.
- **No certificate work was needed.** Universal SSL on the active zone already covered the
  apex and every first-level subdomain, so `archlang.uk`, `www` and `playground` were
  inside the existing cert the moment the records flipped.
- **The whole cutover was verifiable before it was visible.** Both Workers were deployed
  to `*.workers.dev` staging origins and driven through the repository's own production
  checks with the live sites untouched: 42/42 docs smoke checks, 3/3 playground, 46/46
  docs `@prod` Playwright cases (including the byte-equality staleness probes) and 9/9
  playground. **Staging first, then DNS** is the order to keep — every production check
  here takes an origin as an argument, which is what makes that possible.
- **Nothing in the core, the language, or any published artifact changed**, and no URL
  moved, so the schema `$id`s, the sitemap, the README permalinks and the MCP shim's baked
  context are all untouched.

## Deferred, by name

- **A `main` script for anything.** Redirects, headers and routing are all expressible in
  `wrangler.jsonc` + `_headers` today. The moment one is not, the cap above is the price.
- **Moving the `www` redirect into the repository.** It cannot be a `_redirects` entry
  (path-only matching). It *could* become a Terraform/API-scripted zone config; that is a
  bigger commitment to infrastructure-as-code than one redirect justifies.
- **Preview deploys per branch.** Vercel gave one per push; nothing replaces it here. A
  branch push now deploys nothing, and site changes are verified locally with
  `npm run e2e:docs` / `npm run e2e:playground` against the built output.
- **`archcanvas.uk`.** In the same account and unaffected by this ADR.

## Alternatives considered

**Stay on Vercel.** Rejected as consolidation, not as a fix: the Vercel deployment worked.
The split cost was two dashboards, two vendors' failure modes, and a DNS arrangement whose
only rule was "do not let Cloudflare touch this".

**Cloudflare Pages.** Rejected — see above: maintenance-mode for new projects, and it puts
the build command and output directory in a dashboard where this repository wants them in
a reviewed file.

**A Worker script that serves the assets.** Rejected: it buys nothing the asset layer does
not already do (`html_handling` covers clean URLs and trailing slashes, `_headers` covers
content types and caching), and it converts every request into a metered Worker
invocation.

**GitHub Pages.** Rejected: no per-host redirect rules, no `_headers` equivalent for the
content-type corrections the machine-readable routes need, and the apex/subdomain split
across two sites does not fit one Pages site per repository.
