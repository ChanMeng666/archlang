# Gotchas

Non-obvious traps that no test catches, or whose symptom points the wrong way. Each: rule · symptom
· fix. Anything a test already enforces is left to that test's failure message.

## Core

- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen, so it
  flips with the order of a wall's points. The swing quarter-disc is `doorSwing` in `geometry.ts`,
  shared by `door.render()` and `W_SWING_OBSTRUCTED` — keep both on that one helper.
- **A diagnostic's `span` may point into an imported module**; `Diagnostic.file` then names it and
  `applyFixes` skips any fix carrying `file`. Any new consumer of `diagnostics[].fixes` must honour
  `file`, or it splices a module's byte offsets into the importer.
- **`place`: never pre-transform a resolver's input.** Every derived rule is stated in plan terms
  (`anchor top-left`, `side left`, `hinge left`, `right-of`), so an instance resolves in its own
  frame and `transformElement` carries the result. A new handed rule adds its flip there
  (`det < 0`). Flip what can be re-expressed in plan coordinates (a symbol's handedness); drop what
  cannot (a local `anchor` corner).
- **Room-label classification goes through `src/vocabulary.ts`**; the corpus classification is pinned
  by `test/vocabulary-equivalence.test.ts`. A red pin means fix the vocabulary, never regenerate it.
- **The PNG backend is Node-only and async**; keep `node:*` imports lazy so the module stays
  browser-safe.
- **CJK text in PDF/PNG**: the face from `@chanmeng666/archlang-font-cjk` is registered only when a
  drawn string needs it, which keeps every non-CJK PDF/PNG byte-identical. Loading it
  unconditionally moves every PDF golden — a finding, not a re-pin.

## Docs & prose

- **A quoted dimension must name its convention or carry a tilde.** A plan with wall thickness has
  a centreline size (`describe --json` `bbox`) and an outer-face size (`bbox_outer`). Settle it with
  `arch describe <file> --json --select bbox,bbox_outer`. Deliberately not gated.
- **`docs-site/sync-docs.mjs` copies `docs/*.md` and root artifacts into the site** (gitignored
  there). Edit the repo-root source, never the copy.
- **Pushing `main` deploys the docs; only a `v*` tag moves npm.** A merged, unreleased language
  feature makes `archlang.uk` document syntax `npx @chanmeng666/archlang` cannot parse. Say so when
  you land one without releasing it.

## Sites

- **VitePress `.vp-doc a:hover` (0,2,1) outranks a two-class rule (0,2,0).** A control whose colour
  must survive hover re-asserts `color` in its own `:hover` rule. Check hover/focus/active states.
- **A fixed hex in the site CSS is a fossil** — convert it to a token. The one legitimate literal is
  the CodeMirror lint squiggle's data-URI hex (a `var()` cannot enter an SVG data URI).
- **Changing a public host**: grep the host prefix without dots (`archlang-playground`), because some
  references are regexes with escaped dots. Schema `$id`s live in `src/plan-json.ts`/`src/intent.ts`
  (regenerate with `gen:*-schema`), agent-context URLs in `SKILL.md` (`gen:llms`).
- **SEO** (`docs/seo.md`): crawlers execute no JavaScript, so only static bytes count; the
  killed-claim regexes on `PAGE_META`/`EXAMPLE_ROWS` are never widened — fix the copy; `/embed.html`
  is de-indexed by an `X-Robots-Tag` header, not a `robots.txt` Disallow; `_headers` binds to the
  request path, so `/` and `/index.html` each need their own rule.
- **`vitepress preview` caches its file index at startup.** Symptom: after a rebuild the page is 200
  but its hashed CSS 404s, and every measurement reads plausible and wrong. Restart the preview after
  every build, give a measurement server its own port (a parallel worktree may hold the fixed one),
  and gate on a marker only the new build has, never a status code.

## Tooling & process

- **(Typecheck) A file's compiler options come from the program compiling it.** A root test that
  imports a workspace module pulls it into the root program (`noUncheckedIndexedAccess` on), and
  `exclude` cannot keep it out. Symptom: `TS2345 … | undefined` on workspace source that
  `tsc -p <workspace>` calls clean. Fix it in the shared module, never by relaxing the root option;
  `tsc -p tsconfig.dev.json --listFiles` shows what the program pulls in.
- **Two actors in one worktree share one checkout.** A reviewer's `git checkout -b probe` silently
  redirects the other's commits. Verify a branch from a separate checkout (or `git -C`), and re-read
  an agent branch's tip with `git rev-parse` before merging it.
- **A clean auto-merge of a moved function another branch modified is not evidence.** Taking one
  side can silently revert the other's fix with a green suite. Diff the moved body against the newer
  version and run both branches' fixtures together.
- **(MCP registry) The `io.github.ChanMeng666/*` namespace is case-sensitive and identity-checked**
  against the npm package's `mcpName`, and the server `description` is capped at 100 chars.
- **(Eval) Reasoning models spend thinking tokens out of `max_completion_tokens`.** An implausibly low
  score means suspect the token cap (`eval/run.ts` uses 16384) before the language.
- **(Dataset) `dataset/out/` is gitignored and HF-only.** On re-upload the card's
  `task_categories` must come from HF's official list (`text-generation`), under the `ChanMeng666`
  namespace. See `dataset/README.md`.
