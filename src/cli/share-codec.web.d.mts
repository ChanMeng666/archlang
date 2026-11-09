/** Types for `share-codec.web.mjs`, the Web-standard decoder of the `#z=` share payload. */

/** The hash param that opens the playground in edit mode, as `#z=<payload>&edit`. */
export declare const PLAYGROUND_EDIT_FLAG: "edit";

/** Why a payload was refused, before any plan is read. */
export type PayloadFault = "bad_payload" | "source_too_large";

/**
 * Inflate a raw-deflate stream, stopping as soon as the output passes `cap` bytes: the bytes,
 * `"source_too_large"` past the cap, or `"bad_payload"` for a stream that does not inflate.
 */
export declare function inflateCapped(bytes: Uint8Array, cap: number): Promise<Uint8Array | PayloadFault>;

/** bytes → base64url (no padding). */
export declare function toBase64Url(bytes: Uint8Array): string;

/** base64url (no padding) → bytes. Throws on a character outside the alphabet. */
export declare function fromBase64Url(hash: string): Uint8Array;

/**
 * Decode a `#z=` payload back to plan source with `DecompressionStream` (no Node built-ins), on
 * {@link inflateCapped}. A refusal is a returned code, never a throw.
 */
export declare function decodePlanHashWeb(hash: string, opts?: { maxBytes?: number }): Promise<string | PayloadFault>;
