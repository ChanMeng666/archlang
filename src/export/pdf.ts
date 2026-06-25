/**
 * PDF export backend — consumes the produced SVG and renders it into a PDF via
 * pdfkit + svg-to-pdfkit. These are OPTIONAL dependencies, lazy-`import()`ed so
 * the zero-dep core never hard-requires them; a clear error is thrown if they
 * are absent. This is async and Node-oriented — NOT part of `compile()`.
 */

/** Pull width/height (px) out of the SVG's root tag, falling back to viewBox. */
function svgSize(svg: string): { width: number; height: number } {
  const w = /<svg[^>]*\bwidth="([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\bheight="([\d.]+)/.exec(svg);
  if (w && h) return { width: parseFloat(w[1]), height: parseFloat(h[1]) };
  const vb = /<svg[^>]*\bviewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) };
  return { width: 800, height: 600 };
}

/**
 * Convert an ArchLang SVG string to a PDF (returned as a Uint8Array).
 * Requires the optional `pdfkit` and `svg-to-pdfkit` packages.
 */
export async function toPdf(svg: string): Promise<Uint8Array> {
  // Loosely typed: the optional deps may ship without bundled types, and we
  // must not statically depend on them. `any` keeps the core build self-contained.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let PDFDocument: any;
  let SVGtoPDF: any;
  try {
    PDFDocument = (await import("pdfkit" as string)).default;
    SVGtoPDF = (await import("svg-to-pdfkit" as string)).default;
  } catch {
    throw new Error(
      "PDF export needs the optional dependencies 'pdfkit' and 'svg-to-pdfkit'. " +
        "Install them: npm install pdfkit svg-to-pdfkit",
    );
  }

  const { width, height } = svgSize(svg);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });

  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve());
    doc.on("error", (e: Error) => reject(e));
  });

  SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true });
  doc.end();
  await done;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return concat(chunks);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
