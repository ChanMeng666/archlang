// @ts-check
/**
 * A plan's picker label, split for the gallery (ruling PG-D2): the clean name, and the trailing
 * parenthetical, if there is one, as a small tag ("Clinic (place ×6)" → "Clinic" + "place ×6").
 * The labels in `EXAMPLE_ROWS` (src/examples.ts) are never edited for this; the split is derived.
 *
 * Plain JavaScript so that `scripts/gen-static.mjs`, which writes the gallery's cards into the
 * served page from Node with no TypeScript loader, and `gallery.ts` share this one rule.
 *
 * @param {string} label
 * @returns {{ name: string, tag: string | null }}
 */
export function splitLabel(label) {
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(label);
  return m ? { name: m[1], tag: m[2] } : { name: label, tag: null };
}

/**
 * What a card says, in order: the name, then, for a tagged label, the tag between a visually
 * hidden " (" and ")". Read together (a link's text, its accessible name, what a crawler sees)
 * the pieces are the label itself, "Clinic (place ×6)", never "Clinicplace ×6"; on screen the tag
 * is a grey line under the name. `gen-static.mjs` and `gallery.ts` both render cards from this.
 *
 * @param {string} label
 * @returns {{ name: string, tag: null | { open: string, text: string, close: string } }}
 */
export function cardText(label) {
  const { name, tag } = splitLabel(label);
  return { name, tag: tag === null ? null : { open: " (", text: tag, close: ")" } };
}
