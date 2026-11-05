/**
 * The most storeys one `arch import` writes. OpenPlan3D sets no limit, but the tallest buildings
 * have under 200, and every storey is a whole drawing for ArchLang: a file with more is refused
 * with `E_IMPORT_LIMIT` before any storey is built, rather than turned into thousands of pages.
 * A leaf module, so the error catalogue can state it without importing the importer.
 */
export const MAX_IMPORT_LEVELS = 200;
