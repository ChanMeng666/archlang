/**
 * The one way a compiled SVG string becomes a DOM node in a browser surface. The compiler emits
 * only `circle defs desc g line path pattern polygon rect svg text title tspan`, all in the SVG
 * namespace, so none of what is removed here is ever in a real drawing (the examples round-trip in
 * `playground/test/svg-sanitize.test.ts` pins that); this is the second layer behind the
 * compiler's escaping, not a general-purpose sanitiser for hostile SVG.
 *
 * Two paths, one result:
 *  - fast: text that is plainly the compiler's own vocabulary ({@link isPlainSvg}: only those
 *    tags, one SVG `xmlns`, no `on*`, no `href`, no entity tricks) can contain nothing to remove,
 *    so it is parsed once, as `innerHTML` always was, and no tree walk is spent on it;
 *  - full: anything else is parsed as XML and cleaned. It removes every element outside the SVG
 *    namespace (an XHTML `iframe`, `embed`, `object`, `form`...); the SVG `script`,
 *    `foreignObject`, `style`, `set`, `animate*` and `discard` elements (SMIL
 *    `<set attributeName="href" to="javascript:...">` rewrites a link after parsing); every `on*`
 *    attribute; and every `href`/`xlink:href` that is not a fragment, a relative path or an
 *    `http:`, `https:` or `mailto:` URL. It does not inspect CSS or other attributes.
 *
 * Three byte-identical copies exist, because the surfaces cannot share an import (the web
 * component is published with the core as its only peer, the MCP viewer is its own esbuild
 * bundle): `playground/src/`, `packages/web-component/src/` and `packages/mcp-worker/src/viewer/`.
 * `playground/test/svg-sanitize.test.ts` holds them equal; change all three.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG elements removed with their subtrees (lower-cased local names). */
const BLOCKED = new Set([
  "script",
  "foreignobject",
  "style",
  "set",
  "animate",
  "animatemotion",
  "animatetransform",
  "animatecolor",
  "discard",
]);

/** Attributes whose value is a URL (`href`, `xlink:href`). */
const isHref = (name: string): boolean => /(^|:)href$/i.test(name);

/**
 * Whether a link value may stay: a fragment, a relative path, or `http:`/`https:`/`mailto:`.
 * URL parsing skips C0 controls and spaces, leading and inside (a tab splits nothing), so they are
 * stripped first; every other scheme (`javascript:`, `data:`, `vbscript:`, `blob:`...) goes.
 */
const isSafeLink = (value: string): boolean => {
  const v = Array.from(value)
    .filter((c) => c.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();
  return v === "" || v.startsWith("#") || /^(https?|mailto):/.test(v) || !/^[a-z][a-z0-9+.-]*:/.test(v);
};

/** The tags the compiler writes. */
const COMPILER_TAGS = "svg|g|defs|desc|title|text|tspan|path|rect|line|circle|pattern|polygon";
const FOREIGN_TAG = new RegExp(`<(?!/?(?:${COMPILER_TAGS})[\\s/>])`);
/** The two namespace declarations the compiler writes (the SVG one, and Inkscape's for layer names). */
const SVG_XMLNS =
  /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"|\sxmlns:inkscape="http:\/\/www\.inkscape\.org\/namespaces\/inkscape"/g;
const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg"`;
const SUSPECT = /\bon[a-z]+\s*=|href|xmlns|&#|javascript|data:/i;

/**
 * Whether `text` is, by a few linear scans, only what the compiler writes: it opens with `<svg xmlns="http://www.w3.org/2000/svg"`,
 * every tag is a compiler tag, its only namespace declarations are the SVG and Inkscape ones, and nothing in it
 * could be an event handler or a link. Anything else (including a label that merely contains
 * "one=" or "href") fails this and takes the full path, which is always correct.
 */
export function isPlainSvg(text: string): boolean {
  return text.startsWith(SVG_OPEN) && !FOREIGN_TAG.test(text) && !SUSPECT.test(text.replace(SVG_XMLNS, ""));
}

/** The parser and the document that adopts the result; the browser's own unless a test passes others. */
export interface SvgEnv {
  parser: DOMParser;
  doc: Document;
}

/**
 * The root element of `text` as SVG, adopted into `env.doc`, with the elements and attributes
 * listed above removed, and no comment, processing instruction or CDATA section left (see
 * {@link plainNodes}). Undefined when `text` is not a well-formed `<svg>` document in the SVG
 * namespace, or when the DOM refuses the import (the fast path trusts the compiler to be well-formed
 * and checks only its shape).
 */
export function sanitizeSvg(
  text: string,
  env: SvgEnv = { parser: new DOMParser(), doc: document },
): SVGSVGElement | undefined {
  if (isPlainSvg(text)) {
    const holder = env.doc.createElement("template");
    holder.innerHTML = text;
    const first = holder.content.firstElementChild;
    return first && first.localName === "svg" && first.namespaceURI === SVG_NS
      ? (first as unknown as SVGSVGElement)
      : undefined;
  }
  const parsed = env.parser.parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName !== "svg" || root.namespaceURI !== SVG_NS || parsed.getElementsByTagName("parsererror").length > 0)
    return undefined;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.namespaceURI !== SVG_NS || BLOCKED.has(el.localName.toLowerCase())) el.remove();
  }
  for (const el of Array.from(root.querySelectorAll("*")).concat(root)) {
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name) || (isHref(a.name) && !isSafeLink(a.value))) el.removeAttribute(a.name);
    }
  }
  plainNodes(root, parsed);
  try {
    return env.doc.importNode(root, true) as unknown as SVGSVGElement;
  } catch {
    return undefined; // a DOM exception on odd input is a refusal, never thrown at the caller
  }
}

/**
 * Leave only elements and text under `node`: comments and processing instructions are removed, and
 * a CDATA section becomes a text node with the same data (importing one into an HTML document
 * throws, and the compiler writes none).
 */
function plainNodes(node: Node, parsed: Document): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) plainNodes(child, parsed);
    else if (child.nodeType === 4) node.replaceChild(parsed.createTextNode(child.nodeValue ?? ""), child);
    else if (child.nodeType !== 3) node.removeChild(child);
  }
}
