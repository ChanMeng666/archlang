---
paths:
  - "playground/e2e/**"
  - "playground/playwright.config.ts"
  - "playground/package.json"
  - "playground/vite.config.js"
  - "playground/test/**"
---

# Playground tests and e2e
- Reproduce a playground bug as a `playground/test/` unit test of the extracted pure part
  (`docs/testing.md` § 4); real DOM, pointer and download cases belong in `playground/e2e/`, which CI
  runs against the built site (`docs/agents/commands.md` § CI). Read the PR's e2e result; a worktree
  cannot run it faithfully.

## Traps
- **The playground's Vite is not the root's.** The root `node_modules` holds Vite 6 and the
  playground needs Vite 8, so a worktree that junctions only the root `node_modules` builds the
  playground with the wrong Vite. Junction `playground/node_modules` to the primary's too, and
  unlink both with `[System.IO.Directory]::Delete` before removing the worktree. When a package is
  missing from the primary's tree, use `npm ci` in the worktree instead (the `@resvg/resvg-wasm` entry below).
- **Playground e2e: `setEditorSource` (`playground/e2e/fixtures.ts`) waits for the autosave**, so
  typing the document over itself is no edit and never saves. It throws at once when asked to: a
  test that types plans in turn must start with one other than the boot plan (`laneway-house`,
  `DEFAULT_EXAMPLE`).
- **Playground renders are asynchronous** (they compile in a module Web Worker). Wait with
  `waitForPlan`, which waits for `html[data-rendering]` to go, never for a fixed time. Count compiles
  with `countCompiles` (fixtures.ts). Measure main-thread long tasks under CDP CPU throttling, as the
  Hillside typing and knob-drag tests in `editing.spec.ts` and `knobs.spec.ts` do.
  `html[data-compiler]` says whether the worker or the page compiled.
- **Playwright's WebKit after a refused module chunk** (`route.abort()` or a 503 alike, card
  MP10's CI runs): the next `import()` of it rejects only after 20–30 s, and a click that starts it
  returns then (`test.slow` with the reason, never a project-wide timeout); a page reloaded within a
  second or two of the failure gets it again with no request, and how long the memory cache keeps it
  varies (38 s once), so never assert that a reload recovers in WebKit. WebKit does keep
  a failed module fetch for the document's life (the HTML module map); Chromium and
  Firefox forget it and fetch again in place. Tell the engines apart by documents loaded, never by
  counting the chunk's requests: one boot asks twice (the page and the compile worker).
- **A worktree's playground typecheck can miss `@resvg/resvg-wasm`** (the primary checkout's
  `node_modules` lacks it): run `npm ci` in the worktree rather than junctioning.
