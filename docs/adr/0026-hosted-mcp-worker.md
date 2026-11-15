# 26. A third, scripted Worker hosts the MCP server

- **Status:** Accepted (owner decision, 2026-10). Live at `https://mcp.archlang.uk`; what production
  showed is in "Addendum: production" below.
- **Date:** 2026-10
- **Relates to:** [ADR 0019](0019-cloudflare-workers-hosting.md) (both sites are static assets with
  no `main`, and "a future feature that wants a request handler must justify the cap it buys"),
  [ADR 0012](0012-mcp-shim-discoverability.md) (the MCP server is the discoverability channel; the
  CLI stays primary), [ADR 0022](0022-exact-decisions-and-bounded-input.md) (budgets are counts).
- **Scope:** a new workspace, `packages/mcp-worker`, a new job in `deploy.yml`, two catalogued
  codes (`E_INPUT_TOO_LARGE`, `E_RATE_LIMITED`) the core can build but never raises itself. No language change; no
  change to `compile()`, `describe()` or `lint()`; the two site Workers are untouched.

## Context

The MCP server ships as an npm package that a host starts over stdio (`npx -y
@chanmeng666/archlang-mcp`). A growing set of hosts cannot start a local process at all: a web
chat's connector settings, an app directory, an agent running in someone else's cloud. They take a
URL. Without one, ArchLang is invisible to them however good the stdio server is.

ADR 0019 made both public sites static-asset Workers with **no script**, on purpose: with no script
every request is a free, unmetered asset request, exempt from the Workers free plan's daily request
cap and CPU limit. It said that a request handler must justify the cap it buys. This ADR is that
justification, and it keeps the rule intact for the two sites.

## Decision

**A third Worker, `archlang-mcp`, with a `main` script, in its own workspace and its own deploy
job. It is the only scripted Worker in the repository; `archlang-docs` and `archlang-playground`
keep no `main`.**

- **Where:** `packages/mcp-worker/wrangler.jsonc`, `workers_dev: true`, no `routes` and no
  `account_id`. The owner attaches `mcp.archlang.uk` by hand once the measurement below is in.
- **What it serves:**
  - `POST /mcp` — Streamable HTTP, **stateless**: no sign-in, no session id, a fresh `McpServer`
    per request, one JSON reply per POST. `GET` and `DELETE` answer 405, because there is no
    session to resume and no server-initiated message to stream.
  - the stdio server's tool set, registered from one module (`packages/mcp/src/tools.ts`) by both
    hosts, plus a `read_me` tool that explains this server in one page;
  - the five `archlang://` resources, bundled at build time (a Worker has no filesystem), and the
    MCP App viewer `ui://archlang/viewer`;
  - `GET /svg/<payload>` — the playground's `#z=` payload (`deflate-raw` + base64url), compiled,
    answered as `image/svg+xml`, so `archlang link` and an image URL share one encoding; and
    `GET /v/<render version>/svg/<payload>`, the same drawing pinned to one compiler (below);
  - `GET`/`HEAD /.well-known/openai-apps-challenge` — the OpenAI plugin portal's domain
    verification: the `OPENAI_APPS_CHALLENGE` var from `wrangler.jsonc` as `text/plain`, 404 while it
    is empty. Like `/`, it compiles nothing and is neither rate-limited nor counted, so it needs no
    new spend bound.
- **How it is deployed:** `deploy.yml` job `deploy-mcp`, separate from the site matrix so the site
  job is byte-identical. It runs on a push to `main` only when something the Worker bundles changed
  (its package, the MCP tool set, the core, the served resources), or on a manual run, and
  smoke-checks the workers.dev URL `wrangler deploy` prints (`scripts/smoke.mjs --site mcp`).

### The transport: the SDK's own Web-standard transport

