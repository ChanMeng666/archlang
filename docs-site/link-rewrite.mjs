// Repo-relative markdown links -> site links, for the SITE copies of the canonical docs
// (PAGES and ADRs in sync-docs.mjs). The canonical files link each other by repo path
// (`../CHANGELOG.md`, `language-reference.md#x`, `README.md`), which resolves on GitHub but 404s
// (or only works through a 301) once the file is copied into the site. Pure: no I/O; the repo
// is reached through the injected `kindOf`, and the mapping is DERIVED from the tables passed
// in (never retyped here), so a new page or root copy needs no edit in this file.
import { posix } from "node:path";

const GITHUB = "https://github.com/ChanMeng666/archlang";

// VitePress's heading-id rule, copied from vitepress 1.6.4 (`slugify` in dist/node, the one it hands
// markdown-it-anchor; this repo's config sets no custom one). GitHub keeps `_` in an anchor and
// VitePress turns it into `-`, so `error-codes.md#w_scale_overflow` must become `/errors#w-scale-overflow`.
// biome-ignore lint/suspicious/noControlCharactersInRegex: VitePress's own rule, copied verbatim
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[̀-ͯ]/g;

/** The id VitePress gives a heading with this text (and so the fragment a site link must carry). */
export function slugify(str) {
  return str
    .normalize("NFKD")
    .replace(rCombining, "")
    .replace(rControl, "")
    .replace(rSpecial, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}

/**
 * Drop inline HTML tags, then any stray angle bracket. Character by character rather than by
 * regex, so no partial tag can survive a single pass (CodeQL
 * js/incomplete-multi-character-sanitization). `<` and `>` map to `-` in `slugify` and vanish in
 * `githubSlug`, so removing a stray one changes no id.
 */
function stripTags(s) {
  let out = "";
  let inTag = false;
  for (const ch of s) {
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag) out += ch;
  }
  return out;
}

