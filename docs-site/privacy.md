# Privacy

ArchLang collects as little as it can. This page says what happens to data.

## Who we are

ArchLang is an open-source project run by Chan Meng. The same publisher offers the npm packages,
these sites, the hosted endpoint at `mcp.archlang.uk` and the ArchLang plugins.

## This site and the playground

The documentation site and the playground are static pages served by Cloudflare. We set no
cookies and run no accounts or sign-in. The playground compiles your plan in your browser; a full
share link keeps the plan after the `#`, which a browser never sends to a server.

Both sites count visits with Cloudflare Web Analytics, a cookie-free counter that Cloudflare adds
to each page. For each page view it reports the page address and the page you came from, each with
everything after a `?` or `#` removed (so the plan in a full share link never reaches it), your
browser and operating system, and the page's load and responsiveness timings. A short link's
address is counted like any page. Like any request, the report reaches Cloudflare with your IP
address, which it uses for the country. Cloudflare processes these reports under its own privacy
policy. We see totals per page, referring site, country, browser, operating system and device
type, and page-speed figures.

The playground also counts a few things it is used for, to learn which errors people and AI agents
hit. Each count goes to `playground.archlang.uk` and holds only an event from a fixed list: a
compile (whether it had an error, and the catalogued diagnostic codes it raised, such as
`E_PARSE` or `W_DOOR_CLEARANCE`), an export (its format: SVG, PNG, PDF, DXF, TXT, GLB, or a copied
SVG or PNG), opening the 3D view, making a link (short, full or embed), applying a fix (its code),
with the day. A compile is counted only once you stop typing, and the same result at most once in
ten seconds. A count carries no plan text, label, room or element id, cookie or account. The
sender's IP address is used transiently as a rate-limit key and not stored by us. Cloudflare
Analytics Engine keeps the counts for three months. None of these counts is sent when your browser
sends Global Privacy Control or Do Not Track, and our server drops any that arrive with either
signal. An automated browser sends none, and the embedded drawing (`embed.html`, on other people's
pages) counts nothing. Two things you ask for are counted whatever your browser sends: a short link
and a contributed plan, below.

The product film on the home page and on `/start` is a picture from this site until you press play.
Only then does your browser load YouTube's player, from the privacy-enhanced `youtube-nocookie.com`
address, under YouTube's own privacy policy.

## Short links

The playground's **Copy short link** is the one thing on these sites that stores a plan (a
contributed plan, below, is stored the same way). Only when
you choose it, your browser sends the plan to `playground.archlang.uk`, which keeps it under a
short id made from the plan's own contents, so anyone with the link can open it. We store the plan
text and its title, with no IP address, account, cookie or expiry date. The sender's IP address is
used transiently as a rate-limit key and not stored by us. For each short link created or opened we
count the event, the id and the day in Cloudflare Analytics Engine, which keeps them for three
months; a created link is counted so even when your browser sends Global Privacy Control or Do Not
Track, because that count is part of making the link you asked for. The full link,
**Copy full link**, keeps the plan in the page: the plan itself is never sent. The playground counts
that a full link was copied (a `share` count, `full`, as listed above), and nothing more.

## Contributing a plan

When a plan in the playground's editor has an error or a warning, the diagnostics list offers
**Send this plan to improve ArchLang**. The plan is not sent until you confirm it in the dialog that
opens, each time. Then your browser sends the full plan text, which is stored as a short link
exactly as **Copy short link** stores one, so anyone with the link can open it. Our server then
marks that link as a contribution, with one count holding the link's id, the diagnostic codes it
reads from the plan it stored, and the day; your browser sends no count of its own for it. We use a
contributed plan only to improve ArchLang: the language spec, the error messages, the fixes, lint
and a private test corpus. It is never published, and never given to anyone else to train on.
Because you ask for it in the dialog, the plan is stored and marked even if your browser sends
Global Privacy Control or Do Not Track, and the dialog says so. To have a contributed plan deleted,
ask as for any short link (below, with the link); a plan that does not parse cannot be contributed.

## The hosted MCP endpoint

`https://mcp.archlang.uk` compiles the plan text an AI client sends it, in memory, and returns the
result. It keeps no request logs: Workers Logs are off and the Worker logs nothing. It stores no
plan, sign-in or cookie. The one thing it keeps is a rendered drawing in Cloudflare's edge cache for
an `/svg/` link, which carries the plan's labels.

The only personal data it handles is the sender's IP address, used transiently as a rate-limit key
and not stored by us. Its tools accept only plan text and a few drawing options. They never ask for
conversation history, credentials, location or any other personal data, so please do not put such
data in a plan.

An `/svg/` link puts the plan in the URL path, so unlike a playground link it reaches Cloudflare's
edge like any URL.

## Retention

- A cached `/svg/` drawing is stored under a versioned path with `max-age=31536000` (one year). The
  unversioned `/svg/` path tells clients to reuse a drawing for 300 seconds and revalidate with an
  `ETag`. We cannot list or delete individual entries; Cloudflare may evict them sooner.
- A short link's plan is kept until someone asks for it to be removed (see below). Its preview image
  is kept in Cloudflare's edge cache with `max-age=31536000`; once the plan is removed, the image is
  no longer served.
- The aggregate counts in Cloudflare Analytics Engine are the request method, the tool name and, for
  a refused request, the reason. For a call of `compile`, `describe`, `lint` or `validate` one more
  count holds the tool, whether the plan compiled clean, had an error or was refused, and up to
  twenty of the catalogued diagnostic codes its result raised (such as `E_PARSE`); never a message,
  a source position, a label or an id. They hold no plan text and no address. Cloudflare keeps them
  for three months. The playground's counts (above) are kept the same way.

## Sharing and your choices

We do not sell data, share it with advertisers, or send it to anyone except Cloudflare, which hosts
the service and processes IP addresses under its own privacy policy. We keep no account or request log; Cloudflare keeps the visit counts described above; the
one plan text we keep is a plan you made a short link for or contributed. To have one removed, open an issue with
the link, or email chanmeng.dev@gmail.com if the plan should not be named in public; once it is
deleted the short link stops working. To avoid the edge cache, use the playground, which keeps the
plan in your browser unless you make a short link or contribute it (it counts only the events
listed above), or the local tools, which send nothing.

## The ArchLang plugins

The Claude Code plugin (and the same plugin read by Codex, ChatGPT and GitHub Copilot) connects to
the hosted endpoint above, `https://mcp.archlang.uk/mcp`, with no sign-in and under the same rate
limit: when the agent calls one of its tools, the plan text and drawing options are sent there and
handled as that section says. Its skills drive the local command line tool, which sends nothing. To
keep plans on your machine, use the local MCP server instead (in Claude Code, `claude mcp add
archlang -- npx -y @chanmeng666/archlang-mcp`, then disable the plugin's server). The Cursor plugin
starts the local server and sends nothing.

## Local tools

The npm packages, the command line tool and the VS Code extension run on your machine and send
nothing anywhere. The `arch-plan` web component fetches only the `.arch` file the page author points
it at.

## Contact

Requests: [open an issue](https://github.com/ChanMeng666/archlang/issues).
