// Metric 2 support: locate a package's own source repository and fetch the
// snapshot that corresponds to the published version, so a file vendored into
// the tarball can be compared against the source it was copied from.

/**
 * Parse a package.json `repository` field into a GitHub coordinate.
 * @returns {{owner:string, repo:string, dir:string|null}|null}
 */
export function githubRepo(repository) {
  if (!repository) return null;
  const raw = typeof repository === "string" ? repository : repository.url || "";
  const dir = typeof repository === "object" ? repository.directory || null : null;
  const m =
    /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(raw) ||
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(raw.replace(/^github:/, ""));
  if (!m) return null;
  return { owner: m[1], repo: m[2], dir: dir ? dir.replace(/^\.?\//, "").replace(/\/$/, "") : null };
}

/**
 * Tag names a project plausibly used for `version`, in the order they are tried.
 * Monorepos tag `<pkg>@<version>`; single packages tag `v<version>`.
 */
export function candidateTags(version, pkgName) {
  const base = pkgName.includes("/") ? pkgName.slice(pkgName.indexOf("/") + 1) : pkgName;
  return [
    `v${version}`,
    version,
    `${pkgName}@${version}`,
    `${base}@${version}`,
    `${base}-v${version}`,
    `${base}/v${version}`,
    `release-${version}`,
  ];
}

/** codeload URL for a tag (or, as a labelled fallback, a branch). */
export function codeloadTag(owner, repo, tag) {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/tags/${encodeURIComponent(tag)}`;
}

export function codeloadBranch(owner, repo, branch) {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${encodeURIComponent(branch)}`;
}

/**
 * Files whose divergence from the repository would NOT be evidence of drift:
 * npm rewrites the manifest, and lockfiles/build outputs are expected to differ.
 */
export function isComparable(rel) {
  if (rel === "package.json") return false;
  if (/(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(rel)) return false;
  if (/(^|\/)node_modules\//.test(rel)) return false;
  return /\.(md|mdx|json|gbnf|txt|ya?ml|toml|graphql|proto|xsd)$/i.test(rel);
}

/** Compare two buffers after normalising line endings and a trailing newline. */
export function textEqual(a, b) {
  const norm = (x) => x.toString("utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "\n");
  return norm(a) === norm(b);
}

/** A few lines of unified-ish diff, enough to judge a positive by eye. */
export function diffExcerpt(a, b, maxLines = 8) {
  const A = a.toString("utf8").replace(/\r\n/g, "\n").split("\n");
  const B = b.toString("utf8").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const n = Math.max(A.length, B.length);
  for (; i < n && out.length < maxLines * 2; i++) {
    if (A[i] === B[i]) continue;
    if (A[i] !== undefined) out.push("- " + A[i].slice(0, 160));
    if (B[i] !== undefined) out.push("+ " + B[i].slice(0, 160));
  }
  return { lines: out.slice(0, maxLines * 2), tarballLines: A.length, repoLines: B.length };
}
