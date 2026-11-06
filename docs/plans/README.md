# Programmes

Multi-session plans. Each folder is self-contained: a `README.md` with the decisions and the order of
work, dated evidence, and (where the programme is running) a `handoff.md` that is the resume point.
A plan small enough for one page is a single file here.
Closed programme research (audits, studies, spikes) lives in the private sibling repository `archlang-lab`.

| Folder | What | Status (2026-11-01) |
|---|---|---|
| `plan-soundness/` | Professional rules and taste for AI-written plans: validity lint, relation-first forms, the change model, the taste layer | open; §7 rows 1–5 and 3a met, row 6 closed in part (PS4.6 remains), row 7 parked; start at `plan-soundness/handoff.md` |
| `ci-throughput.md` | Options to shorten the PR cycle (auto-merge, concurrency, path filters, coverage off the PR path, merge queue, changelog fragments, PR legs and shards) | A–D and G live; E, F open, the owner decides |
| `archlang-3d/` | The owner's 3D plan (ADR 0030/0031 drafts) | owner's; not part of plan-soundness |
| `preview-and-remodel/` | The 3D preview, the G cards and Wave 7 (what the German-houses user reported); `handoff.md` is the resume point | waves 0–3, 5 and 7 done; waves 4 and 6 wait for the N10 read |
| `checker-reach/` | Check plans from any tool: OpenPlan3D/OAS import, revision guard, public check suite, language-spec version, short share links on the playground Worker, a free-orbit 3D preview; `handoff.md` is the resume point | planned 2026-11-05; runs before drawing-set waves 1–2 (CR-D1) |
| `drawing-set/` | The scheme-stage drawing set: indicators, site, sections and elevations, analysis diagrams, a sheet pack; `handoff.md` is the resume point | planned 2026-11-02; DS1/DS2 run as checker-reach CR1/CR2b, DS3–DS9 after Show HN (CR-D1) |
| `public-surfaces/` | Rework the playground (view mode, knobs, lazy editor), the docs home (what/why/how, zero-install doors) and the README + card so a visitor sees the output and tries it in a minute; `handoff.md` is the resume point | stages 0–4 done (1.56.0); 3D on every surface (`3d.md`) done (1.57.0), both 2026-11-06; residue in `handoff.md` |
| `geo-seo/` | GEO/SEO wave 3: authority, agent discovery (registry `remotes`, marketplaces), one entity, internal links to the example pages, the monthly panel reading; `handoff.md` is the resume point | stages 0–3 done and merged 2026-11-06/07; the owner queue and deferred items in `geo-seo/handoff.md`; next panel run 2026-12-01 |
| `visual-assets/` | Richer 3D furniture (material slots, shapes, a T0 generator for every family), an opt-in `rendered` 2D theme, twenty new families; `handoff.md` is the resume point | done and released 2026-11-04 (#459–#466); residue in `handoff.md` and backlog VA |
| `playground-minimal/` | Make the playground minimal: one entry per function (gallery replaces picker + strip, one Plan \| 3D switch, Share and ⋯ menus), and the 3D preview fills the stage with visible affordances; cards PG1–PG5, rulings PG-D1…D7 | done 2026-11-07 (#549–#553, #555) |
| `playground-mobile-perf/` | The playground fits a phone screen and stops wasting CPU, battery and bytes: one-screen phone layout, touch-first affordances, 3D draws only when visible, lean thumbnails, no compile at boot, compile in a worker; cards MP1–MP7, rulings MP-D1…D7 | planned 2026-11-07 on the owner's delegation; MP1 first |
| `product-roadmap/` | The product roadmap derived from the growth repo's research: seven tracks (checker credibility, edit-one-room, interop, sheet drafting, agent context, gated drawing-set/3D, foundations), four waves around the freeze and batch C, a "not doing" list, the RM cards and the owner's rulings RM-D1…D8; `handoff.md` is the resume point | planned 2026-11-06, rulings approved by the owner the same day; wave 0 not started |

The backlog (`docs/backlog.md`) points here for programme work; `docs/adr/` holds the decisions that
outlive a programme.
