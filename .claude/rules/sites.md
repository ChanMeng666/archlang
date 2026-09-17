---
paths:
  - "docs-site/**"
  - "playground/**"
  - "brand/**"
---

# Working on the brand or either public site

Before touching the brand or either public site, read `brand/README.md` and
[ADR 0014](../../docs/adr/0014-one-light-world.md) first. Two things are settled there and cost a build
each when forgotten: the logo master is **byte-sacred** (every variant is a fill-swap, never a
re-trace), and **both sites are LIGHT — there is no dark mode and no dark surface on either.**

Then read `docs/agents/sites.md` (the design system, token lockstep, syntax palette) and the
`(Sites)` entries of `docs/agents/gotchas.md`. SEO/GEO surfaces: `docs/seo.md`. Hosting:
`docs/hosting-and-domains.md`.