`@modelcontextprotocol/sdk` 1.29.0, the version the stdio package already uses, ships
`WebStandardStreamableHTTPServerTransport` (Request/Response/ReadableStream; it names Cloudflare
Workers as a target). In stateless mode (`sessionIdGenerator: undefined`) with
`enableJsonResponse: true` it is exactly the server wanted: no hand-written JSON-RPC, and the same
`McpServer` and tool registry the stdio host uses. A hand-rolled handler would have been a second
protocol implementation to keep in step with the SDK.

### The viewer: an MCP App, with the text result as the fallback

`compile`'s definition and every `compile` result carry `_meta.ui.resourceUri =
"ui://archlang/viewer"` (and the deprecated flat key `ui/resourceUri`, as the SDK helper
`registerAppTool` writes it). The resource is one HTML page, `text/html;profile=mcp-app`, built
at build time with `@modelcontextprotocol/ext-apps` against the MCP Apps specification dated
2026-01-26: the drawing with pan and zoom, and the plan's lint findings (the viewer calls the
server's own `lint` tool when the host lets an app call tools, and otherwise lists the compile
diagnostics). The tool result's `content` is unchanged, so every host without MCP Apps gets the
same JSON text as before: that is the text fallback the specification requires.

- **Version: ext-apps 2.x on a v1 SDK server** (RM5.4; first written for 1.7.5). 2.x moved to the
  SDK's v2 split packages: `@modelcontextprotocol/client` is a required peer (the viewer's `App`
  extends its `Protocol`), and `@modelcontextprotocol/server` is optional, needed only by the
  `./server` helpers, which are typed against the v2 `McpServer`. The Worker's server stays on
  `@modelcontextprotocol/sdk` 1.x, the one `registerTools` shares with the stdio shim, so it
  registers the viewer with `registerResource` and the MIME type itself (what `registerAppResource`
  does) and takes only the constants from `./server`, which imports nothing at run time. Both lines
  speak the same 2026-01-26 wire protocol. Moving the MCP package to SDK v2 is its own change.
- **Not capability-gated.** The specification says a server SHOULD register UI-enabled tools only
  after seeing the host's `io.modelcontextprotocol/ui` capability. A stateless server never sees
  the `initialize` that carried it when it answers `tools/list`, so `_meta.ui` is always present; a
  host that does not know the key ignores it, and the result text is identical either way.
- **Size:** the page is about 661 KiB (149 KiB gzipped; 513 KiB and 111 KiB on ext-apps 1.7.5),
  most of it zod and the SDK client inside the `App` class. It is fetched once per host session,
  not per call.
- **Rendering in a host:** proven in claude.ai for a custom connector (see "Addendum: production").
  No other host is claimed.

### No `/png/`

The core's PNG backend is `@resvg/resvg-js`, a native module, and it reads its fonts through
`node:fs`. A Worker has neither. `@resvg/resvg-wasm` exists, but it would be a second renderer
path whose output is not proven against the first, plus fonts to bundle, at raster CPU cost far
past anything in the measurement below. `compile` with `format: "png"` answers `ok:false` with
`E_PNG_DEPENDENCY` and a sentence naming `svg` and `/svg/` instead; it never throws.

### Image URLs: the plan is in the URL, the compiler is not

A `#z=` payload fixes the plan, not the drawing: a core release can move every example's SVG (the
symbol redraw did). So `/svg/<payload>` is **not** immutable. It is served
`Cache-Control: public, max-age=300, stale-while-revalidate=86400` with a strong `ETag` derived
from the render version and the payload (an `If-None-Match` hit is a 304), and its
`Content-Location` names the pinned copy, `/v/<render version>/svg/<payload>`, which is the **only**
path served `public, max-age=31536000, immutable`.

- The **render version** is the core's version plus a hash of the built core library
  (`1.42.1-3fa9c2d1`), computed by the build, because `deploy-mcp` also redeploys on a core change
  merged without a version bump.
- The **edge-cache key** is the pinned path for both routes, so a deploy with a new core starts
  from an empty key space and can never serve a drawing the previous core made. (Before this, the
  key was the path alone: after a release the colo cache would have kept the old drawing for a year
  and the post-deploy smoke, which compares the bytes with `compile()`, would have failed.)
