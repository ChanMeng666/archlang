/** Minimal HTML-escaping for the innerHTML the playground panels build by hand. */

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ENTITIES[c] ?? c);
}
