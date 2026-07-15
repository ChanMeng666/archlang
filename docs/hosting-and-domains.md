# Hosting & custom domains

How the two public sites are hosted and reached. This is the operational source of truth for the
`archlang.uk` custom domain; treat the live Vercel/Cloudflare dashboards as authoritative for the
exact record values, and this doc as the map of *what points where and why*.

Sibling playbook: releases → [`npm-oidc-publishing-playbook.md`](npm-oidc-publishing-playbook.md).

## What is live

| Public URL | Serves | Vercel project | npm workspace name |
|------------|--------|----------------|--------------------|
| `https://archlang.uk` | Docs site (VitePress) | `archlang-docs` | `archlang-docs` |
| `https://playground.archlang.uk` | Playground (Vite) | `archlang-playground` | `archlang-playground` |

DNS for the `archlang.uk` zone is managed on **Cloudflare**. Both sites deploy to **Vercel**.
Migrated from `*.vercel.app` on **2026-07-15**; the old hosts are kept and permanently redirect (see
below), so no external link ever breaks.

## Iron law: public URL ≠ Vercel project name ≠ workspace name

The strings `archlang-docs` and `archlang-playground` are **Vercel project identifiers and npm
workspace `name`s** — they are *not* the public URLs and did **not** change in the migration. A grep
for `archlang-docs` / `archlang-playground` still legitimately hits `package.json` `name` fields,
`package-lock.json`, and `deploy.yml` comments. **Never rename the Vercel projects or the workspace
packages** to match the domain — the custom domain is attached *on top of* the project and is fully
decoupled from its name. Only the public-facing `*.vercel.app` **URLs** were migrated.

## DNS (Cloudflare zone `archlang.uk`)

Three records, **all "DNS only" (grey cloud) — never proxied (orange cloud)**:

| Type | Name | Target (as provisioned) | Proxy |
|------|------|-------------------------|-------|
| CNAME | `@` (apex) | `c15a829996ae9827.vercel-dns-016.com` | DNS only |
| CNAME | `www` | `c15a829996ae9827.vercel-dns-016.com` | DNS only |
| CNAME | `playground` | `06b9173492f3ec33.vercel-dns-016.com` | DNS only |

Notes:
- **Proxying (orange cloud) breaks this.** Vercel provisions and renews its own Let's Encrypt certs
  and forces HTTPS; Cloudflare's proxy in front of it causes `ERR_TOO_MANY_REDIRECTS` / cert issuance
  failures unless carefully tuned. Keep every record DNS-only and let Vercel own TLS. Ignore
  Cloudflare's banner nudging you to enable the proxy.
- **The apex is a CNAME, not an A record.** Vercel's current guidance issues a **per-project unique**
  CNAME target (the `*.vercel-dns-016.com` scheme, part of Vercel's IP-range expansion) instead of the
  older generic `A → 76.76.21.21` / `CNAME → cname.vercel-dns.com`. Cloudflare's **CNAME flattening**
  serves the apex as a CNAME transparently. The old generic values still work if ever needed, but
  prefer whatever Vercel's Domains screen shows for each project — the docs and playground targets are
  **different** and cannot be shared.

## TLS

Cloudflare **SSL/TLS → Overview** mode is **Full (strict)** — the origin is Vercel, which serves a
valid cert, so strict validation is safe and correct. Do not drop to plain "Full" (unvalidated origin)
or "Flexible" (which would redirect-loop against Vercel's forced HTTPS).

## Redirects (all 301 permanent)

Configured in Vercel's per-project **Settings → Domains**:

- `www.archlang.uk` → `301` → `archlang.uk`
- `archlang-docs.vercel.app` → `301` → `archlang.uk` (kept, not removed)
- `archlang-playground.vercel.app` → `301` → `playground.archlang.uk` (kept, not removed)

The apex `archlang.uk` and `playground.archlang.uk` are each project's production/primary host. The
`*.vercel.app` domains are intentionally **kept** so old links and any hard-coded references keep
resolving — they just 301 onward.

## Deploy pipeline

Push to `main` triggers **`.github/workflows/deploy.yml`** (the "Deploy (Vercel)" workflow), which for
each project runs `vercel pull` → `vercel build --prod` (the project's `vercel.json` builds the core
first, then the site) → `vercel deploy --prebuilt --prod`, then a smoke check. Merging a PR to `main`
is what ships new site content to the custom domains. A branch push only produces a Vercel preview.

## Changing a public URL in code (do this carefully)

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
URL-only) + `npm run docs:build` (site + sitemap). Then confirm the live hosts over HTTPS and that the
old hosts still 301 onward.

## SEO

The docs site emits `sitemap.xml` with `hostname: https://archlang.uk` (VitePress `sitemap` config in
`docs-site/.vitepress/config.ts`). The JSON Schemas are served at their canonical `$id` URLs
(`https://archlang.uk/plan.schema.json`, `https://archlang.uk/intent.schema.json`).
