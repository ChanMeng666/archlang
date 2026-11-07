/**
 * The playground's compile job, and the Web Worker it runs in (card MP6, ruling MP-D6: typing
 * never freezes the page). A playground file, not core: `compile()`, `describe()` and `lint()` are
 * the core's, called exactly as the page called them, and the core is untouched.
 *
 * One module, three roles:
 *
 * - `runCompileJob`: what one render needs from the compiler, as plain, structured-clonable data
 *   (strings, numbers, arrays and plain objects): the drawing (and each storey's), the
 *   diagnostics, `describe()` of the whole plan, `lint()` when the editor shows Lint, the Paths
 *   overlay's drawing when that layer is on, and the top-level statements the knobs read. Nothing
 *   the page cannot clone crosses: no Scene (an export that needs one compiles it on the page,
 *   `sceneFor`) and no whole AST (the knobs read only the plan's `grid` and its top-level `let`
 *   and `assign` statements, `extractKnobs` in knobs.ts).
 * - the worker: this same module, started as a module Worker from its own URL (`WORKER_URL`).
 *   It is a chunk of the page's build, not a separate worker build, so the worker imports the very
 *   compiler chunk the page has already loaded (an HTTP-cache hit, never a second download of the
 *   ~430 KB compiler). Inside a worker it answers each request with the job's result; on the page
 *   it registers nothing.
 * - `createCompileClient`: the page's side. At most one request is in the worker and one waits;
 *   a newer request replaces the waiting one, and a reply to a request older than the latest sent
 *   is dropped (sequence numbers), so the last edit always wins. When the worker cannot be made or
 *   fails (no Worker, a blocked or failed load, a reply that would not clone), the client says so
 *   once and runs every request on the page from then on, the way the page compiled before.
 *
 * The page and the worker run the same function on the same compiler build, so a request gives
 * byte-identical results in both (playground/test/compile-worker.test.ts, e2e/editing.spec.ts).
 *
 * Its static imports are the compiler and nothing of the page's: a worker that imported the
 * page's entry chunk would run the page's code, which needs a document, and fail
 * (e2e/preview3d.spec.ts, "startup chunks", walks this chunk's imports).
 */
import type { CompileOptions, Diagnostic, DescribeOptions, LintOptions, PlanNode, Scene, SceneSummary } from "archlang";
import { compile, describe, lint, THEMES } from "./compiler.js";

/** One render's request: the source and every setting that changes what the compiler returns. */
export interface CompileRequest {
  /** Its sequence number: a reply to a request older than the latest sent is dropped. */
  seq: number;
  source: string;
  /** The theme picked in More (a `THEMES` key), or "" for the source's own `theme`. */
  theme: string;
  /** Emit SVG `<title>`/`<desc>`/role (More's a11y switch). */
  accessible: boolean;
  /** The Paths layer is on: also compile with the circulation overlay. */
  paths: boolean;
  /**
   * The Lint section's profile ("" is the default rules), or null while there is no editor: no
   * Lint section and no lint gutter to feed.
   */
  lintProfile: string | null;
}

/** A storey's drawing, as the page reads it (the core's `CompilePage` without its Scene). */
export interface DrawnPage {
  level: number;
  name?: string;
  svg: string;
}

/** What one render needs from the compiler, all of it structured-clonable. */
export interface CompileResult {
  /** `compile().svg`: the drawing (a multi-storey plan's lowest storey), "" when it has errors. */
  svg: string;
  /** `compile().errors`. */
  errors: { message: string; line?: number; col?: number }[];
  /** `compile().diagnostics`. */
  diagnostics: Diagnostic[];
  /** `compile().pages` without the Scenes: present only for a plan with `level` blocks. */
  pages?: DrawnPage[];
  /** `describe()` of the whole plan (the page narrows it to the storey on screen). */
  whole: SceneSummary;
  /** `lint()` under `lintProfile` for a plan that compiles; null when not asked or not compiled. */
  lint: Diagnostic[] | null;
  /** The Paths layer's drawing (the circulation overlay), when asked for and the plan compiles. */
  paths?: { svg: string; pages?: DrawnPage[] };
  /** The parse's `grid` and its top-level `let`/`assign` statements: all the knobs read. */
  knobPlan?: PlanNode;
  /**
   * The editor's lint gutter: `compile(source, { noCache: true }).diagnostics`, what its linter
   * read when it compiled on the page (arch-language.js `compileDiagnostics`). Present only with
   * an editor (`lintProfile` not null).
   */
  gutter?: Diagnostic[];
}

