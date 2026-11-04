# 34. Short links: the playground Worker gets a script, for listed paths only

- **Status:** Accepted. The design and the storage decision are the owner's (checker-reach plan,
  decisions CR-D3 and CR-D4; CR-D4 approved in words on 2026-11-05). Amends
  [ADR 0019](0019-cloudflare-workers-hosting.md).
- **Date:** 2026-11
- **Relates to:** [ADR 0019](0019-cloudflare-workers-hosting.md) (both sites static, "a future
  feature that wants a request handler must justify the cap it buys"),
  [ADR 0026](0026-hosted-mcp-worker.md) (the hosted MCP Worker: the pattern for bindings, the rate
  guard and counting), [ADR 0022](0022-exact-decisions-and-bounded-input.md) (budgets are counts).
- **Scope:** the playground Worker (`playground/wrangler.jsonc`, `playground/worker/`), the
  playground's Share control and `embed.html`, and `scripts/smoke.mjs --site playground`. No
  language change, no core change, no change to `compile()`, `describe()` or `lint()`. The docs
  Worker is untouched.

## Context

A playground share link carries the whole plan, compressed, in its `#z=` fragment. That needs no
server and keeps working forever, but it grows with the plan: a link the owner pasted on
2026-11-05 ran past 1,000 characters. Such a link is awkward in a post, a chat or an issue, and a
link preview (X, LinkedIn, Slack) shows nothing for it, because a fragment never reaches a server
and so there is nothing for a crawler to read.

ADR 0019 kept both site Workers script-less because a script made every request a metered
invocation, counted against the Free plan's 100,000 requests a day. Two things have changed. The
account is on Workers Paid (10 million requests a month included). And `assets.run_worker_first`
now takes an array of route patterns: only a request matching one runs the script first, and every
other request is served by the asset layer as before.

## Decision

**The playground Worker gets a `main` script, `playground/worker/`, that answers only the paths
`assets.run_worker_first` lists: `["/s/*", "/api/*"]`.**

| Route | Answers |
|-------|---------|
| `POST /api/share` | body: a `#z=` payload; stores the plan, replies `{ id, url }` |
| `GET /api/share/<id>` | `{ id, z }`, for `embed.html#s=<id>` |
| `GET /s/<id>` | a small HTML page: the card metadata, then `location.replace("/#z=<payload>")` |
| `GET /s/<unknown>` | a 404 HTML page with a link to the playground |

1. **Every static path behaves byte for byte as before.** A path outside the list is served by the
   asset layer without the script running, as it was. A path the asset layer finds no file for
   reaches the script (that is the platform's rule once a script exists); the script hands it
   straight back through the `ASSETS` binding, so the answer is the asset layer's own 404, with
   the `_headers` it carried before. `/embed.html` stays a literal 200, `/` stays the `_redirects`
   rewrite, and a mistyped path stays a bare 404. Measured on `wrangler dev` before and after: 34
   requests over 26 static paths (GET, HEAD and POST; 200s, 404s and 405s) gave the same status,
   headers and body SHA-256; a deliberately broken fallback changed 14 of them.
2. **The docs Worker stays script-less.** Its routing (`drop-trailing-slash`, VitePress's 404) has
   no request a script would serve.
3. **A site script is allowed only behind an explicit route list.** `run_worker_first: true` would
   run it, metered, for every request. `playground/test/share-worker.test.ts` holds the list to
   exactly `["/s/*", "/api/*"]`, and `packages/mcp-worker/test/worker.test.ts` holds the docs
   Worker to no `main`.

### Content-addressed ids

The id is the first 8 characters of base62(SHA-256(the plan's UTF-8 source)), about 47 bits.

- **The source is hashed, not the payload.** Deflate output is the encoder's choice: the CLI and
  the MCP tools compress with zlib at level 9, a browser with `CompressionStream` at its default,
  and zlib builds differ. Hashing the payload would give one plan a different short link per
  browser; hashing what it decodes to gives it one link everywhere.
- **One plan, one link.** Sharing a plan again finds its id and writes nothing.
- **Collisions lengthen the id.** If `s:<id>` holds a different plan (the record's metadata carries
  the full hash), the next character is added, and so on to all 43; the first free or matching
  prefix wins. Deterministic for a given store, and nothing stored is ever overwritten, so a
  short link, once given out, names one plan forever.
- **No sequence.** Ids cannot be enumerated, and they carry no time or count.

### What `POST /api/share` accepts

The body is exactly what the playground's `encodeSrc` writes after `#z=`. Refused, each with a
JSON body carrying a stable `error.code` and never a stack: a body over 64 KiB
(`payload_too_large`, read no further); not base64url, not raw deflate or not UTF-8
(`bad_payload`); inflating past 64 KiB, the hosted MCP Worker's source cap (`source_too_large`, inflation stops at the cap, so a
deflate bomb costs nothing); text the parser does not accept (`not_a_plan`, with the `E_PARSE` or
`E_STEP_LIMIT` diagnostic); an address over its rate (`rate_limited`, `E_RATE_LIMITED`,
`Retry-After`). The core has no parse-only export, so the check is `compile()`, its public route to
the parser, which costs about 20 ms on the largest example and about 0.5 s on 64 KiB of rooms
(desktop; 1.8 s at 256 KiB, which is why the cap is 64); only a parse or step-budget failure
refuses. A plan whose faults are its own, a wall error say, is stored: that is what someone shares
to ask for help.

### Storage, privacy, counting

- **Store:** Workers KV namespace `archlang-share`, binding `SHARE`, key `s:<id>`, value the payload,
  metadata `{ v, h, t }` (record version, full hash, the plan's title for the card). No TTL, no
  address, no account.
- **Stored only when asked.** The Share control is a disclosure, `Link ▾`, holding the two choices
  and one line: "A short link stores this plan on archlang.uk's server; the full link does not."
  Copy short link is the one action that sends a plan to the server. If it fails for any reason
  (offline, refused, slow), the full link is copied instead and the status line says so. The full
  `#z=` link is unchanged and stays the permanent form; `/s/<id>` always lands on it.
- **Removal:** on request (`SUPPORT.md`), the owner deletes the key with
  `wrangler kv key delete --namespace-id <id> "s:<id>"`. A deleted id answers 404.
- **Abuse:** a Workers rate-limit binding, `RATE_SHARE`, 30 creates per address per 60 s, keyed on
  `CF-Connecting-IP`, which is never stored, logged or counted; its own `namespace_id` (2603; 2601
  and 2602 are the MCP Worker's). Best-effort, like ADR 0026's, and an abuse guard, not a spend
  bound. Reads are not limited.
- **Counting:** Analytics Engine dataset `archlang_share`, one data point per create and per
  resolve: `blobs: [event, id, day]`, the event from a fixed list (`create`, `resolve`,
  `resolve-json`, `refused`, the last with a reason in place of the id). It answers "are short
  links opened at all", the plan's first click data.
- **Logs:** Workers Logs on, invocation logs off. The script logs only an internal error's name,
  never a plan, and invocation logs would record each request's metadata.
- **Caching:** `/api/share/<id>` is `immutable` (the plan behind an id never changes). `/s/<id>`
  is cached for a day, not a year: the plan does not change, but the page's template can, and its
  card image will when the per-plan preview lands.

### Cost

On Workers Paid, a script request counts against the 10 million included a month, and KV against
10 million reads and 1 million writes included a month (then USD 0.50 a million reads and USD 5 a
million writes; storage USD 0.50 a GB-month past 1 GB; Cloudflare's KV pricing page, read
2026-11-05). A create is at most a few KV reads and one write; an open is one read. A stored plan
is a few kilobytes, so a million of them fit in the included gigabyte. Static paths are still
asset requests. The owner can set usage notifications in the Cloudflare dashboard (owner step).

## Consequences

- The playground is no longer all static: `/s/*` and `/api/*` are code, metered, and can fail.
  Everything a user had before keeps working without them.
- The privacy page and `SUPPORT.md` say what is stored and how to have it removed.
- The CI deploy token needs **Workers KV Storage: Edit** for the playground deploy to bind the
  namespace (owner step).
- `scripts/smoke.mjs --site playground` gains three checks (an unknown id 404s; a create returns an
  id; that id's page carries the card metadata and its payload decodes to the plan sent). The
  static checks are unchanged. The plan the smoke test creates stays in the store, once.

## Alternatives considered

- **A third-party shortener.** An outside dependency for every shared link, with the click data and
  the brand in someone else's hands, and liable to be blocked or shut. Rejected.
- **Sequential ids in D1.** Enumerable, so every shared plan could be listed by counting, and no
  dedupe: the same plan shared twice gets two links. Rejected.
- **`archlang.uk/p/<id>`.** Would give the docs Worker a script too, and the playground would need
  a cross-origin POST to it. Rejected: the links live where the plans open.

## Owner steps (not agent work)

- **CI token:** add Workers KV Storage: Edit to `CLOUDFLARE_API_TOKEN` if the first playground
  deploy cannot bind `SHARE`.
- **Usage notifications:** Billing → Notifications in the Cloudflare dashboard.
- **Removal requests:** `wrangler kv key delete` as above.
