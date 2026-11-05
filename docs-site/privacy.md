# Privacy

ArchLang collects as little as it can. This page says what happens to data.

## Who we are

ArchLang is an open-source project run by Chan Meng. The same publisher offers the npm packages,
these sites, the hosted endpoint at `mcp.archlang.uk` and the ArchLang plugins.

## This site and the playground

The documentation site and the playground are static pages served by Cloudflare. We set no
cookies, run no accounts or sign-in, and load no analytics or tracking script. The playground
compiles your plan in your browser; a full share link keeps the plan after the `#`, which a browser
never sends to a server.

The product film on the home page and on `/start` is a picture from this site until you press play.
Only then does your browser load YouTube's player, from the privacy-enhanced `youtube-nocookie.com`
address, under YouTube's own privacy policy.

## Short links

The playground's **Copy short link** is the one thing on these sites that stores a plan. Only when
you choose it, your browser sends the plan to `playground.archlang.uk`, which keeps it under a
short id made from the plan's own contents, so anyone with the link can open it. We store the plan
text and its title, with no IP address, account, cookie or expiry date. The sender's IP address is
used transiently as a rate-limit key and not stored by us. For each short link created or opened we
count the event, the id and the day in Cloudflare Analytics Engine, which keeps them for three
months. The full link, **Copy full link**, sends nothing.

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
  a refused request, the reason. They hold no plan text and no address. Cloudflare keeps them for
  three months.

## Sharing and your choices

We do not sell data, share it with advertisers, or send it to anyone except Cloudflare, which hosts
the service and processes IP addresses under its own privacy policy. We keep no account or log; the
one plan text we keep is a plan you made a short link for. To have one removed, open an issue with
the link, or email chanmeng.dev@gmail.com if the plan should not be named in public; once it is
deleted the short link stops working. To avoid the edge cache, use the playground or the local
tools, which send nothing.

## Local tools

The npm packages, the command line tool and the VS Code extension run on your machine and send
nothing anywhere. The `arch-plan` web component fetches only the `.arch` file the page author points
it at.

## Contact

Requests: [open an issue](https://github.com/ChanMeng666/archlang/issues).
