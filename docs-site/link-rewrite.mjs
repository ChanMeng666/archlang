// Repo-relative markdown links -> site links, for the SITE copies of the canonical docs
// (PAGES and ADRs in sync-docs.mjs). The canonical files link each other by repo path
// (`../CHANGELOG.md`, `language-reference.md#x`, `README.md`), which resolves on GitHub but 404s
// (or only works through a 301) once the file is copied into the site. Pure: no I/O; the repo
// is reached through the injected `kindOf`, and the mapping is DERIVED from the tables passed
// in (never retyped here), so a new page or root copy needs no edit in this file.
import { posix } from "node:path";

const GITHUB = "https://github.com/ChanMeng666/archlang";
const PUBLIC = "docs-site/public/";

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

/** Prose outside code spans: links reduced to their text, inline tags and emphasis dropped. */
const proseText = (s) => stripTags(s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")).replace(/[`*]/g, "");

/**
 * The visible text of a markdown heading, as markdown-it-anchor reads it in VitePress 1.6.4 (the
 * `text` and `code_inline` tokens): a code span keeps its content verbatim (`<arch-plan>` stays,
 * so it slugs to `arch-plan`), with one surrounding space stripped as CommonMark does; outside code
 * spans links keep their text and inline tags and emphasis are dropped. A backtick run with no
 * closing run of the same length is literal text.
 */
function headingText(h) {
  let out = "";
  let i = 0;
  let prose = "";
  while (i < h.length) {
    if (h[i] !== "`") {
      prose += h[i++];
      continue;
    }
    let n = i;
    while (n < h.length && h[n] === "`") n++;
    const run = h.slice(i, n);
    let close = -1;
    for (let j = n; j < h.length; ) {
      if (h[j] !== "`") {
        j++;
        continue;
      }
      let k = j;
      while (k < h.length && h[k] === "`") k++;
      if (k - j === run.length) {
        close = j;
        break;
      }
      j = k;
    }
    if (close < 0) {
      prose += run;
      i = n;
      continue;
    }
    let code = h.slice(n, close);
    if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
    out += proseText(prose) + code;
    prose = "";
    i = close + run.length;
  }
  return out + proseText(prose);
}

/** GitHub's anchor for a heading text (what the canonical docs' fragments are written in). */
const githubSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");

/**
 * One step of a fenced-code scan: the fence still open after `line` (`null` for none), whether
 * `line` is itself a fence marker, and an opener's trimmed info string. The ONE fence rule: the
 * rewriter and the docs tests (`docs-fences`, `docs-site-links`, `plan-constructs`) all import it.
 * CommonMark's: a fence marker is a run of >= 3 backticks or tildes indented at most 3 spaces (4+
 * is indented code); a backtick opener's info string holds no backtick (```` ``` a`b ```` is
 * inline code, not a fence); a fence closes only on a bare run of the SAME character at least as
 * long, so a ```` ```` ```` block quoting a ```` ``` ```` fence is one block, not two.
 * @param {string | null} open
 * @param {string} line
 * @returns {{ open: string | null, marker: boolean, info?: string }}
 */
export function fenceStep(open, line) {
  const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r$/, ""));
  if (open === null) {
    if (!f || (f[1][0] === "`" && f[2].includes("`"))) return { open: null, marker: false };
    return { open: f[1], marker: true, info: f[2].trim() };
  }
  if (f && f[1][0] === open[0] && f[1].length >= open.length && !f[2].trim()) return { open: null, marker: true };
  return { open, marker: false };
}

/**
 * The lines of a markdown source that are neither fenced code nor an HTML comment block, each with
 * its 0-based index. A line that starts (after <= 3 spaces) with `<!--` opens a comment block that
 * runs to the line holding `-->` (markdown-it's HTML block type 2), so a `#` line inside one is no
 * heading.
 * @param {string} markdown
 * @returns {Array<[string, number]>}
 */
