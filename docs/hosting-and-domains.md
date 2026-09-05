# Hosting & custom domains

How the two public sites are hosted and reached. This is the operational source of truth for the
`archlang.uk` custom domain; treat the live Cloudflare dashboard as authoritative for the exact
record values and zone settings, and this doc as the map of *what points where and why*.

Sibling playbook: releases → [`npm-oidc-publishing-playbook.md`](npm-oidc-publishing-playbook.md).

## What is live

| Public URL | Serves | Cloudflare Worker | npm workspace name |
|------------|--------|-------------------|--------------------|
| `https://archlang.uk` | Docs site (VitePress) | `archlang-docs` | `archlang-docs` |
| `https://playground.archlang.uk` | Playground (Vite) | `archlang-playground` | `archlang-playground` |

DNS for the `archlang.uk` zone is managed on **Cloudflare**, and since **2026-09** both sites are
also *served* by Cloudflare — as **Workers with static assets**, in the same account that already
held the zone. Before that they were Vercel deployments behind grey-cloud CNAMEs.

**The public URLs did not change in that migration.** `archlang.uk` and `playground.archlang.uk`
are exactly what they were. Nothing downstream of a URL moved: no JSON Schema `$id`, no
`sitemap.hostname`, no README `#z=` permalink, no hard-coded origin. It was a host move, not a URL
move — which is why the "Changing a public URL in code" section below did **not** apply to it.

### Neither site runs any code

Each `wrangler.jsonc` deliberately has **no `main`**. With no script to invoke, every request is a
static-asset request: Cloudflare bills those at zero, they are unmetered, and they do not count
against the Workers free plan's 100,000-requests/day cap. Adding a `main` script — even a trivial
one — would opt both sites into that cap. Don't, unless the feature is worth it and the change is
deliberate.

Sizes, measured at the migration: docs-site builds to 235 files / 14 MB (largest single file,
`examples.html`, at 2.25 MiB); the playground to 70 files / 2.7 MB. Cloudflare's free-tier ceilings
are **20,000 assets per version** and **25 MiB per file** — both sites sit far inside them, but the
docs site's `examples.html` is the file to watch if the example gallery keeps growing.

## Iron law: public URL ≠ Worker name ≠ workspace name

The strings `archlang-docs` and `archlang-playground` are **Cloudflare Worker names and npm
workspace `name`s** — they are *not* the public URLs, and they did not change when the hosting did.
A grep for them still legitimately hits `package.json` `name` fields, `package-lock.json`,
`wrangler.jsonc`, and `deploy.yml`. **Never rename the Workers or the workspace packages** to match
the domain: the custom domain is attached *on top of* the Worker and is fully decoupled from its
name. The Worker names were kept identical to the old project names on purpose, so that this law
reads the same before and after the migration.

## Iron law, INVERTED: the records are now proxied (orange cloud)

**This reverses the previous rule, and the reversal is the point.**

- **Old rule (Vercel, 2026-07-15 → 2026-09):** every record had to be **"DNS only" (grey cloud),
  never proxied**. Vercel provisioned and renewed its own certificates and forced HTTPS at its
  edge; putting Cloudflare's proxy in front of that origin caused `ERR_TOO_MANY_REDIRECTS` and cert
  issuance failures. Cloudflare's dashboard banner nudging you to enable the proxy was to be
  ignored.
- **New rule (Cloudflare Workers):** the records are **necessarily proxied (orange cloud)**. A
  Workers custom domain *is* a proxied record — Cloudflare is now both the DNS and the origin, and
  there is no third-party edge to conflict with. You cannot grey-cloud a Workers custom domain; the
  attachment creates and owns the record.

If you find the old advice quoted anywhere else, it is superseded. It is recorded here rather than
deleted because "never proxy these records" was stated as an iron law for two months, and a reader
who meets it in an archived doc needs to know why it existed and why it stopped applying.

## DNS (Cloudflare zone `archlang.uk`)

Zone `6cd6c3391fe8a7ec9f28ca24182e6ce4`, in the account `chanmeng.dev@gmail.com`
(`c87dca24333f7ed5d643f731f6308fec`) — the same account the Workers live in, which is what makes
the custom-domain attachment a one-step operation.

| Name | Record | Managed by | Proxy |
|------|--------|------------|-------|
| `@` (apex) | Workers custom domain → `archlang-docs` | Cloudflare (created by the attachment) | Proxied |
| `playground` | Workers custom domain → `archlang-playground` | Cloudflare (created by the attachment) | Proxied |
| `www` | CNAME → apex, redirected by a zone rule (below) | hand-maintained | Proxied |

