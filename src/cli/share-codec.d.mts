/** Types for `share-codec.mjs`, the one Node encoder of the playground's `#z=` share link. */

/** The production playground origin every minted link points at (no trailing slash). */
export declare const PLAYGROUND_ORIGIN: "https://playground.archlang.uk";

/** The hash param that opens the playground in edit mode, as `#z=<payload>&edit` (defined in `share-codec.web.mjs`). */
export { PLAYGROUND_EDIT_FLAG } from "./share-codec.web.mjs";

/** Encode plan source into the `#z=` share payload (base64url of the raw-deflated UTF-8). */
export declare function encodePlanHash(source: string): string;

/** Decode a `#z=` payload back to plan source. The inverse of {@link encodePlanHash}. */
export declare function decodePlanHash(hash: string): string;
