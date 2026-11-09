/**
 * The one way a compiled SVG string becomes a DOM node in a browser surface: parse it as XML and
 * drop anything that could run. The compiler never emits such nodes (its escaping is sound); this
 * is the second layer. Three byte-identical copies exist, because the surfaces cannot share an
 * import (the web component is published with the core as its only peer, the MCP viewer is its
 * own esbuild bundle): `playground/src/`, `packages/web-component/src/` and
 * `packages/mcp-worker/src/viewer/`. `test/svg-sanitize.test.ts` holds them equal; change all three.
 */

/** Elements removed with their subtree. */
const BLOCKED = new Set(["script", "foreignobject"]);

/** Attributes whose value is a URL (`href`, `xlink:href`). */
const isHref = (name: string): boolean => /(^|:)href$/i.test(name);

/** A `javascript:` URL: URL parsing skips C0 controls and spaces, leading and inside (a tab splits nothing). */
const isJsUrl = (value: string): boolean =>
  Array.from(value)
    .filter((c) => c.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase()
    .startsWith("javascript:");

/** The parser and the document that adopts the result; the browser's own unless a test passes others. */
export interface SvgEnv {
  parser: DOMParser;
  doc: Document;
}

/**
 * Parse `text` as SVG and return its root element, adopted into `env.doc`, with every
 * `<script>`/`<foreignObject>`, every `on*` attribute and every `javascript:` link removed.
 * Undefined when `text` is not a well-formed `<svg>` document.
 */
export function sanitizeSvg(
  text: string,
  env: SvgEnv = { parser: new DOMParser(), doc: document },
): SVGSVGElement | undefined {
  const parsed = env.parser.parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName !== "svg" || parsed.getElementsByTagName("parsererror").length > 0) return undefined;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (BLOCKED.has(el.localName.toLowerCase())) el.remove();
  }
  for (const el of Array.from(root.querySelectorAll("*")).concat(root)) {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || (isHref(a.name) && isJsUrl(a.value))) el.removeAttribute(a.name);
    }
  }
  return env.doc.importNode(root, true) as unknown as SVGSVGElement;
}