The three grey-cloud CNAMEs to `*.vercel-dns-016.com` (apex, `www`, `playground`) that this
replaced are gone. **Do not create a record for the apex or `playground` by hand** — attaching the
custom domain in `wrangler.jsonc` (`routes: [{ pattern: …, custom_domain: true }]`) provisions it,
and a hand-made record fights the attachment.

## TLS

**Universal SSL on the active zone already covers the apex and every first-level subdomain**, which
is why the cutover needed no certificate issuance at all — `archlang.uk`, `www.archlang.uk` and
`playground.archlang.uk` were all inside the existing cert the moment the records flipped. There is
no origin certificate to manage: Cloudflare *is* the origin.

The SSL/TLS mode setting no longer describes a hop to a third party. Do not go looking for the old
**Full (strict)** requirement — it was about validating Vercel's certificate, and there is no
longer a Vercel to validate.

## Redirects

`www.archlang.uk` → `301` → `archlang.uk`, preserving path and query.

This is **zone state, not repository state**: a Cloudflare **Single Redirect Rule** in the
`http_request_dynamic_redirect` phase. It lives in the dashboard (Rules → Redirect Rules), not in
any file here, because Cloudflare's `_redirects` file format matches on **path only** and cannot
express a scheme+host source. Its exact API shape, so it can be recreated without guessing:

```http
POST /zones/6cd6c3391fe8a7ec9f28ca24182e6ce4/rulesets
```

```jsonc
{
  "phase": "http_request_dynamic_redirect",
  "kind": "zone",
  "rules": [
    {
      "expression": "http.request.host eq \"www.archlang.uk\"",
      "action": "redirect",
      "action_parameters": {
        "from_value": {
          "target_url": {
            "expression": "concat(\"https://archlang.uk\", http.request.uri.path)"
          },
          "status_code": 301,
          "preserve_query_string": true
        }
      }
    }
  ]
}
```

The target is an **`expression`, not a static `value`** — that is what preserves the path. A static
`value` would flatten every `www` deep link onto the home page, which is the failure mode this
shape exists to avoid.

### What was lost, permanently

`archlang-docs.vercel.app` and `archlang-playground.vercel.app` are **gone**. They used to `301` to
the custom domains, and older revisions of this doc promised they were "kept, not removed" so that
"no external link ever breaks". That promise no longer holds and cannot be restored: those
hostnames belong to Vercel and die with the projects.

One known consumer: the MCP registry's first-published entry for
`io.github.ChanMeng666/archlang-mcp` (version `0.1.1`, 2026-07-10) still carries
`archlang-docs.vercel.app` as its website URL. That entry was already stale before this migration —
every later version points at `archlang.uk` — and it is immutable registry history, so it stays
broken.

## Cloudflare zone settings that must stay OFF

Both sites are now **proxied**, so Cloudflare sits in the request path and *can* rewrite bytes and
challenge clients — where under the grey cloud it never touched a response at all. Four zone
features would break this repository's own verification if enabled:

| Setting | Why it must stay off |
|---------|----------------------|
| **Bot Fight Mode** | `scripts/smoke.mjs` is a bare zero-dependency `fetch` with no browser headers. A challenge turns every deploy and every nightly `prod-smoke` red. |
| **Email Obfuscation** | Rewrites HTML in flight. The nightly `e2e-prod` docs cases compare production's raw `/<page>.md` bytes against this checkout — any transformation makes that byte-equality probe fail forever. |
| **Rocket Loader** | Defers and rewrites `<script>` tags. The playground and the docs site's `<ArchLive>` widgets are client-compiled; the `@prod` Playwright cases would flake or fail. |
| **Browser Integrity Check** | Same class of failure as Bot Fight Mode, for the same client. |

The rule to carry: **a proxied zone can silently change what a machine reads.** Before enabling any
Cloudflare feature that transforms responses or interposes a challenge, check it against
`scripts/smoke.mjs` and the `@prod` Playwright subset — those are the two things that read this
site as a machine rather than as a browser.

## Deploy pipeline

Push to `main` triggers **`.github/workflows/deploy.yml`** (the "Deploy (Cloudflare)" workflow),
which runs a two-site matrix: `npm ci` → `npm run docs:build` / `npm run playground:build` (each
builds the **core first**, then the site) → `wrangler deploy` from the site's directory → the
unchanged `scripts/smoke.mjs` check against the live origin. Merging a PR to `main` is what ships
new site content. A branch push deploys nothing.

