/**
 * Client-side rasterization + download helpers shared by the preview (copy PNG)
 * and the multi-format download (PNG/PDF). The core's PNG/PDF backends are
 * Node-only, so the playground rasterizes the SVG through a <canvas> instead.
 */

/** Trigger a browser download of `blob` as `floorplan.<ext>`. */
export function saveBlob(blob: Blob, ext: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `floorplan.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Longest raster edge (px). Bounds output so a large plan can't exceed the
 *  browser's max canvas area (which silently makes `toBlob` return null). */
export const MAX_RASTER_EDGE = 4000;

/** Rasterize the current SVG to a canvas, scaled to fit within MAX_RASTER_EDGE. */
export function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const m = svg.match(/viewBox="([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+)"/);
  const vbW = m ? parseFloat(m[3]) : 800;
  const vbH = m ? parseFloat(m[4]) : 600;
  // Fit the longest edge to MAX_RASTER_EDGE (never upscale past 2×).
  const scale = Math.min(2, MAX_RASTER_EDGE / Math.max(vbW, vbH));
  const W = Math.max(1, Math.round(vbW * scale));
  const H = Math.max(1, Math.round(vbH * scale));
  // Give the standalone SVG an intrinsic size so <img> rasterizes predictably.
  const sized = svg.includes(" width=") ? svg : svg.replace("<svg ", `<svg width="${vbW}" height="${vbH}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
