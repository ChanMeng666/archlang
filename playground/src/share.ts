/**
 * URL-hash share codec — the single source of truth for round-tripping a plan's
 * source through the address bar with no backend. Shared by the main playground
 * (`main.js`) and the chrome-less embed page (`embed.js`) so a `#z=` link works
 * identically on both.
 *
 * Scheme: `#z=<base64url(deflate-raw(utf8))>` — compressed so larger plans fit the
 * address bar. The legacy raw `#src=<base64url(utf8)>` form is still *read* so
 * previously-shared links keep working forever.
 */

/** base64url ⇄ bytes (UTF-8-safe; no `escape`/`unescape`). */
export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeStream(stream: CompressionStream | DecompressionStream, bytes: Uint8Array): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  w.write(bytes as BufferSource);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Decode the plan source from `hash` (`#z=…` compressed, or legacy `#src=…`).
 *  Returns null when neither token is present or decoding fails. */
export async function srcFromHash(hash: string = location.hash): Promise<string | null> {
  const z = hash.match(/[#&]z=([^&]*)/);
  if (z) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const bytes = await pipeStream(new DecompressionStream("deflate-raw"), b64urlToBytes(z[1]!));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
  // Legacy `#src=` — base64url of the UTF-8 bytes (back-compat).
  const m = hash.match(/[#&]src=([^&]*)/);
  if (!m) return null;
  try {
    return new TextDecoder().decode(b64urlToBytes(m[1]!));
  } catch {
    return null;
  }
}

/** Encode `src` to a hash fragment (`#z=…`, or `#src=…` on ancient browsers). */
export async function encodeSrc(src: string): Promise<string> {
  const utf8 = new TextEncoder().encode(src);
  try {
    if (typeof CompressionStream !== "undefined") {
      const bytes = await pipeStream(new CompressionStream("deflate-raw"), utf8);
      return `#z=${bytesToB64url(bytes)}`;
    }
  } catch {
    /* fall through to the uncompressed form */
  }
  return `#src=${bytesToB64url(utf8)}`;
}

// ---------------------------------------------------------------------------
// Short links (ADR 0034). A short link NAMES a `#z=` link: the plan is stored on this site's
// server only when the user asks for one, and `/s/<id>` always lands on the full form, which
// keeps working with no server at all.

/** How long a short-link request may take before the full link is used instead. */
export const SHORT_LINK_TIMEOUT_MS = 5000;

const SHARE_ID = /^[0-9A-Za-z]{8,43}$/;

/**
 * Ask this site's server for a short link to the plan in `hash` (a `#z=` fragment). Resolves to
 * the `/s/<id>` URL, or null on any failure (no `#z=`, offline, refused, slow, a host with no
 * server such as `vite preview`) so the caller falls back to the full link.
 */
export async function createShortLink(
  hash: string,
  origin: string = location.origin,
  timeoutMs: number = SHORT_LINK_TIMEOUT_MS,
): Promise<string | null> {
  const z = hash.match(/^#z=([A-Za-z0-9_-]+)$/);
  if (!z) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/api/share`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: z[1],
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === "string" && SHARE_ID.test(body.id) ? `${origin}/s/${body.id}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The short-link id in a hash (`#s=<id>`, also after other `&`-joined params), or null. */
export function shareIdFromHash(hash: string): string | null {
  const m = hash.match(/[#&]s=([^&]*)/);
  return m && SHARE_ID.test(m[1]!) ? m[1]! : null;
}

/**
 * The plan source a hash carries: `#z=`/`#src=` read in place, or `#s=<id>` fetched from this
 * site's server (`GET /api/share/<id>`). Null when there is none or it cannot be read.
 */
export async function sharedSource(
  hash: string = location.hash,
  origin: string = location.origin,
): Promise<string | null> {
  const inline = await srcFromHash(hash);
  if (inline !== null) return inline;
  const id = shareIdFromHash(hash);
  if (!id) return null;
  try {
    const res = await fetch(`${origin}/api/share/${id}`);
    if (!res.ok) return null;
    const { z } = (await res.json()) as { z?: unknown };
    return typeof z === "string" && /^[A-Za-z0-9_-]+$/.test(z) ? srcFromHash(`#z=${z}`) : null;
  } catch {
    return null;
  }
}

// ---- the mode flag ------------------------------------------------------------------
//
// The playground opens in VIEW mode (the drawing fills the page). `edit` in the hash opens it
// in EDIT mode (the editor beside the drawing): `#z=<token>&edit`, or `#edit` alone on a
// hash-less visit. It is a bare `&`-joined param, like embed.html's `editable=1`, so the token
// readers above (`[#&]z=([^&]*)`) read the plan out of `#z=<token>&edit` unchanged. `arch link`
// and the docs' "Open in playground" mint it; a link copied from the playground never carries
// it, so a plan someone shares with you opens in view mode.
//
// `3d` (public-surfaces card X5) opens the 3D preview in place of the drawing: `#z=<token>&3d`,
// or `#3d` alone (the plan a hash-less visit opens, in 3D). The hash carries it while the 3D
// preview is on screen, and, unlike `edit`, a copied full link keeps it, so a visitor can share
// the 3D view they are looking at. Both flags go after every other param, `3d` before `edit`,
// whichever was set last.

/** The hash param that opens edit mode. */
export const EDIT_FLAG = "edit";
/** The hash param that opens the 3D preview. */
export const VIEW3D_FLAG = "3d";

const paramsOf = (hash: string): string[] => hash.replace(/^#/, "").split("&");

/** Whether `hash` asks for edit mode (`#edit`, or `&edit` among other params). */
export function hasEditFlag(hash: string): boolean {
  return paramsOf(hash).some((p) => p === EDIT_FLAG);
}

/** Whether `hash` asks for the 3D preview (`#3d`, or `&3d` among other params). */
export function has3dFlag(hash: string): boolean {
  return paramsOf(hash).some((p) => p === VIEW3D_FLAG);
}

/** `hash` with each flag as given: every other param in order, then `3d`, then `edit`. */
function withFlags(hash: string, view3d: boolean, edit: boolean): string {
  const params = paramsOf(hash).filter((p) => p !== "" && p !== EDIT_FLAG && p !== VIEW3D_FLAG);
  if (view3d) params.push(VIEW3D_FLAG);
  if (edit) params.push(EDIT_FLAG);
  return params.length > 0 ? `#${params.join("&")}` : "";
}

/**
 * `hash` with the edit flag set (`on`) or removed, every other param kept in order. The flag
 * goes last, so `#z=<token>` becomes `#z=<token>&edit`. "" when nothing is left.
 */
export function setEditFlag(hash: string, on: boolean): string {
  return withFlags(hash, has3dFlag(hash), on);
}

/**
 * `hash` with the 3D flag set (`on`) or removed, every other param kept in order. It goes after
 * the plan's token and before `edit`: `#z=<token>&edit` becomes `#z=<token>&3d&edit`.
 */
export function set3dFlag(hash: string, on: boolean): string {
  return withFlags(hash, on, hasEditFlag(hash));
}

/** A flag's value, or a function read when the hash is written. */
type Flag = boolean | (() => boolean);
const read = (f: Flag): boolean => (typeof f === "function" ? f() : f);

/** Rewrite the browser's URL hash to carry `src` (replaceState — one entry, no
 *  history spam on every keystroke). `edit` keeps the edit-mode flag after the token and
 *  `view3d` the 3D flag; without them the hash is exactly `encodeSrc(src)`, as it always was.
 *  Given as functions, the flags are read after the (async) compression, at the write: a mode
 *  or view switched meanwhile has already written its flag, and this must not put back the old. */
export async function updateHash(src: string, edit: Flag = false, view3d: Flag = false): Promise<void> {
  const token = await encodeSrc(src);
  const hash = withFlags(token, read(view3d), read(edit));
  // NB: in main.js `history` is shadowed by CodeMirror's import, so callers reach
  // the global via `window.history`; here we do the same for safety.
  window.history.replaceState(null, "", hash);
}

/** `href` as a link to share: the plan token and the 3D flag kept, the edit-mode flag dropped. */
export function shareableHref(href: string = location.href): string {
  const at = href.indexOf("#");
  return at < 0 ? href : href.slice(0, at) + setEditFlag(href.slice(at), false);
}
