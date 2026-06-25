import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { toPdf } from "../src/export/pdf.js";

// pdfkit is an optionalDependency (installed by default npm ci). Skip gracefully
// if absent so the suite stays green in a no-optional install.
const available = await (async () => {
  try {
    await import("pdfkit" as string);
    return true;
  } catch {
    return false;
  }
})();

const sceneOf = (src: string) => toScene(resolve(parse(src).plan!).ir);

describe.skipIf(!available)("PDF export", () => {
  const scene = sceneOf('plan "P" { room id=r at (0,0) size 4000x3000 label "Room" }');

  it("produces a valid PDF (magic header + EOF trailer)", async () => {
    const pdf = await toPdf(scene);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    expect(head).toBe("%PDF-");
    const tail = new TextDecoder().decode(pdf.slice(-6));
    expect(tail).toContain("EOF");
  });

  it("emits vector content with selectable text (no rasterized image)", async () => {
    const pdf = await toPdf(scene);
    const bytes = new TextDecoder("latin1").decode(pdf);
    // A real text font (selectable text), and no image XObject (true vector).
    // Note: pdfkit always lists /ImageB /ImageC /ImageI in /ProcSet — that is not
    // an embedded image, so we check specifically for an image XObject subtype.
    expect(bytes).toContain("Helvetica");
    expect(bytes).not.toContain("/Subtype /Image");
  });
});

describe("PDF export — contract", () => {
  it("the backend is an async function consuming a Scene (not part of compile)", () => {
    expect(typeof toPdf).toBe("function");
    expect(toPdf.constructor.name).toBe("AsyncFunction");
  });
});
