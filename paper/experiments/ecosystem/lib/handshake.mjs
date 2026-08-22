// Metric 1 detector: find the version literal a package passes into the MCP
// SDK's server handshake (`new Server({name, version})` / `new McpServer(...)`)
// and decide whether it is HARDCODED (can drift from package.json) or DERIVED
// (read from package.json / env at runtime, so it cannot drift).

const CTOR_RE =
  /new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?(Server|McpServer|MCPServer|MCPServerBase)\s*\(/g;

// The `Implementation` object shape, used as a lower-confidence fallback when a
// minifier has renamed the constructor.
const SHAPE_RE =
  /\{\s*name\s*:\s*(["'`])((?:(?!\1).)*)\1\s*,\s*(?:title\s*:\s*["'`](?:[^"'`]*)["'`]\s*,\s*)?version\s*:\s*(["'`])((?:(?!\3).)*)\3/g;

// Keys that mark an object as an npm package manifest rather than an MCP
// `Implementation` — bundlers inline whole `package.json` files into output.
const MANIFEST_KEYS =
  /["']?(?:main|module|description|license|dependencies|devDependencies|peerDependencies|scripts|repository|types|typings|exports|engines|keywords|author|homepage|bugs|funding|private|files|workspaces|packageManager|publishConfig|sideEffects)["']?\s*:/;

// Signals that a `{name, version}` object is a CLIENT's `Implementation`.
// A manifest object being SERIALISED or WRITTEN is likewise not a handshake.
const SERIALISED_CONTEXT = /JSON\.stringify\s*\(\s*$|writeFileSync\s*\([^)]{0,80}$/;

const CLIENT_CONTEXT = /\bClient\s*\(\s*$|clientInfo\s*:\s*$|\bClient\s*\(\s*\{?\s*$/;

/** Read a balanced `(...)` region starting at the index of the open paren. */
function balanced(src, openIdx, cap = 4000) {
  let depth = 0;
  const end = Math.min(src.length, openIdx + cap);
  for (let i = openIdx; i < end; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < end && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
    }
  }
  return src.slice(openIdx, end);
}

// Right-hand sides that prove the version is computed at runtime rather than typed.
const DERIVED_HINTS =
  /package\.json|packageJson|\bpkg\b|readFileSync|require\s*\(|await\s+import|createRequire|__dirname|import\.meta|process\.env|npm_package_version/;

/**
 * Resolve `version: <identifier>` by finding a binding of a string literal in
 * the same file.
 * @returns {{kind: 'literal'|'derived'|'unresolved', value?: string, via?: string}}
 */
function resolveIdent(src, ident) {
  // identifiers carry no regex metacharacters, so no escaping is needed
  const re = new RegExp("(?:const|let|var)\\s+" + ident + "\\s*=\\s*([^;\\n]{0,200})");
  const m = re.exec(src);
  if (!m) return { kind: "unresolved" };
  const rhs = m[1].trim();
  const lit = /^(["'`])((?:(?!\1).)*)\1/.exec(rhs);
  if (lit) return { kind: "literal", value: lit[2], via: ident + " = " + lit[0] };
  if (DERIVED_HINTS.test(rhs)) return { kind: "derived", via: ident + " = " + rhs.slice(0, 80) };
  return { kind: "unresolved", via: ident + " = " + rhs.slice(0, 80) };
}

/**
 * Extract handshake version sites from one source file.
 * @param {string} src file contents
 * @param {string} file path inside the tarball
 * @returns {Array<object>} one entry per constructor site that names a version
 */
export function findHandshakeSites(src, file) {
  const sites = [];

  CTOR_RE.lastIndex = 0;
  let m;
  while ((m = CTOR_RE.exec(src))) {
    const openIdx = CTOR_RE.lastIndex - 1;
    const region = balanced(src, openIdx);
    const nameM = /\bname\s*:\s*(["'`])((?:(?!\1).)*)\1/.exec(region);
    const vStrM = /\bversion\s*:\s*(["'`])((?:(?!\1).)*)\1/.exec(region);
    const vIdM = /\bversion\s*:\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/.exec(region);
    let kind = "unresolved";
    let version = null;
    let via = null;
    if (vStrM) {
      kind = "literal";
      version = vStrM[2];
    } else if (vIdM) {
      const expr = vIdM[1].replace(/\s+/g, "");
      via = expr;
      if (expr.includes(".")) {
        // `pkg.version` is provably a runtime read; `version_1.VERSION` is a
        // cross-module binding that may itself be a hardcoded literal, so it
        // stays UNRESOLVED here and is settled by the package-wide pass.
        kind = DERIVED_HINTS.test(expr) ? "derived" : "unresolved";
      } else {
        const r = resolveIdent(src, expr);
        kind = r.kind;
        version = r.value ?? null;
        via = r.via ?? expr;
      }
    } else {
      continue; // constructor call names no version at all
    }
    // A scaffolding tool that EMITS server code holds the constructor inside a
    // template; its `name` is an interpolation, and its version describes the
    // code it generates, not the package that generates it.
    if (nameM && /\$\{|<%|\{\{/.test(nameM[2])) continue;
    sites.push({
      tier: "A",
      file,
      ctor: m[1],
      name: nameM ? nameM[2] : null,
      kind,
      version,
      via,
      excerpt: region.replace(/\s+/g, " ").slice(0, 220),
    });
    if (sites.length >= 8) break;
  }

  if (sites.length === 0) {
    SHAPE_RE.lastIndex = 0;
    let s;
    while ((s = SHAPE_RE.exec(src))) {
      // `{name, version}` also describes an inlined package MANIFEST, which
      // bundlers embed verbatim. A manifest carries neighbouring keys an
      // MCP Implementation object never does — reject on any of them.
      const after = src.slice(s.index, s.index + s[0].length + 160);
      if (MANIFEST_KEYS.test(after)) continue;
      // `{name, version}` is ALSO the shape of `Implementation` on the CLIENT
      // side. A package that bridges to another MCP server constructs one, and
      // its version is no self-description of this package. Tier A cannot hit
      // this (it matches only Server constructors); Tier B has no constructor
      // to look at, so use the surrounding context.
      const before = src.slice(Math.max(0, s.index - 200), s.index);
      if (SERIALISED_CONTEXT.test(before)) continue;
      if (CLIENT_CONTEXT.test(before) || /^\s*\}\s*,[\s\S]{0,120}?\.connect\s*\(/.test(after.slice(s[0].length)))
        continue;
      if (/(^|[^a-z])client([^a-z]|$)/i.test(s[2])) continue;
      sites.push({
        tier: "B",
        file,
        ctor: null,
        name: s[2],
        kind: "literal",
        version: s[4],
        via: null,
        excerpt: src.slice(s.index, s.index + 200).replace(/\s+/g, " "),
      });
      if (sites.length >= 5) break;
    }
  }
  return sites;
}

// Names that look like a version binding: `VERSION`, `SERVER_VERSION`,
// `pkgVersion`, `mcpServerVersion`. A bare lowercase `version` is excluded —
// it is the key on every options object and would resolve to noise.
const VERSION_BINDING = /^(?:[\w$]*_)?(?:[A-Za-z$][\w$]*)?(?:VERSION|Version)$/;

const BINDING_RE =
  /(?:exports\.|module\.exports\.|export\s+(?:const|let|var)\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{0,200})/g;

/**
 * Collect package-wide bindings of version-shaped names, so a handshake that
 * reads `version_1.SERVER_VERSION` can be settled as hardcoded or runtime-read
 * instead of being guessed from the expression's spelling.
 * @returns {Map<string, {kind:'literal'|'derived'|'ambiguous', value?:string, file:string}>}
 */
export function collectVersionBindings(src, file, into = new Map()) {
  BINDING_RE.lastIndex = 0;
  let m;
  while ((m = BINDING_RE.exec(src))) {
    const name = m[1];
    if (!VERSION_BINDING.test(name)) continue;
    const rhs = m[2].trim();
    const lit = /^(["'`])((?:(?!\1).)*)\1/.exec(rhs);
    let entry;
    if (lit) entry = { kind: "literal", value: lit[2], file };
    else if (DERIVED_HINTS.test(rhs)) entry = { kind: "derived", file };
    else continue;
    const prev = into.get(name);
    if (!prev) into.set(name, entry);
    else if (prev.kind !== entry.kind || prev.value !== entry.value)
      into.set(name, { kind: "ambiguous", file: prev.file });
  }
  return into;
}

/** Last identifier segment of a member expression (`a.b.C` -> `C`). */
export function lastSegment(expr) {
  const parts = String(expr || "").split(".");
  return parts[parts.length - 1] || "";
}
