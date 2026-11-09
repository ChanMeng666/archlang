/** Types for `share-codec.web.mjs`, the Web-standard decoder of the `#z=` share payload. */

/** The hash param that opens the playground in edit mode, as `#z=<payload>&edit`. */
export declare const PLAYGROUND_EDIT_FLAG: "edit";

/** Thrown by {@link decodePlanHashWeb} when the inflated source would exceed `maxBytes`. */
export declare class PlanHashTooLarge extends RangeError {
  constructor(maxBytes: number);
  readonly maxBytes: number;
}

/** bytes → base64url (no padding). */
export declare function toBase64Url(bytes: Uint8Array): string;

/** base64url (no padding) → bytes. Throws on a character outside the alphabet. */
export declare function fromBase64Url(hash: string): Uint8Array;

/** Decode a `#z=` payload back to plan source with `DecompressionStream` (no Node built-ins). */
export declare function decodePlanHashWeb(hash: string, opts?: { maxBytes?: number }): Promise<string>;