- A pinned URL from an **older** render version answers 302 to the unpinned URL (cacheable for five
  minutes): the old bytes are no longer drawn here, and presenting new bytes under an old pin would
  break the one promise the pin makes.
- `link` still mints the unpinned playground URLs; a human-facing image link should be the
  unpinned `/svg/` URL, which follows the compiler.

### Budgets stay counts; the host adds a byte cap

`compile()`'s budgets are counts (steps, drawn elements) and every input it is given returns a
diagnostic (ADR 0022). That does not change. What a Worker adds is a **CPU ceiling per request**,
and running out of it is a platform error (HTTP 5xx), not a diagnostic. So the host refuses large
input **before compiling**, by bytes, never by time:

- **any tool argument** over **64 KiB** — a `source`, a serialized `plan_json`, an `intent`, a
  `brief`, a `graph`, a `profile` — → `E_INPUT_TOO_LARGE` as a normal tool result (`isError`, the
  usual `{ ok:false, diagnostics }` envelope with the catalogued fix); a notification carrying one
  (no id, nothing to answer) gets 202 and no body;
- a request body over 256 KiB → HTTP 413 carrying the same diagnostic;
- a `/svg/` payload that inflates past 64 KiB → 413, and decompression stops at the cap, so a small
  payload that inflates enormously costs at most the cap.

`E_INPUT_TOO_LARGE` is a catalogue row and a pure core helper, `inputTooLarge()`, that a host
calls (every refusal above goes through it); `compile()` never calls it. **The 64 KiB figure is interim**: the largest example is about
18 KB, so no corpus plan is refused, and it is set against the Paid plan's ceiling below, not the
free plan's.

A request that passes the cap and still exhausts the CPU limit fails with the platform's 5xx. That
is not dressed up as a diagnostic: it is the host failing, not the plan.

### The spend bound

A paid, unauthenticated compile endpoint needs a ceiling on what it can cost. **The spend bound
is `limits.cpu_ms` plus the owner's billing notification**; a per-address rate limit sits beside
them as an abuse guard only. Both live in `wrangler.jsonc`, both are counts:

