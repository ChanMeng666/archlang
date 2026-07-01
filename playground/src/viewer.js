/**
 * Shared SVG-into-stage helper for the pan/zoom preview. Injects an SVG string
 * into `stage`, gives it a definite pixel size from its `viewBox` (so the stage
 * has real dimensions to fit), and hands the size to the pan/zoom controller.
 * Used by both the main playground and the chrome-less embed page.
 */
export function showSvgInStage(stage, pz, svg, refit) {
  stage.innerHTML = svg;
  const el = stage.firstElementChild;
  let w = 800;
  let h = 600;
  if (el) {
    const vb = el.getAttribute("viewBox");
    if (vb) {
      const p = vb.split(/[\s,]+/).map(Number);
      if (p.length === 4 && p[2] > 0 && p[3] > 0) {
        w = p[2];
        h = p[3];
      }
    }
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
  }
  pz.setContent(w, h, refit);
}
