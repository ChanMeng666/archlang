/**
 * The unified-diff helper now lives in the pure core (`src/unified-diff.ts`) so the CLI
 * (`arch fix`'s diff preview) and the dataset generator share one implementation. This
 * module stays as the dataset layer's import point — and, like every other file under
 * `dataset/`, it reaches the core only through `../src/index.js`.
 */

export { unifiedDiff } from "../src/index.js";
