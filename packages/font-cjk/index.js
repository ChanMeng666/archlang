// @chanmeng666/archlang-font-cjk — the optional CJK face ArchLang's PDF and PNG
// backends fall back to. Node-only: it resolves a file path, and the core reaches it
// through a lazy, bundler-ignored `import()` that never runs in a browser.
import { fileURLToPath } from "node:url";

/** Absolute path of the bundled OpenType (CFF) font file. */
export const fontPath = fileURLToPath(new URL("./ArchLangCJKSans-Regular.otf", import.meta.url));

/** The font's family name (name IDs 1 and 16). */
export const fontFamily = "ArchLang CJK Sans";

/** The font's PostScript name (name ID 6). */
export const postscriptName = "ArchLangCJKSans-Regular";