Three things about it that are load-bearing:

- **`actions/checkout` uses `fetch-depth: 0`.** `docs-site/.vitepress/config.ts` sets
  `lastUpdated: true`, which reads each page's git commit time **at build time**. A depth-1 clone
  has no history, so every "Last updated" stamp would silently collapse to the deploy commit — a
  wrong answer with no error.
- **Deploys run from CI, not from Cloudflare's Git integration.** The build is a monorepo build
  (the core must be built before either site; `docs-site/sync-docs.mjs` hard-exits without
  `dist/`), and the smoke check belongs welded to the deploy that produced it. See
  [ADR 0019](adr/0019-cloudflare-workers-hosting.md).
- **`wrangler` is version-pinned** (`4.108.0`) in a token-bearing job. Bump it deliberately.

Two repository secrets are required: `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Workers
Routes:Edit on the account, DNS:Edit + Zone:Read on the zone) and `CLOUDFLARE_ACCOUNT_ID`.

### `_headers` and `_redirects`, and why each rule exists

`docs-site/public/_headers`, `playground/public/_headers` and `playground/public/_redirects` are
parsed by the Worker's asset layer and are never served (a request for `/_headers` is a 404 —
verified). Each rule was written against a **measured** difference from what Vercel used to send,
not on principle.

**The block that matters most is the one no test can see.** Vercel set three headers implicitly on
every response; Cloudflare sets **none** of them. All three are now restored under `/*` on **both**
sites:

| Header | Value | Why |
|--------|-------|-----|
| `Access-Control-Allow-Origin` | `*` | The JSON Schemas are published under their canonical `$id` URLs (`https://archlang.uk/plan.schema.json` is what `src/plan-json.ts` writes into every Plan JSON document), and `llms.txt` advertises the whole root as machine-fetchable. Dropping CORS silently breaks any browser-context validator or agent. On the playground it matters too: `embed.html` is designed to be framed by other sites, and it is the target of every `#z=` permalink the README and docs emit. |
| `Content-Disposition` | `inline` | Without it a `text/markdown` response is offered as a **download** instead of shown, which defeats the append-`.md` convention entirely. |
| `Strict-Transport-Security` | `max-age=63072000` | Browsers hold Vercel's two-year max-age today; matching it keeps the header refreshing instead of silently expiring in 2028. `includeSubDomains` is deliberately **absent**, exactly as Vercel sent it — turning it on would newly bind every subdomain of `archlang.uk`. |

**NO TEST IN THIS REPOSITORY WOULD CATCH THE CORS LOSS.** `scripts/smoke.mjs` is a Node `fetch` and
Playwright's `request` fixture are both exempt from CORS enforcement, so a missing
`Access-Control-Allow-Origin` reads as a perfectly healthy 200 to every check this repo runs while
being broken for every browser-context consumer. That is a standing gap, not a solved problem: if
you ever change these files, verify CORS from an actual browser origin, because the green suite
will not tell you.

The rest of the rules:

- **`/assets/*` → `Cache-Control: public, max-age=31536000, immutable`** (both sites). Cloudflare's
  default is `public, max-age=0, must-revalidate`, which revalidates every fingerprinted bundle on
  every page load. Vite and VitePress hash everything under `/assets/`, so those URLs can never
  change identity. Every other route keeps the revalidating default, which is what makes a deploy
  visible immediately.
- **`/*.md` → `text/markdown; charset=utf-8`** (docs only). Cloudflare types `.md` as
  `text/markdown` with **no charset**; Vercel sent the charset. A `text/*` response without one is
  latin-1 by default in some clients, which mojibakes every em-dash in the raw markdown copies.
- **`/archlang.gbnf` → `text/plain; charset=utf-8`** (docs only). Cloudflare sends **no
  `Content-Type` at all** for that extension; Vercel sent `application/octet-stream`. Both deliver
  a machine-readable route as an opaque download.
- **`/  /index.html  200`** (playground only, in `_redirects`). Not a redirect: a **status-200 rule
  is a rewrite**, and the redirect layer runs before the asset lookup. It exists to give `/` a file
  under `html_handling: "none"` — see below.

### Asset routing (`html_handling`), and why the two sites differ

- **Docs:** `html_handling: "drop-trailing-slash"` + `not_found_handling: "404-page"`. This is the
  equivalent of Vercel's `cleanUrls: true` + `trailingSlash: false`: VitePress emits `guide.html`
  and links to `/guide`, so `/guide` must serve that file and `/guide/` must redirect to the
  extensionless form. VitePress emits its own `404.html`, and both `docs-site/e2e/routes.spec.ts`
  and `scripts/smoke.mjs` use a `text/html` 404 as a **negative** signal, so an unmatched path must
  404 rather than 200 with the shell.
- **Playground:** `html_handling: "none"` + `not_found_handling: "none"`, plus one line in
  `playground/public/_redirects`. `"none"` is an **exact-path lookup**, chosen for one measured
  reason: it keeps **`/embed.html` a literal 200**. Every other mode drops the `.html` and 307s to
  `/embed` — and `/embed.html` is a *published* URL, pasted into third-party `<iframe>` snippets, so
  a redirect would cost every embed on the internet a round trip and gain nothing. Vercel served it
  literally, and this keeps that.

  The cost of `"none"` is that `/` is not itself a file and would fall through to
  `not_found_handling`. `playground/public/_redirects` fixes that with `/  /index.html  200` — a
  **status-200 rule is a rewrite, not a redirect**, and the redirect layer runs *before* the asset
  lookup, so the site root serves `index.html` with no redirect and no 404.

  `not_found_handling: "none"` is explicit because the absence is the decision: there is no
  `404.html` here, and this is **not** a single-page application. `index.html` and `embed.html` are
  two real entries and all state lives in the `#z=` hash, which never reaches the server.
  `"single-page-application"` would answer every mistyped path with a 200 and the editor shell,
  turning a 404 into a false success.

Verified on a `*.workers.dev` staging origin **before** any DNS change: 42/42 docs smoke checks,
3/3 playground smoke checks, 46/46 docs `@prod` Playwright cases (including the byte-equality
staleness probes) and 9/9 playground `@prod` cases; `/guide` → 200 `text/html`, `/guide/` → 307 to
`/guide`, `/nope` → 404 with the VitePress page, `/_headers` → 404, hashed assets carrying
`cache-control: public, max-age=31536000, immutable`. **Staging first, then DNS** is the order to
keep — every one of those checks can be run against a `workers.dev` origin with the live site
untouched.

## Changing a public URL in code (do this carefully)

**This section did not apply to the 2026-09 hosting migration** — no public URL changed there — but
it is still the right playbook if one ever does, and it is kept verbatim for that reason.

If a public host ever changes again, the URL is hard-coded in ~30 source files plus generated
artifacts. Two traps caught us during the 2026-07-15 migration:

1. **Grep for the host prefix *without* dots.** Some references write the host as a regex with escaped
   dots (`archlang-playground\.vercel\.app`, e.g. in `test/readme-permalink.test.ts`). A literal-dot
   grep (`archlang-playground.vercel.app`) silently misses those. Search `archlang-playground` /
   `archlang-docs` (no dots) to catch both the literal and escaped forms.
2. **Edit sources, then regenerate — never hand-edit generated files.** The JSON Schema `$id`s live in
   `src/plan-json.ts` / `src/intent.ts` (→ `npm run gen:plan-schema` / `gen:intent-schema`); the
   agent-context URLs live in `SKILL.md` (→ `npm run gen:llms`). `check:drift` fails if you edit the
   generated `schemas/*.json` / `llms-full.txt` directly. The README `#z=` playground permalinks are
   **base-independent** (the compressed hash encodes only the example source), so only the host prefix
   changes — the hash stays valid.

**Verification after any URL change:** `npm run check` (full suite, incl. the schema-`$id`,
README-permalink, and llm-prompt tests) + `npm run check:drift` (generated-file diff should be
URL-only) + `npm run docs:build` (site + sitemap). Then confirm the live hosts over HTTPS.

## SEO

The docs site emits `sitemap.xml` with `hostname: https://archlang.uk` (VitePress `sitemap` config in
`docs-site/.vitepress/config.ts`). The JSON Schemas are served at their canonical `$id` URLs
(`https://archlang.uk/plan.schema.json`, `https://archlang.uk/intent.schema.json`). Both survived
the hosting migration untouched, because the hostname did not move.

`workers_dev: false` on both Workers is part of this: without it each site would also be reachable —
and indexable, since `robots.txt` says `Allow: /` — at a second `*.workers.dev` origin.
