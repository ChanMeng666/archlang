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
export function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBytes(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeStream(stream, bytes) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Decode the plan source from `hash` (`#z=…` compressed, or legacy `#src=…`).
 *  Returns null when neither token is present or decoding fails. */
export async function srcFromHash(hash = location.hash) {
  const z = hash.match(/[#&]z=([^&]*)/);
  if (z) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const bytes = await pipeStream(new DecompressionStream("deflate-raw"), b64urlToBytes(z[1]));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
  // Legacy `#src=` — base64url of the UTF-8 bytes (back-compat).
  const m = hash.match(/[#&]src=([^&]*)/);
  if (!m) return null;
  try {
    return new TextDecoder().decode(b64urlToBytes(m[1]));
  } catch {
    return null;
  }
}

/** Encode `src` to a hash fragment (`#z=…`, or `#src=…` on ancient browsers). */
export async function encodeSrc(src) {
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

/** Rewrite the browser's URL hash to carry `src` (replaceState — one entry, no
 *  history spam on every keystroke). */
export async function updateHash(src) {
  const hash = await encodeSrc(src);
  // NB: in main.js `history` is shadowed by CodeMirror's import, so callers reach
  // the global via `window.history`; here we do the same for safety.
  window.history.replaceState(null, "", hash);
}