function proseLines(markdown) {
  const out = [];
  let fence = null;
  let inComment = false;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    const step = fenceStep(fence, line);
    const inside = fence !== null || step.marker;
    fence = step.open;
    if (inside) continue;
    const open = /^ {0,3}<!--/.exec(line);
    if (open) {
      if (!line.slice(open[0].length).includes("-->")) inComment = true;
      continue;
    }
    out.push([line, i]);
  }
  return out;
}

/**
 * The headings of a markdown source as `{ vp, gh }` id pairs: the id VitePress 1.6.4 gives each
 * and the GitHub anchor. The ONE heading-id rule: the rewriter and the docs tests import it.
 *
 * - ATX headings (`#`..`######` after <= 3 spaces) outside fenced code and HTML comment blocks
 *   (`proseLines`); a closing `#` run counts only after a space.
 * - `vp` is `slug` (VitePress's `slugify` unless a test hands in the one read from VitePress
 *   itself) of the heading text (`headingText`: a code span verbatim, so `` `<arch-plan>` `` keeps
 *   its tag name; tags dropped only outside code spans), which KEEPS an em dash GitHub drops.
 *   `test/docs-site-links.test.ts` checks every published page's ids against VitePress's own
 *   markdown parser. A heading ending in an
 *   attribute block (`## Title {#custom-id}`, `{#a .b}`, `{.b}`) loses the block from its text, as
 *   markdown-it-attrs strips it; an `#id` in the block IS the id, as markdown-it-anchor keeps an
 *   explicit one. GitHub knows no attribute block, so `gh` slugs the whole text (`title-custom-id`).
 * - A repeat is suffixed `-1`, `-2`, ... until free, in one registry per spelling that the explicit
 *   ids share, so a later heading slugged to an explicit id is suffixed. An explicit id that repeats
 *   an earlier id is kept as written (VitePress refuses to build such a page).
 * @param {string} markdown
 * @param {(s: string) => string} [slug]
 * @returns {Array<{ vp: string, gh: string }>}
 */
export function headingIds(markdown, slug = slugify) {
  const out = [];
  const seenVp = new Set();
  const seenGh = new Set();
  const uniq = (seen, base) => {
    let id = base;
    for (let n = 1; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return id;
  };
  for (const [line] of proseLines(markdown)) {
    const h = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!h) continue;
    const attrs = /[ \t]*\{([^{}]*)\}$/.exec(h[1]);
    const custom = attrs ? /(?:^|\s)#([^\s#.{}]+)/.exec(attrs[1])?.[1] : undefined;
    const gh = uniq(seenGh, githubSlug(headingText(h[1])));
    let vp;
    if (custom !== undefined) {
      vp = custom;
      seenVp.add(custom);
    } else vp = uniq(seenVp, slug(headingText(attrs ? h[1].slice(0, attrs.index) : h[1])));
    out.push({ vp, gh });
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
    // A file VitePress publishes verbatim (`docs-site/public/x` is served at `/x`): a picture a
    // canonical doc shows by its repo path, so the same file renders on GitHub and on the site.
    if (bare.startsWith(PUBLIC)) out = `/${bare.slice(PUBLIC.length)}${query}${frag}`;
    else if (pageRoute.has(bare)) out = pageRoute.get(bare) + query + siteFrag(frag, ctx.sourceOf?.(bare));
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

  /** A relative picture path under `docs-site/public/`, as its site path; `null` for any other. */
  const publicPicture = (url) => {
    if (url.startsWith("/") || url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
    return posix.normalize(posix.join(dir, url.split(/[?#]/)[0])).startsWith(PUBLIC) ? map(url) : null;
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
                // An inline `<img src="…">` (a sized picture in a table cell) is mapped too, but only
                // when it names a file `public/` serves; any other picture is left as it is.
                .replace(/<img src="([^"\s]+)"/g, (whole, t) => {
                  const out = publicPicture(t);
                  return out === null ? whole : `<img src="${out}"`;
                })
                .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/, (_, a, t) => a + map(t)),
        )
        .join("");
    })
    .join("\n");
}