/** The options the page's render compiles with: annotated (click-to-source), never cached. */
export function compileOptionsFor(req: Pick<CompileRequest, "theme" | "accessible">): CompileOptions {
  // Theme: empty value = the source's own `theme` directive (pass nothing); a named key overrides
  // it (compile's `theme` option wins over an in-source directive).
  // annotate: stamp data-span on primitives so a click in the preview can jump to source
  // (interact.ts). Exports strip it (main.ts `cleanSvg`) so downloads stay clean.
  // accessible: emit SVG <title>/<desc>/role from `accTitle`/`accDescr` (or, absent those,
  // describe()'s caption). Opt-in — the default output stays byte-identical (ADR 0007).
  return req.theme
    ? { noCache: true, annotate: true, accessible: req.accessible, theme: THEMES[req.theme] }
    : { noCache: true, annotate: true, accessible: req.accessible };
}

const drawnPages = (pages: { level: number; name?: string; svg: string }[] | undefined): DrawnPage[] | undefined =>
  pages?.map(({ level, name, svg }) => (name === undefined ? { level, svg } : { level, name, svg }));

/** Run one render's compile, describe, lint and Paths compile. Pure: the same request, the same result. */
export function runCompileJob(req: CompileRequest): CompileResult {
  const opts = compileOptionsFor(req);
  const { svg, errors, diagnostics, pages, ast } = compile(req.source, opts);
  const ok = errors.length === 0;
  const whole = describe(req.source, { noCache: true } as DescribeOptions & { noCache?: boolean });
  // Lint runs over the WHOLE plan, always (edit-mode.ts narrows the rows to the storey on screen).
  const lintDiags =
    ok && req.lintProfile !== null
      ? lint(req.source, { profile: req.lintProfile, noCache: true } as LintOptions & { noCache?: boolean })
      : null;
  const result: CompileResult = { svg, errors, diagnostics: diagnostics ?? [], whole, lint: lintDiags };
  const drawn = drawnPages(pages);
  if (drawn) result.pages = drawn;
  // The export SVG is always overlay-free; the Paths layer is a second compile for the drawing on
  // screen only, so downloads and copies never carry it.
  if (ok && req.paths) {
    const overlaid = compile(req.source, { ...opts, overlays: ["circulation"] });
    const overlaidPages = drawnPages(overlaid.pages);
    result.paths = overlaidPages ? { svg: overlaid.svg, pages: overlaidPages } : { svg: overlaid.svg };
  }
  // The render's options change no diagnostic but a theme's (a theme's line weight is named in
  // one), so without a theme the render's own list is the gutter's, compiled once
  // (playground/test/compile-worker.test.ts proves it over the examples).
  if (req.lintProfile !== null)
    result.gutter = req.theme ? compile(req.source, { noCache: true }).diagnostics : result.diagnostics;
  if (ok && ast)
    result.knobPlan = {
      grid: ast.grid,
      body: ast.body.filter((s) => s.kind === "let" || s.kind === "assign"),
    } as PlanNode;
  return result;
}

/**
 * The Scene of the drawing a render drew (DXF and TXT downloads): its storey's, or the plan's.
 * On the page, on demand: a Scene is the one compile output no render sends across.
 */
export function sceneFor(
  req: Pick<CompileRequest, "source" | "theme" | "accessible">,
  level: number | null,
): Scene | null {
  const { scene, pages } = compile(req.source, compileOptionsFor(req));
  const page = level === null ? undefined : pages?.find((p) => p.level === level);
  return (page ? page.scene : scene) ?? null;
}

/** This module's own URL: the worker is started from it. */
export const WORKER_URL = import.meta.url;

/** What the worker answers: the result, or why there is none (the page then compiles it). */
type Reply = { seq: number; ok: true; result: CompileResult } | { seq: number; ok: false; error: string };

