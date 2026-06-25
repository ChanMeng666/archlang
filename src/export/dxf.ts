/**
 * DXF export backend — consumes the resolved IR and emits ASCII DXF (R12 /
 * AC1009, the most broadly importable flavor). Pure, synchronous, zero-dep:
 * DXF is plain text, so this needs no external library and is safe to ship in
 * the core. It is NOT part of `compile()` — call it on the IR from `resolve()`.
 *
 * DXF's Y axis points up, while ArchLang's Y points down (SVG convention), so
 * every coordinate's Y is negated here to keep plans right-side-up in CAD.
 */

import type { Point } from "../ast.js";
import type { ResolvedPlan, ResolvedElement, RDoor, RWindow, RDim } from "../ir.js";
import { add, mul, normal, sub, unit, rectCorners, segmentsOfWall } from "../geometry.js";

/** Deterministic number formatting (round to 4dp, no -0). */
function num(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
}

class DxfBuilder {
  private out: string[] = [];

  /** group-code / value pair. */
  pair(code: number, value: string | number): void {
    this.out.push(String(code), String(value));
  }

  line(layer: string, a: Point, b: Point): void {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.pair(10, num(a.x));
    this.pair(20, num(-a.y));
    this.pair(11, num(b.x));
    this.pair(21, num(-b.y));
  }

  arc(layer: string, center: Point, radius: number, startDeg: number, endDeg: number): void {
    this.pair(0, "ARC");
    this.pair(8, layer);
    this.pair(10, num(center.x));
    this.pair(20, num(-center.y));
    this.pair(40, num(radius));
    this.pair(50, num(startDeg));
    this.pair(51, num(endDeg));
  }

  text(layer: string, at: Point, height: number, value: string): void {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.pair(10, num(at.x));
    this.pair(20, num(-at.y));
    this.pair(40, num(height));
    this.pair(1, value.replace(/\n/g, " "));
  }

  rect(layer: string, corners: Point[]): void {
    for (let i = 0; i < corners.length; i++) {
      this.line(layer, corners[i], corners[(i + 1) % corners.length]);
    }
  }

  toString(): string {
    return this.out.join("\n") + "\n";
  }
}

const LAYERS = ["WALLS", "ROOMS", "DOORS", "WINDOWS", "FURNITURE", "COLUMNS", "DIMS", "LABELS"];

function header(): string {
  const h: string[] = [];
  const p = (c: number, v: string | number) => h.push(String(c), String(v));
  // Minimal HEADER declaring R12.
  p(0, "SECTION"); p(2, "HEADER"); p(9, "$ACADVER"); p(1, "AC1009"); p(0, "ENDSEC");
  // TABLES → LAYER table so entities reference real layers.
  p(0, "SECTION"); p(2, "TABLES"); p(0, "TABLE"); p(2, "LAYER"); p(70, LAYERS.length);
  for (const name of LAYERS) {
    p(0, "LAYER"); p(2, name); p(70, 0); p(62, 7); p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB"); p(0, "ENDSEC");
  return h.join("\n") + "\n";
}

/** Door leaf line + swing arc (minor arc), replicating the render geometry. */
function emitDoor(b: DxfBuilder, dr: RDoor): void {
  const seg = dr.host;
  if (!seg) return;
  const d = unit(sub(seg.b, seg.a));
  const n = normal(d);
  const hw = dr.width / 2;
  const hinge = dr.hinge === "left" ? add(dr.at, mul(d, -hw)) : add(dr.at, mul(d, hw));
  const farJamb = dr.hinge === "left" ? add(dr.at, mul(d, hw)) : add(dr.at, mul(d, -hw));
  const leafDir = dr.swing === "in" ? n : mul(n, -1);
  const leafEnd = add(hinge, mul(leafDir, dr.width));
  b.line("DOORS", hinge, leafEnd);

  // Arc center=hinge, radius=width, in Y-flipped space; pick the minor arc.
  const deg = (p: Point) => (Math.atan2(-(p.y - hinge.y), p.x - hinge.x) * 180) / Math.PI;
  const a1 = deg(leafEnd);
  const a2 = deg(farJamb);
  const ccw = ((a2 - a1) % 360 + 360) % 360;
  if (ccw <= 180) b.arc("DOORS", hinge, dr.width, a1, a2);
  else b.arc("DOORS", hinge, dr.width, a2, a1);
}

function emitWindow(b: DxfBuilder, wn: RWindow): void {
  const seg = wn.host;
  if (!seg) return;
  const d = unit(sub(seg.b, seg.a));
  const n = normal(d);
  const hw = wn.width / 2;
  const h = seg.thickness / 2;
  const jA = add(wn.at, mul(d, -hw));
  const jB = add(wn.at, mul(d, hw));
  b.line("WINDOWS", add(jA, mul(n, h)), add(jB, mul(n, h)));
  b.line("WINDOWS", add(jA, mul(n, -h)), add(jB, mul(n, -h)));
  b.line("WINDOWS", jA, jB); // glazing line
}

function emitDim(b: DxfBuilder, dm: RDim): void {
  const dd = unit(sub(dm.to, dm.from));
  const dn = normal(dd);
  const p1 = add(dm.from, mul(dn, dm.offset));
  const p2 = add(dm.to, mul(dn, dm.offset));
  b.line("DIMS", p1, p2);
  if (dm.text) {
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    b.text("DIMS", mid, 150, dm.text);
  }
}

/** Render a resolved plan as an ASCII DXF document string. */
export function toDxf(ir: ResolvedPlan): string {
  const b = new DxfBuilder();
  b.pair(0, "SECTION");
  b.pair(2, "ENTITIES");

  const labelAt = (at: Point, w: number, h: number): Point => ({ x: at.x + w / 2, y: at.y + h / 2 });

  for (const el of ir.elements as ResolvedElement[]) {
    switch (el.kind) {
      case "wall":
        for (const s of segmentsOfWall(el)) {
          const d = unit(sub(s.b, s.a));
          const n = normal(d);
          const off = s.thickness / 2;
          // Two parallel wall faces convey thickness.
          b.line("WALLS", add(s.a, mul(n, off)), add(s.b, mul(n, off)));
          b.line("WALLS", add(s.a, mul(n, -off)), add(s.b, mul(n, -off)));
        }
        break;
      case "room":
        b.rect("ROOMS", rectCorners(el.at.x, el.at.y, el.size.w, el.size.h));
        if (el.label) b.text("LABELS", labelAt(el.at, el.size.w, el.size.h), 200, el.label);
        break;
      case "furniture":
        b.rect("FURNITURE", rectCorners(el.at.x, el.at.y, el.size.w, el.size.h));
        if (el.label) b.text("LABELS", labelAt(el.at, el.size.w, el.size.h), 150, el.label);
        break;
      case "column":
        b.rect("COLUMNS", rectCorners(el.at.x, el.at.y, el.size.w, el.size.h));
        break;
      case "door":
        emitDoor(b, el);
        break;
      case "window":
        emitWindow(b, el);
        break;
      case "dim":
        emitDim(b, el);
        break;
    }
  }

  b.pair(0, "ENDSEC");
  const entities = b.toString();
  return header() + entities + "0\nEOF\n";
}
