/**
 * URL-hash share codec — the single source of truth for round-tripping a plan's
 * source through the address bar with no backend. Shared by the main playground
 * (`main.js`) and the chrome-less embed page (`embed.js`) so a `#z=` link works
 * identically on both.
 *
 * Scheme: `#z=<base64url(deflate-raw(utf8))>` — compressed so larger plans fit the
 * address bar. The legacy raw `#src=<base64url(utf8)>` form is still *read* so
 * previously-shared links keep working forever.
 *
 * The DECODE side (base64url, the bounded inflater, the id shape, the edit flag) is the core's
 * `archlang/share` subpath, which the short-link Worker and the hosted MCP Worker read too. The
 * ENCODER stays here: `CompressionStream` output is the browser's own, and
 * `test/share-codec.test.ts` pins it to the scheme.
 */
import { fromBase64Url, inflateCapped, isShareId, PLAYGROUND_EDIT_FLAG, toBase64Url } from "archlang/share";

/** base64url ⇄ bytes (UTF-8-safe; no `escape`/`unescape`), the core's pair under this module's names. */
export const bytesToB64url: (bytes: Uint8Array) => string = toBase64Url;
export const b64urlToBytes: (b64: string) => Uint8Array = fromBase64Url;

async function pipeStream(stream: CompressionStream, bytes: Uint8Array): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  w.write(bytes as BufferSource);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * The most UTF-8 bytes a link may inflate to in the browser. A deflate stream expands a
 * thousandfold, so inflation stops here, not at the end of the stream (200 MB of spaces is a
 * 272 KB fragment). Sixty times the largest bundled example; the share Worker holds its own,
 * lower `SOURCE_CAP_BYTES`.
 */
export const LINK_INFLATE_CAP_BYTES = 1024 * 1024;

/** What the page says when a link is refused for its size. */
export const LINK_TOO_LARGE_NOTICE = "This link is too large to open";

/** What a hash carries: its source, nothing, or a refusal for size. */
export type HashRead = { src: string } | { refused: "too_large" } | null;

/** Like {@link srcFromHash}, but tells "too large" apart from "no plan here". Never throws. */
export async function readHash(hash: string = location.hash): Promise<HashRead> {
  const z = hash.match(/[#&]z=([^&]*)/);
  if (z) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const bytes = z[1]! === "" ? null : b64urlToBytes(z[1]!);
      if (!bytes) return null;
      const raw = await inflateCapped(bytes, LINK_INFLATE_CAP_BYTES);
      if (raw === "source_too_large") return { refused: "too_large" };
      if (typeof raw === "string") return null;
      return { src: new TextDecoder().decode(raw) };
    } catch {
      return null;
    }
  }
  // Legacy `#src=` — base64url of the UTF-8 bytes (back-compat). Not compressed, so the
  // address bar's own length bounds it.
  const m = hash.match(/[#&]src=([^&]*)/);
  if (!m) return null;
  try {
    return { src: new TextDecoder().decode(b64urlToBytes(m[1]!)) };
  } catch {
    return null;
  }
}

/** Decode the plan source from `hash` (`#z=…` compressed, or legacy `#src=…`).
 *  Returns null when neither token is present, decoding fails or the link is too large. */
export async function srcFromHash(hash: string = location.hash): Promise<string | null> {
  const r = await readHash(hash);
  return r && "src" in r ? r.src : null;
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
    return typeof body.id === "string" && isShareId(body.id) ? `${origin}/s/${body.id}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The short-link id in a hash (`#s=<id>`, also after other `&`-joined params), or null. */
export function shareIdFromHash(hash: string): string | null {
  const m = hash.match(/[#&]s=([^&]*)/);
  return m && isShareId(m[1]!) ? m[1]! : null;
}

/**
 * The plan source a hash carries: `#z=`/`#src=` read in place, or `#s=<id>` fetched from this
 * site's server (`GET /api/share/<id>`). Null when there is none or it cannot be read.
 */
export async function sharedSource(
  hash: string = location.hash,
  origin: string = location.origin,
): Promise<string | null> {
  const r = await readShared(hash, origin);
  return r && "src" in r ? r.src : null;
}

/** Like {@link sharedSource}, but tells "too large" (inline or fetched) apart from "no plan". */
export async function readShared(hash: string = location.hash, origin: string = location.origin): Promise<HashRead> {
  const inline = await readHash(hash);
  if (inline !== null) return inline;
  const id = shareIdFromHash(hash);
  if (!id) return null;
  try {
    const res = await fetch(`${origin}/api/share/${id}`);
    if (!res.ok) return null;
    const { z } = (await res.json()) as { z?: unknown };
    return typeof z === "string" && /^[A-Za-z0-9_-]+$/.test(z) ? readHash(`#z=${z}`) : null;
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

/** The hash param that opens edit mode (the core's `PLAYGROUND_EDIT_FLAG`, the one `arch link` mints). */
export const EDIT_FLAG = PLAYGROUND_EDIT_FLAG;
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