// ---- inside the worker ----
interface WorkerScope {
  addEventListener(type: "message", fn: (e: MessageEvent<CompileRequest>) => void): void;
  postMessage(message: Reply): void;
}
const scope = globalThis as unknown as { WorkerGlobalScope?: abstract new () => unknown };
if (typeof scope.WorkerGlobalScope === "function" && globalThis instanceof scope.WorkerGlobalScope) {
  const self = globalThis as unknown as WorkerScope;
  self.addEventListener("message", (e) => {
    const { seq } = e.data;
    const fail = (err: unknown) =>
      self.postMessage({ seq, ok: false, error: String((err as { message?: string })?.message ?? err) });
    let result: CompileResult;
    try {
      result = runCompileJob(e.data);
    } catch (err) {
      fail(err);
      return;
    }
    try {
      self.postMessage({ seq, ok: true, result });
    } catch (err) {
      fail(err); // a result that would not clone: the page compiles this one itself
    }
  });
}

// ---- on the page ----
export interface CompileClient {
  /**
   * The result of `req`, from the worker (or the page once the worker has failed); null when a
   * newer request has been made meanwhile (this one's reply is dropped, or it was never sent).
   */
  run(req: CompileRequest): Promise<CompileResult | null>;
  /** Run `req` on the page, now, and drop every older request (a knob being dragged). */
  runNow(req: CompileRequest): CompileResult;
  /** Where requests run: in the worker, or on the page (no worker, or it failed). */
  where(): "worker" | "page";
}

interface Pending {
  req: CompileRequest;
  resolve: (r: CompileResult | null) => void;
}

/**
 * The page's side of the worker. `onFallback` is told, once, when requests start running on the
 * page instead (the worker could not be made, or failed).
 */
export function createCompileClient(onFallback: (why: unknown) => void = () => {}): CompileClient {
  let worker: Worker | undefined;
  let broken = typeof Worker === "undefined";
  /** The newest request made (run or runNow). */
  let latest = 0;
  /** The request in the worker, and the one waiting for it to be free. */
  let inFlight: Pending | undefined;
  let queued: Pending | undefined;

  const onPage = (p: Pending) => p.resolve(p.req.seq < latest ? null : runCompileJob(p.req));

  function fallBack(why: unknown) {
    if (!broken) {
      broken = true;
      worker?.terminate();
      worker = undefined;
      console.warn("The compiler worker did not run; compiling on the page instead:", why);
      onFallback(why);
    }
    const waiting = [inFlight, queued];
    inFlight = queued = undefined;
    for (const p of waiting) if (p) onPage(p);
  }

  function send(p: Pending) {
    inFlight = p;
    try {
      worker!.postMessage(p.req);
    } catch (err) {
      fallBack(err);
    }
  }

  function ensureWorker(): boolean {
    if (broken) return false;
    if (worker) return true;
    try {
      worker = new Worker(WORKER_URL, { type: "module", name: "archlang-compiler" });
    } catch (err) {
      fallBack(err);
      return false;
    }
    worker.addEventListener("message", (e: MessageEvent<Reply>) => {
      const reply = e.data;
      const done = inFlight;
      if (!done || done.req.seq !== reply.seq) return;
      if (!reply.ok) {
        fallBack(reply.error);
        return;
      }
      inFlight = undefined;
      done.resolve(reply.seq < latest ? null : reply.result);
      const next = queued;
      queued = undefined;
      if (next) send(next);
    });
    // A load that failed (a blocked or missing script, a module that threw) or a reply that
    // would not deserialise.
    worker.addEventListener("error", (e) => {
      e.preventDefault();
      fallBack(e.message || "the worker failed to load");
    });
    worker.addEventListener("messageerror", () => fallBack("a reply did not deserialise"));
    return true;
  }

  return {
    run(req) {
      latest = Math.max(latest, req.seq);
      return new Promise((resolve) => {
        const p: Pending = { req, resolve };
        if (!ensureWorker()) {
          onPage(p);
          return;
        }
        if (inFlight) {
          queued?.resolve(null); // replaced by a newer request before it was sent
          queued = p;
        } else send(p);
      });
    },
    runNow(req) {
      latest = Math.max(latest, req.seq);
      queued?.resolve(null);
      queued = undefined;
      return runCompileJob(req);
    },
    where: () => (broken ? "page" : "worker"),
  };
}
