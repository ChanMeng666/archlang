// Repo-relative markdown links -> site links, for the SITE copies of the canonical docs
// (PAGES and ADRs in sync-docs.mjs). The canonical files link each other by repo path
// (`../CHANGELOG.md`, `language-reference.md#x`, `README.md`), which resolves on GitHub but 404s
// (or only works through a 301) once the file is copied into the site. Pure: no I/O; the repo
// is reached through the injected `kindOf`, and the mapping is DERIVED from the tables passed
// in (never retyped here), so a new page or root copy needs no edit in this file.
import { posix } from "node:path";

const GITHUB = "https://github.com/ChanMeng666/archlang";

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
    const hash = url.indexOf("#");
    const frag = hash < 0 ? "" : url.slice(hash);
    const path = posix.normalize(posix.join(dir, (hash < 0 ? url : url.slice(0, hash)).split("?")[0]));
    if (path.startsWith("..") || path === ".") return target;
    const bare = path.replace(/\/$/, "");
    let out;
    if (pageRoute.has(bare)) out = pageRoute.get(bare) + frag;
    else if (/^docs\/adr\/index\.md$/.test(bare) || bare === "docs/adr") out = "/adr" + frag;
    else if (/^docs\/adr\/[^/]+\.md$/.test(bare)) out = `/adr/${posix.basename(bare, ".md")}` + frag;
    else if (rootPath.has(bare)) out = rootPath.get(bare) + frag;
    else if (bare === "playground/index.html") out = ctx.playground + frag;
    else {
      const kind = ctx.kindOf(bare);
      if (!kind) return target; // dead in the repo too: not ours to invent a target for
      out = `${GITHUB}/${kind === "dir" ? "tree" : "blob"}/main/${bare}${frag}`;
    }
    return (angled ? `<${out}>` : out) + (m[2] ?? "");
  };

  // Fenced code is literal text; inline code spans are skipped per line.
  let fence = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (f) {
        if (fence === null) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        return line;
      }
      if (fence !== null) return line;
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