- **`limits.cpu_ms: 5000`** — CPU per request. The slowest call measured below (`finish` on a 60 KB
  synthetic plan, about 2.1 s of wall-clock time on a desktop) fits with room. The bound is
  **approximate**: Cloudflare lets an isolate run over the configured limit occasionally and
  terminates (Error 1102) only on consistent overrun ("Each isolate has some built-in flexibility
  to allow for cases where your Worker infrequently runs over the configured limit"). Not
  enforced in `wrangler dev`.
  **`limits` needs Workers Paid.** Cloudflare's configuration reference: "Limits are only
  supported for the Standard Usage Model"; its pricing page: "Users on the Workers Paid plan have
  access to the Standard usage model." So the account must be on Paid before this reaches `main`.
  On Free, `deploy-mcp` should fail; the exact error Cloudflare returns is not verified here, so
  the job's last step greps wrangler's combined output for `cpu_ms`, `usage model` or `Standard`
  and, if found, prints this owner step as the likely cause.
- **A per-address abuse guard** (the Workers rate-limiting binding, keyed on `CF-Connecting-IP`,
  which is never stored or logged): **600 `POST /mcp` a minute** and **3000 `/svg/` cache misses a
  minute** (a hit compiles nothing and is not counted). Over it, the request is refused before any
  work with HTTP 429, `Retry-After`, and a new catalogued `E_RATE_LIMITED` diagnostic (core helper
  `rateLimited()`), a code of its own because "too many requests" is neither a plan fault nor a
  size: the fix is to wait or compile locally. Cloudflare applies these limits per location, and
  each refusal writes one `refused` Analytics Engine data point so the owner can see whether they
  fire (so a flood of refused requests also amplifies telemetry writes, one per request).
- **Why the guard is high: connector platforms share egress addresses.** A chat product that
  offers this server as a remote connector calls it from its own cloud egress, not from each
  user's machine, so all of that product's users share one per-address bucket per location, and
  one agent turn is 5–15 calls. Cloudflare's rate-limiting docs warn against IP keys for exactly
  this reason. A low per-address limit would refuse ordinary users the day a listing goes live;
  this repository does not hard-code any platform's address ranges.

**Worst-case daily cost — approximate**, on Paid, beyond the monthly inclusions (10 M requests,
30 M CPU-ms), for `N` distinct addresses each held at its limits all day. Two simplifications:
the rate counters are per Cloudflare location and one address normally reaches one location, so
`N` counts address–location pairs; and `C` is approximate because the CPU limit tolerates
occasional overrun (above):

```text
cost/day ≤ N × 1440 × [ (R_mcp·C_mcp + R_svg·C_svg) × $0.02/10⁶  +  (R_mcp + R_svg) × $0.30/10⁶ ]
R_mcp = 600/min, R_svg = 3000/min, C = CPU-ms per request
```

At the configured CPU limit (`C = 5000` for both) that is about **$520 per address per day** ($86.40 `/mcp` +
$432 `/svg/` + $1.56 requests). At the measured ceilings (`C_mcp ≈ 2100` for `finish`,
`C_svg ≈ 700` for a 60 KB compile) it is about **$98 per address per day**. Those are the figures
of a sustained attack, not of use, and the guard does not bound `N`: many addresses scale the bill
linearly. That is why the billing notification is an owner step before the URL is announced, and
why the guard can be lowered, or keyed differently, once real traffic shows its shape.

## The cap this buys, measured

The Workers free plan allows 10 ms of CPU per HTTP request and 100,000 requests a day. Requests
to static assets are free and unlimited, which is why the two sites are unaffected; but every MCP
call and every `/svg/` request reaches the script and counts. The daily allowance is the plan's,
not this Worker's, so any other scripted Worker in the same Cloudflare account draws on it too
(the account does have one more, `sunostats`, an unrelated project).

Measured with `packages/mcp-worker/scripts/measure-cpu.mjs` against `wrangler dev --local`
(wrangler 4.108.0, workerd 1.20260706) on the development machine, `MEASURE_CPU=1` making the
Worker report `performance.now()` around its own handler (1 ms resolution). **These are wall-clock
handler times on a loaded shared desktop, and an upper bound on billed CPU time**: they include
each request's construction of a fresh `McpServer` with all its tool schemas (that alone is most
of `tools/list`'s 4 ms) and anything else the machine was doing. The dashboard's CPU-time
percentiles on Cloudflare are the deciding numbers. Every top-level
`examples/*.arch` (30 plans) × 5 repetitions per tool, plus synthetic grids of rooms at 8, 16, 32
and 60 KB:

| tool | p50 ms | p95 ms | max ms | 60 KB synthetic, p50 ms |
|---|---:|---:|---:|---:|
| initialize | 2 | 3 | 3 | – |
| tools/list | 4 | 6 | 6 | – |
| compile | 8 | 34 | 105 | 663 |
| describe | 11 | 170 | 228 | 108 |
| lint | 13 | 232 | 309 | 169 |
| validate | 20 | 277 | 386 | 867 |
| score | 11 | 177 | 283 | 90 |
| repair | 19 | 210 | 639 | 50 |
| fix | 13 | 66 | 117 | 1232 |
| finish | 52 | 622 | 1341 | 2109 |
| suggest | 3 | 13 | 19 | 27 |
| complete | 3 | 14 | 28 | 40 |
| link | 8 | 46 | 141 | 664 |
| GET /svg/ (cache miss) | 13 | 69 | 193 | 623 |

Read them as a ranking and an order of magnitude. `compile`'s own p95 (34 ms) would not settle
the question alone; the analysis tools do: **`validate`, `lint` and `finish` have corpus p95s of
170–622 ms**, past 10 ms by far more than any discount for wall-clock overhead. No byte cap rescues the free
plan, because the plans that exceed it are ordinary examples, not large inputs.

**Therefore: Workers Paid**, which `limits.cpu_ms` requires anyway (above). Paid allows 30 s of CPU per request by
default (configurable to 5 minutes) and includes 10 million requests and 30 million CPU
milliseconds a month, for a $5 monthly minimum; the slowest 60 KB
case measured here (`finish`, about 2.1 s) sits more than 10× inside the default. That headroom is
what the interim 64 KiB cap is chosen against.

### The measurement plan, on Cloudflare

1. Upgrade the account to Workers Paid (the `limits` setting needs it; see "The spend bound").
2. Merge, so `deploy-mcp` deploys to workers.dev (or run the workflow by hand).
3. Run `node packages/mcp-worker/scripts/measure-cpu.mjs --base https://archlang-mcp.<subdomain>.workers.dev`
   (`MEASURE_CPU` is not set in production, so the script falls back to client wall time; the
   number that matters is the dashboard's **CPU time** percentiles for the Worker over the run).
4. Set the byte cap from the measured ms-per-KB of the slowest tool, and `cpu_ms` from the measured
   p99, before attaching the custom domain.

The Cache API's effect on `*.workers.dev` is not verified here (Cloudflare documents cache
behaviour for custom domains), so a workers.dev run may see every `/svg/` request as a miss. That
only makes the measurement an upper bound. The one `CF-Cache-Status: HIT` observed so far came
from `wrangler dev`'s local cache simulation, not from Cloudflare; the unit tests exercise the
version-keyed cache with an in-memory stand-in.

## Privacy and telemetry

- No sign-in, no cookie, no session. The server stores only rendered SVGs, in Cloudflare's edge
  cache (one per `/svg/` drawing, keyed by render version); never a source or a request body. A
  rendered drawing does carry the plan's labels.
- Nothing logs a body or a source: the Worker logs nothing, `observability` (Workers Logs) is off,
  and source maps are not uploaded. The `internal error` path deliberately drops the error message,
  which could quote a source.
- Each MCP message writes **one** Analytics Engine data point: `blobs: [method, tool]`,
  `indexes: [method]`. Both come from fixed lists — the MCP methods a client sends, and the tools
  this server registers (a test holds that list to `tools/list`) — and anything else is recorded as
  `(other)`, so no client-chosen string reaches the dataset. A request refused before any work
  (rate limit, size cap) writes one point instead: `["refused", <reason>]`, the reason from a fixed
  list. The binding is optional; local dev runs without it.
- **A `/svg/` URL sends the plan to the server.** A playground link carries the plan after `#`,
  which a browser never sends; an `/svg/` URL carries it in the path, which reaches Cloudflare's
  edge like any URL. The Worker logs nothing, but the difference is real and `read_me` says so.

## Consequences

- One more thing deploys on a push to `main`, but only when its inputs changed. The site job is
  unchanged, and the two site Workers still have no script.
- The stdio server is unchanged in behaviour: `server.ts` reads the resources from disk and passes
  them, with the lazy link loader, to the shared registry. The tool set has one definition.
- `compile` on the hosted server says png is unavailable in its own description; on npm it says
  what it always said.
- The Worker bundles **this checkout's** core (`../../dist`, aliased by name in the build), never
  whatever `node_modules` resolves, so the hosted server and the deployed resources are one
  version.

## Owner steps (not agent work)

- **Workers Paid, BEFORE this branch reaches `main`.** `limits.cpu_ms` needs the Standard usage
  model, which only Paid has; on a Free account `deploy-mcp` should fail, and its last step then
  names this as the likely cause.
  Measure on Paid (the measurement plan above).
- **Billing notification:** set a Cloudflare billing alert before announcing the URL; the
  per-address guard does not bound the number of addresses (see "The spend bound").
- **Rate-limit namespaces:** confirm no other Worker in the account uses `namespace_id` 2601 or
  2602 (bindings that share one share counters).
- **The guard, live:** after the first deploy, send about 700 small `POST /mcp` requests in a burst
  (past the 600-a-minute guard) and expect clean 429s with `E_RATE_LIMITED`, no 503. Under
  `wrangler dev` a 700-request burst gave 460 × 200 and 240 × 429 and no 503; production is not
  yet observed.
- **Connector traffic:** before a connector listing or the open proof below, look at the `refused`
  data points; if connector users share an address and meet the guard, raise it or re-key it.
- **Domain:** attach `mcp.archlang.uk` to `archlang-mcp` (a `routes` entry with
  `custom_domain: true`, or the dashboard) — DNS and certificate changes are owner-only.
- **Analytics:** query the `archlang_mcp` dataset (SQL API: `SELECT blob1 AS method, blob2 AS tool,
  count() FROM archlang_mcp GROUP BY method, tool`); refusals are `method = 'refused'`, with the
  reason in `tool`.
- **Open proof:** none for claude.ai (done, see "Addendum: production"); any other host stays
  unclaimed until someone sees it render.
- **Listings:** the connector directories and app stores that take a remote MCP URL.

## Addendum: production

- **Deploy and domain.** `deploy.yml`'s `deploy-mcp` job deploys `archlang-mcp` on every `main`
  push. The custom domain `https://mcp.archlang.uk` (Production, zone `archlang.uk`) is attached in
  the dashboard; `https://archlang-mcp.chanmeng-dev.workers.dev` also answers.
- **The Worker's rate-limit bindings are best-effort.** Measured from one address: 700 POSTs in
  60 s, 800 in 69 s and 1500 in 100 s to `/mcp` all returned 200, because a Cloudflare rate-limit
  binding counts per server, not globally (`RATE_MCP` 600/60 s and `RATE_SVG` 3000/60 s above).
- **The precise guard is a zone WAF rule, outside the repo.** A rate-limiting rule on `archlang.uk`
  named `mcp abuse guard`: expression
  `(http.host eq "mcp.archlang.uk")` (every path on the host, `/svg/` included), per IP, 100
  requests per 10 s, action Block for 10 s (the Free plan's only period and timeout). Measured: 300
  POSTs gave 130 x 200 then 170 x 429, and service resumed after the timeout. It was first
  scoped to `/mcp` only and later widened to the whole host. It lives in the Cloudflare dashboard,
  so a reader of the repository alone cannot see it.
- **Spend bound, restated.** `limits.cpu_ms` plus the account's USD 10 billing budget alert plus
  that WAF rule; the Worker's own bindings are not part of the bound.
- **Shared account caps.** The Cloudflare account also holds another scripted Worker, `sunostats`
  (an unrelated project), which shares the Workers Paid account caps. ADR 0019's "no `main`" law
  concerns the two ArchLang site Workers only.
- **Render proof.** A claude.ai custom connector (`https://mcp.archlang.uk/mcp`, no sign-in, tool
  permission "needs approval") renders the `compile` result as an MCP App card ("ArchLang
  compile": pan and zoom, +, -, Fit, a view-source toggle).
- **Analytics.** The growth repository's weekly metrics job reads the Analytics Engine dataset
  through the SQL API with an Account Analytics Read token. It counts `tools/call` only, so
  `tools/list` traffic and WAF-blocked requests never appear, and the first ~1,500 requests on
  2026-10-14 were the owner's own burst tests.

## Deferred, by name

- **`/png/`** — needs a Worker-compatible renderer proven byte-faithful to the native one.
- **The v2 SDK for the server** — the MCP package and the Worker's server move together.
- **Sessions, auth, server-initiated messages** — nothing here needs them.
- **A `link` result that also names the `/svg/` URL** — the tool's output is shared with the npm
  server, which has no origin to name; `read_me` says how to form it.