/** The visible text of a markdown heading: links reduced to their text, tags and emphasis dropped. */
const headingText = (h) => stripTags(h.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")).replace(/[`*]/g, "");

/** GitHub's anchor for a heading text (what the canonical docs' fragments are written in). */
const githubSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");

/**
 * One step of a fenced-code scan: the fence still open after `line` (`null` for none) and whether
 * `line` is itself a fence marker. A fence opens on a run of >= 3 backticks or tildes and closes
 * only on a bare run of the SAME character at least as long (CommonMark; the rule
 * `test/docs-fences.test.ts` states), so a ```` ```` ```` block quoting a ```` ``` ```` fence is
 * one block, not two.
 */
export function fenceStep(open, line) {
  const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (open === null) return f ? { open: f[1], marker: true } : { open: null, marker: false };
  if (f && f[1][0] === open[0] && f[1].length >= open.length && !f[2].trim()) return { open: null, marker: true };
  return { open, marker: false };
}

/**
 * The headings of a markdown source as `{ vp, gh }` id pairs: the id VitePress gives each (its
 * `slugify`, which KEEPS an em dash GitHub drops) and the GitHub anchor, with each one's duplicates
 * numbered `-1`, `-2`, ... by both. Fenced code is skipped.
 */
export function headingIds(markdown) {
  const out = [];
  const seenVp = new Map();
  const seenGh = new Map();
  const uniq = (seen, base) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
  let fence = null;
  for (const line of markdown.split("\n")) {
    const step = fenceStep(fence, line);
    const inside = fence !== null || step.marker;
    fence = step.open;
    const h = inside ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const text = headingText(h[1]);
    out.push({ vp: uniq(seenVp, slugify(text)), gh: uniq(seenGh, githubSlug(text)) });
  }
  return out;
}

/**
 * A `#fragment` written for GitHub, re-spelled as the VitePress heading id of the same heading in
 * `source` (the target page's markdown). A fragment that is already a VitePress id stays; one that
 * matches no heading falls back to VitePress's slug of the fragment text.
 */
function siteFrag(frag, source) {
  if (frag.length < 2) return frag;
  let raw = frag.slice(1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  if (source) {
    const heads = headingIds(source);
    if (heads.some((h) => h.vp === raw)) return `#${raw}`;
    const hit = heads.find((h) => h.gh === raw.toLowerCase());
    if (hit) return `#${hit.vp}`;
    // A hand-typed anchor that only differs in punctuation (`v1-29` for GitHub's `v129`, one dash where
    // the heading has an em dash): accept it when exactly one heading is that text.
    const key = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const near = [...new Set(heads.filter((h) => key(h.vp) === key(raw)).map((h) => h.vp))];
    if (near.length === 1) return `#${near[0]}`;
  }
  return `#${slugify(raw)}`;
}

/** A page's site route from its `dest` (`reference.md` -> `/reference`, `index.md` -> `/`). */
export function routeOfDest(dest) {
  const r = dest.replace(/\.md$/, "");
  return r === "index" ? "/" : `/${r}`;
}

/**
 * @param {string} markdown the canonical source text
 * @param {string} srcPath its repo-relative path (`docs/adr/0010-x.md`)
 * @param {{
 *   pages: ReadonlyArray<readonly [string, string]>,      PAGES + SITE_PAGES rows
 *   rootCopies: ReadonlyArray<readonly [string, string]>, ROOT_COPIES rows
 *   playground: string,                                   the PLAYGROUND origin
 *   kindOf: (repoPath: string) => "file" | "dir" | null,  what the repo holds at a path
 *   sourceOf?: (repoPath: string) => string | null,       a markdown source's text (resolves #fragments)
 * }} ctx
 */
export function rewriteLinks(markdown, srcPath, ctx) {
  const pageRoute = new Map(ctx.pages.map(([src, dest]) => [src, routeOfDest(dest)]));
  const rootPath = new Map(ctx.rootCopies.map(([src, dest]) => [src, `/${dest}`]));
  const dir = posix.dirname(srcPath);

  const map = (target) => {
    const m = /^(\S+?)(\s+(?:"[^"]*"|'[^']*'))?$/.exec(target.trim());
    if (!m) return target;
    let url = m[1];
    const angled = url.startsWith("<") && url.endsWith(">");
    if (angled) url = url.slice(1, -1);
    if (url === "" || url.startsWith("#") || url.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return target;
    // `path?query#fragment`: the query is carried through, between the new path and the fragment.
    const hash = url.indexOf("#");
    const frag = hash < 0 ? "" : url.slice(hash);
    const pathAndQuery = hash < 0 ? url : url.slice(0, hash);
    const q = pathAndQuery.indexOf("?");
    const query = q < 0 ? "" : pathAndQuery.slice(q);
    const path = posix.normalize(posix.join(dir, q < 0 ? pathAndQuery : pathAndQuery.slice(0, q)));
    if (path.startsWith("..") || path === ".") return target;
    const bare = path.replace(/\/$/, "");
    let out;
    if (pageRoute.has(bare)) out = pageRoute.get(bare) + query + siteFrag(frag, ctx.sourceOf?.(bare));
    else if (/^docs\/adr\/index\.md$/.test(bare) || bare === "docs/adr") out = `/adr${query}${siteFrag(frag, null)}`;
    else if (/^docs\/adr\/[^/]+\.md$/.test(bare))
      out = `/adr/${posix.basename(bare, ".md")}${query}${siteFrag(frag, ctx.sourceOf?.(bare))}`;
    else if (rootPath.has(bare)) out = rootPath.get(bare) + query + siteFrag(frag, null);
    else if (bare === "playground/index.html") out = ctx.playground + query + frag;
    else {
      const kind = ctx.kindOf(bare);
      if (!kind) return target; // dead in the repo too: not ours to invent a target for
      out = `${GITHUB}/${kind === "dir" ? "tree" : "blob"}/main/${bare}${query}${frag}`;
    }
    return (angled ? `<${out}>` : out) + (m[2] ?? "");
  };

  // Fenced code is literal text; inline code spans are skipped per line.
  let fence = null;
  return markdown
    .split("\n")
    .map((line) => {
      const step = fenceStep(fence, line);
      const inside = fence !== null || step.marker;
      fence = step.open;
      if (inside) return line;
      return line
        .split(/(`+[^`]*`+)/)
        .map((seg, i) =>
          i % 2 === 1
            ? seg
            : seg
                .replace(/\]\(([^()\s][^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_, t) => `](${map(t)})`)
                .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/, (_, a, t) => a + map(t)),
        )
        .join("");
    })
    .join("\n");
}
