/**
 * flowing-lines — the shared ArchCanvas/ArchLang hero signature ("灵动的线条").
 *
 * A small, evenly-spaced set of thin violet contour lines that drift in slow
 * long-wavelength waves and fade to transparent at both ends, so each line
 * emerges from and dissolves back into the void. Lifted verbatim from
 * archcanvas/src/components/landing/FlowingLines.tsx — the React wrapper dropped
 * so the same motion language is reusable from VitePress (Vue) and the plain-JS
 * playground. Reads the `--plum` brand colour from CSS at runtime.
 *
 * Accessibility / performance:
 *  - `prefers-reduced-motion` renders one static frame, no loop.
 *  - IntersectionObserver + visibilitychange pause the loop offscreen/hidden.
 *  - DPR-aware; redrawn cleanly each frame; purely decorative.
 *
 * Usage: const stop = mountFlowingLines(canvasEl, { lineCount? }); // stop() to dispose.
 */

const FALLBACK_PLUM = { r: 128, g: 82, b: 255 };

function hexToRgb(hex) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mountFlowingLines(canvas, opts = {}) {
  const { lineCount } = opts;
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const plum = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue("--plum").trim()) ?? FALLBACK_PLUM;
  const col = (a) => `rgba(${plum.r},${plum.g},${plum.b},${a})`;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let t = 0;
  let lines = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = lineCount ?? Math.max(8, Math.min(width < 768 ? 9 : 14, Math.round(height / 46)));
    const band = height / count;
    lines = Array.from({ length: count }, (_, i) => ({
      baseY: (i + 0.5) * band + rand(-band * 0.18, band * 0.18),
      amp: rand(16, 40),
      freq: rand(0.0016, 0.0036),
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: rand(0.002, 0.005) * (Math.random() < 0.5 ? 1 : -1),
      bobAmp: rand(3, 9),
      bobPhase: Math.random() * Math.PI * 2,
      alpha: rand(0.3, 0.55),
      weight: rand(1, 1.5),
      accent: false,
    }));
    for (const i of [Math.floor(rand(0, count)), Math.floor(rand(0, count))]) {
      if (lines[i]) {
        lines[i].accent = true;
        lines[i].alpha = rand(0.62, 0.85);
        lines[i].weight = rand(1.8, 2.4);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const fade = Math.max(80, width * 0.14);
    for (const ln of lines) {
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, col(0));
      grad.addColorStop(fade / width, col(ln.alpha));
      grad.addColorStop(1 - fade / width, col(ln.alpha));
      grad.addColorStop(1, col(0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = ln.weight;
      ctx.shadowColor = col(ln.accent ? 0.7 : 0.45);
      ctx.shadowBlur = ln.accent ? 14 : 7;
      const yBob = Math.sin(t * 0.006 + ln.bobPhase) * ln.bobAmp;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 6) {
        const y = ln.baseY + yBob + Math.sin(x * ln.freq + ln.phase) * ln.amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function step() {
    for (const ln of lines) ln.phase += ln.phaseSpeed;
    t += 1;
  }

  function loop() {
    if (!running) return;
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduce) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  build();
  draw();
  if (!reduce) start();

  const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { threshold: 0 });
  io.observe(canvas);

  const onVisibility = () => {
    if (document.hidden) stop();
    else if (!reduce) start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      build();
      draw();
    });
  };
  window.addEventListener("resize", onResize);

  return function dispose() {
    stop();
    io.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(resizeRaf);
  };
}
