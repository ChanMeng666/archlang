import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { toPdf } from "../src/export/pdf.js";

// pdfkit / svg-to-pdfkit are optionalDependencies (installed by default npm ci).
// Skip gracefully if absent so the suite stays green in a no-optional install.
const available = await (async () => {
  try {
    await import("pdfkit" as string);
    await import("svg-to-pdfkit" as string);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!available)("PDF export", () => {
  const { svg } = compile('plan "P" { room id=r at (0,0) size 4000x3000 label "Room" }', { noCache: true });

  it("produces a valid PDF (magic header + EOF trailer)", async () => {
    const pdf = await toPdf(svg);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    expect(head).toBe("%PDF-");
    const tail = new TextDecoder().decode(pdf.slice(-6));
    expect(tail).toContain("EOF");
  });
});

describe("PDF export — missing deps", () => {
  it("the backend is an async function consuming SVG (not part of compile)", () => {
    expect(typeof toPdf).toBe("function");
    expect(toPdf.constructor.name).toBe("AsyncFunction");
  });
});
