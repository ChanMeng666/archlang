/**
 * The pure half of short links (ADR 0034): the caps, the payload codec checks, the content
 * address and the two HTML pages. Nothing here touches a binding or the core, so every rule is
 * unit-tested on its own (`playground/test/share-worker.test.ts`).
 *
 * The payload is exactly what the playground's `encodeSrc` writes after `#z=`:
 * base64url(deflate-raw(UTF-8 source)). The full `#z=` link stays the permanent form; a short
 * link only names one, so `/s/<id>` always lands on `/#z=<payload>`.
 */

/** The longest `POST /api/share` body accepted, in characters (= bytes: the alphabet is ASCII). */
export const PAYLOAD_CAP_CHARS = 64 * 1024;

/**
 * The most UTF-8 bytes a payload may inflate to. A deflate stream can expand a thousandfold, so
 * inflation stops here rather than at the end of the stream. The hosted MCP Worker's source cap
 * (`packages/mcp-worker/src/limits.ts`), three and a half times the largest example
 * (`examples/hillside-villa.arch`, ~18 KB). It bounds the check's `compile()`: measured on a
 * desktop, about 0.5 s for 64 KiB of rooms and 1.8 s for 256 KiB.
 */
export const SOURCE_CAP_BYTES = 64 * 1024;

/** `POST /api/share` per address per period (the `RATE_SHARE` binding in wrangler.jsonc). */
export const SHARE_PER_PERIOD = 30;
/** The rate period, in seconds: one of the two the binding allows. */
export const RATE_PERIOD_SECONDS = 60;

/** The shortest id: 8 base62 characters, about 47.6 bits. */
export const ID_MIN = 8;
/** The longest id: the whole base62 SHA-256 (62^43 > 2^256). */
export const ID_MAX = 43;
/** A title longer than this is cut, so the KV metadata stays far under its 1024-byte limit. */
export const TITLE_MAX = 120;
/** What a plan with no usable name is called on its card. */
export const DEFAULT_TITLE = "ArchLang plan";

const B64URL = /^[A-Za-z0-9_-]+$/;
const ID = /^[0-9A-Za-z]{8,43}$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Is `s` shaped like a short-link id (8–43 base62 characters)? */
export const isShareId = (s: string): boolean => ID.test(s);

/** The KV key a share is stored under. */
export const shareKey = (id: string): string => `s:${id}`;

/** Why a payload was refused, before any plan is read. */
export type PayloadFault = "bad_payload" | "source_too_large";

/** base64url → bytes, or null when `s` is not base64url (or is a length no encoder writes). */
export function b64urlToBytes(s: string): Uint8Array | null {
  if (!B64URL.test(s) || s.length % 4 === 1) return null;
  let bin: string;
  try {
    bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Inflate a raw-deflate stream, stopping as soon as the output passes `cap` bytes. Returns the
 * bytes, `"source_too_large"` past the cap, or `"bad_payload"` for a stream that does not inflate.
 */
export async function inflateCapped(bytes: Uint8Array, cap: number): Promise<Uint8Array | PayloadFault> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // The write side's promises reject with the read side when the stream is corrupt; the read
  // loop below reports that, so these are only kept from becoming unhandled rejections.
  writer.write(bytes as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return "source_too_large";
      }
      chunks.push(value);
    }
  } catch {
    return "bad_payload";
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * The plan source a payload carries, or why it cannot be read: not base64url, not a raw-deflate
 * stream, not UTF-8, or inflating past {@link SOURCE_CAP_BYTES}.
 */
export async function decodePayload(payload: string, cap = SOURCE_CAP_BYTES): Promise<string | PayloadFault> {
  const bytes = b64urlToBytes(payload);
  if (!bytes) return "bad_payload";
  const raw = await inflateCapped(bytes, cap);
  if (typeof raw === "string") return raw;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return "bad_payload";
  }
}

/** A 256-bit digest as 43 base62 digits, most significant first, zero-padded. */
export function base62(digest: Uint8Array): string {
  let n = 0n;
  for (const b of digest) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < ID_MAX; i++) {
    out = ALPHABET[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

/**
 * The content address of a plan: base62 of SHA-256 over its UTF-8 source. The source, not the
 * payload, is hashed: deflate output depends on the encoder (the CLI's zlib at level 9, a
 * browser's `CompressionStream` at its default, and zlib builds differ), so hashing the payload
 * would give one plan a different link per browser. Hashing what the payload decodes to gives it
 * one link everywhere.
 */
export async function sourceHash(source: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return base62(new Uint8Array(digest));
}

/** The title a share's card shows: the plan's name, whitespace collapsed and capped. */
export function planTitle(name: string | undefined): string {
  const t = (name ?? "").replace(/\s+/g, " ").trim();
  if (t === "") return DEFAULT_TITLE;
  const chars = [...t];
  return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX - 1).join("")}…` : t;
}

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for an HTML text node or a quoted attribute value. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);
}

/** What `/s/<id>` needs to describe its plan to a crawler. */
export interface SharePage {
  /**
   * The request's origin: `https://playground.archlang.uk` when deployed. Under `wrangler dev` the
   * route's custom domain is reported too (`http://playground.archlang.uk`), not the local address.
   */
  origin: string;
  id: string;
  /** The payload, already validated as base64url when it was stored. */
  payload: string;
  title: string;
  /** The card's image, absolute; width and height when known. */
  image: { url: string; width?: number; height?: number };
}

const DESCRIPTION = "A floor plan written in ArchLang. Open it in the playground to read and edit its source.";

/**
 * The page `/s/<id>` answers: card metadata for a crawler (which runs no script), then straight
 * on to the editor with the plan in its `#z=` fragment. `location.replace` keeps the short link
 * out of the back button; the `<noscript>` refresh and the visible link cover a browser with
 * scripts off.
 */
export function sharePageHtml(p: SharePage): string {
  const url = `${p.origin}/s/${p.id}`;
  const target = `/#z=${p.payload}`;
  const title = escapeHtml(p.title);
  const img = escapeHtml(p.image.url);
  const size =
    p.image.width && p.image.height
      ? `\n<meta property="og:image:width" content="${p.image.width}">\n<meta property="og:image:height" content="${p.image.height}">`
      : "";
  // The payload is base64url (checked when stored), so it needs no escaping in a URL, an
  // attribute or a script string; JSON.stringify plus `<` escaping is the belt to that brace.
  const js = JSON.stringify(target).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ArchLang playground</title>
<meta name="description" content="${DESCRIPTION}">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ArchLang playground">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${img}">${size}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${DESCRIPTION}">
<meta name="twitter:image" content="${img}">
<noscript><meta http-equiv="refresh" content="0; url=${escapeHtml(target)}"></noscript>
<script>location.replace(${js});</script>
</head>
<body>
<p><a href="${escapeHtml(target)}">Open ${title} in the ArchLang playground</a></p>
</body>
</html>
`;
}

/** The page an unknown or malformed id answers, with a way on to the playground. */
export function notFoundHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shared plan not found · ArchLang playground</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
</head>
<body>
<h1>Shared plan not found</h1>
<p>No plan is stored under this short link. A full link, the kind with <code>#z=</code> in it, needs no server and keeps working.</p>
<p><a href="/">Open the ArchLang playground</a></p>
</body>
</html>
`;
}
