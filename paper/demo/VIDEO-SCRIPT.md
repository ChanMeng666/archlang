# Demo video — shot-by-shot script

**Target:** 4:30 (the ICSE Tool Demonstrations window is 3–5 min; 4:30 leaves 30 s of slack for
a slow page load without falling out of the window).
**Format:** 1920×1080, 30 fps, screen capture with voiceover. Unlisted YouTube, live for the
whole review period.
**Register:** the paper's — the drawing is table stakes, the diagnostic surface is the
deliverable. Nothing is claimed on screen that the paper does not claim.

---

## Before recording — a checklist, because every item here has failed once

- [ ] `npm run build` at the repo root. The CLI, the playground and the VS Code bundle all read
      `dist/`; a stale `dist/` silently demos an older language.
- [ ] `node dist/cli.js --version` prints the version the paper cites. If it does not, stop.
- [ ] Terminal: 16–18 pt monospace, light background to match the sites, no shell theme that
      colours JSON. Window ~110 columns so `arch fix`'s diff does not wrap.
- [ ] `PS1='$ '` (or equivalent). No hostname, no git branch, no directory noise.
- [ ] Working directory `demo/` containing exactly `offwall.arch` and `crowded.arch` (both
      below). Nothing else, so `ls` is never surprising. No `offwall.arch.bak` — shot 4 makes it.
- [ ] Playground and docs site open in tabs, already loaded and scrolled to the top.
- [ ] VS Code open with the extension installed, `offwall.arch` NOT yet open (shot 6 opens it).
- [ ] Screen recorder set to capture keystrokes-as-typed, not paste. A paste that materialises
      40 characters at once reads as a fake.

`demo/offwall.arch` is **committed** at `paper/demo/offwall.arch` — copy it, do not retype it.
It is **the paper's Listing 1** (`examples/one-room.arch`, the smallest complete plan) with
exactly one line changed, so the paper and the video demonstrate the same file:

```
  door   id=d_in at (3200,5000) width 900 swing in
```

The shipped line reads `door id=d_in on shell at 60% width 900 swing in`; here the door is
written at an absolute point a metre past the south face, so it lands on no wall. The fix in
shot 4 restores the shipped line exactly — a better beat than any invented example, because the
"correct" answer is a file the project already ships.

> **Do not add a header, a comment, or a blank line to `offwall.arch`.** The paper's Listing 2
> quotes real byte spans (`[499, 547]`, line 11) and any edit above the door line moves them,
> silently invalidating the listing — which has already happened once, when a provenance header
> was added to explain the file and thereby changed the thing it explained. Provenance lives in
> `paper/demo/README.md`; regenerate only via the `sed` one-liner recorded there, so the file
> stays derived from `examples/one-room.arch` rather than hand-edited.

`demo/crowded.arch`, used only in shot 5 to show what `fix` will *not* do:

```
plan "Crowded" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r_liv at (0,0) size 6000x4000 label "Living" uses living
  door id=d_in on shell at 60% width 900 swing in
  furniture sofa at (2600,2900) size 1800x800 label "Sofa"
}
```

Its door is already correct; the sofa is the problem, and no span edit can express the answer.

---

## Shot 1 — Cold open: the problem (0:00 – 0:25)

**On screen.** Full-screen playground (`https://playground.archlang.uk`) with `offwall.arch` in
the editor and the compiled plan on the right. Cursor idle. At 0:12, drag the split so the drawing
fills more of the frame; at 0:18, cut to the same drawing rendered as a bare PNG in an image
viewer, with no editor and no panel around it.

**Voiceover.**
> A language model can write a floor plan. This one is text — ten lines — and it compiles to a
> drawing. But if all you have is the drawing, and you are the model that just wrote it, there is
> nothing here you can ask. Can you reach that room. Is the door actually on a wall. You would
> have to re-derive the geometry you just emitted.

**Direction.** No title card yet. The bare-PNG beat is the argument; hold it a full three seconds
in silence before cutting.

---

## Shot 2 — Title and framing (0:25 – 0:40)

**On screen.** Static title card: *ArchLang — a deterministic floor-plan compiler with an
agent-facing diagnostic protocol.* Below it, four short lines fading in one per beat: *fixes with
proven applicability · a fix loop with a postcondition · filters that never gate · determinism as
a contract.*

**Voiceover.**
> ArchLang is a compiler for that text. The drawing is table stakes — to-scale plan generation
> from a building model has shipped since 2015. What this demo is about is the other half: what
> the compiler will tell the thing that wrote the plan.

**Direction.** Read the four lines slightly under-paced. They are the paper's contribution list
and the shot order that follows.

---

## Shot 3 — The CLI loop, part 1: the diagnostic (0:40 – 1:40)

**On screen.** Terminal, full frame.

```
$ npx @chanmeng666/archlang compile offwall.arch --json -o offwall.svg
```

Let the real output scroll. Then scroll back and zoom (or highlight) the diagnostic object only:

```json
"diagnostics": [
  { "code": "W_DOOR_OFF_WALL",
    "severity": "warning",
    "message": "Door \"d_in\" does not lie on any wall",
    "line": 11, "col": 3, "span": [499, 547],
    "fix": "Move the door onto a wall, or name its host with `wall <id|category>`.",
    "fixes": [
      { "title": "attach the door to wall \"shell\" at 60%",
        "applicability": "machine-applicable",
        "edits": [ { "span": [499, 547],
                     "newText": "door id=d_in on shell at 60% width 900 swing in" } ] } ] }
]
```

Then, in the same terminal:

```
$ arch explain W_DOOR_OFF_WALL
```

**Voiceover.**
> Compile it, and ask for JSON. The drawing is written, and so is a diagnostic. Note what the
> diagnostic carries: a catalogued code, a byte span — not a line and column guess, the actual
> bytes — prose for a human, and a *structured* fix. Replacement text, and where it goes.
>
> The fix declares an applicability tier. These are rustc's — machine-applicable,
> maybe-incorrect, has-placeholders, unspecified — and we implement them, we did not invent
> them. This one is machine-applicable because there is exactly one nearest wall. If there were
> two candidates it would be demoted, because which one the author meant is a choice the tool is
> not allowed to make quietly.
>
> Every code in the catalogue can be explained from the CLI, and a test enforces the catalogue in
> both directions: a code the compiler raises with no entry fails, and an entry the compiler
> cannot emit fails.

**Direction.** The `--json` shape is long. Do not scroll through all of it — cut from the raw
output to the highlighted `diagnostics` block. The `explain` output is short; show it whole.

---

## Shot 4 — The CLI loop, part 2: fix, and what fix is not (1:40 – 2:35)

**On screen.**

```
$ arch fix offwall.arch --dry-run
--- a/offwall.arch
+++ b/offwall.arch
@@ -8,7 +8,7 @@
   room id=r_main at (0,0) size 5000x4000 label "Room" uses living
-  door   id=d_in at (3200,5000) width 900 swing in
+  door id=d_in on shell at 60% width 900 swing in
   window id=w_n  on shell at 10% width 1500            # 10%: the north wall
 applied [W_DOOR_OFF_WALL] attach the door to wall "shell" at 60%
 (dry run — nothing written)

$ arch fix offwall.arch --backup
  applied [W_DOOR_OFF_WALL] attach the door to wall "shell" at 60%
  backup: offwall.arch.bak
✓ offwall.arch → offwall.arch (1 fix, 1 pass)

$ arch describe offwall.arch --json --select rooms,access
```

Highlight, in the `describe` output: `"area_m2": 20`, and the `access` block's
`"reachable": true`, `"depthFromEntrance": 1`, `"hasEntrance": true`.

**`--backup` is load-bearing for the next shot**, not decoration: it leaves `offwall.arch.bak`
holding the pre-fix bytes, which is what shot 5 runs the filter demo against. Do not drop it.

**Voiceover.**
> `arch fix` previews the exact diff it would write, dry-run or not, and `--backup` keeps the
> original bytes. Applied, the door moves onto the wall run — sixty per cent along it —
> so it stays put the next time the room is resized.
>
> Two things about that loop. It is bounded, and it rolls back any pass that raises the error
> count: the corrector may not make a plan worse. And it terminates — which sounds too obvious
> to state, except that we shipped a fix that did not. It swapped a dimension's endpoints, the
> warning fired again, it swapped back, forever, and the file you got depended on the parity of
> the pass budget. We found no prior work naming termination as a required property of a
> machine-applicable fix. We now require it, and the producer has to re-ask the detector about
> the state *after* the fix.
>
> This is `describe`. Exact areas, adjacency, an access graph, per-room reachability. This is how
> a text-only agent checks what it drew — no raster, no vision model, nothing rendered at all.

**Direction.** When the voiceover reaches "no raster," cut the drawing out of frame entirely if it
is still visible anywhere. The point lands better with only JSON on screen.

---

## Shot 5 — What fix will not do, and what cannot be filtered away (2:35 – 3:20)

**On screen.** Two commands, back to back. First, on `crowded.arch` (a separate one-room plan
with a sofa sitting in the entrance swing; its source is above):

```
$ arch lint crowded.arch
warning[W_SWING_OBSTRUCTED]: Door swing is obstructed — the swing needs
  900 mm of clear radius but "Sofa" is 300 mm from the hinge (600 mm short).
  = help: Move the door along its wall, or the obstruction —
          `arch repair` computes the smallest clearing shift.

$ arch repair crowded.arch -o repaired.arch
✓ crowded.arch → repaired.arch (1 change)
  moved sofa#1 (2600,2900) → (2600,2250) — moved out of a door's swing
```

Then, on `offwall.arch.bak` — the pre-fix bytes `--backup` kept in shot 4:

```
$ arch validate offwall.arch.bak --strict --json
  ... exit 2

$ arch validate offwall.arch.bak --strict --code W_SWING_OBSTRUCTED --json
{ "ok": false, "strict": true, "filtered": true,
  "total_diagnostics": 2, "diagnostics": [] }
$ echo $?
2
```

Hold on the last two lines. Put a lower-third caption on screen: **empty list, still exit 2.**

**Voiceover.**
> A fix is a text edit where the text is known. Moving furniture out of a door swing is not that —
> it is a search over positions — so it is a different verb, `repair`, and the two never merge.
> Keeping "rewrite this text" and "search this geometry" apart is what lets each one promise
> something honest.
>
> Now the filter. Reads are narrowable, because a large plan can otherwise flood an agent's
> context. But narrowing is a *view*. Ask a failing plan to show only some unrelated code and you
> get an empty diagnostic list — marked filtered, carrying the true total — and exit status two.
> The verdict is always computed from the unfiltered set. An agent must not be able to filter its
> way to a green build.

**Direction.** `echo $?` is the shot. Do not talk over it; let the `2` sit for a beat.

The JSON above is shown two-fields-per-line to fit this page; the CLI pretty-prints one field
per line and that is what must be on screen. Capture the real output — do not retype it
compactly, and do not reuse the paper's reflowed block, which is marked as reflowed for exactly
this reason. `total_diagnostics: 2` is what `offwall.arch.bak` actually produces; if your recording
shows a different number, your input file is not the one in this script.

---

## Shot 6 — VS Code, and the same diagnostics somewhere else (3:20 – 3:50)

**On screen.** VS Code opens `offwall.arch`. The squiggle under the `door` line; hover shows
`W_DOOR_OFF_WALL` with the same message. Open the lightbulb; the quick fix reads *attach the door
to wall "shell" at 60%* and is the preferred action. Apply it; the squiggle clears. Then
`Format Document` and show the file unchanged in meaning.

Driven directly against the bundled server (`editors/vscode/dist/server.js --stdio`), so these
are the values the editor will show: `publishDiagnostics` gives code `W_DOOR_OFF_WALL`, message
`Door "d_in" does not lie on any wall`, at 0-based line 10 character 2 — which is the CLI's line
11, col 3, the same byte position counted the way each protocol counts. `textDocument/codeAction`
returns exactly one action: title `attach the door to wall "shell" at 60%`, kind `quickfix`,
`isPreferred: true`. Identical title, identical wording to the CLI. If the editor shows anything
else on the day, the bundle is stale — rebuild before recording, not after.

**Voiceover.**
> The editor is the same diagnostics over LSP, from a bundled copy of the same compiler. Same
> code, same fix, same wording — because there is one producer, not an editor-flavoured
> reimplementation of it. The lone machine-applicable fix is marked as the preferred action, so
> the obvious keystroke does the safe thing.

**Direction.** Show the hover and the lightbulb, not the settings UI. No extension-marketplace
detour.

---

## Shot 7 — MCP, and determinism (3:50 – 4:15)

**On screen.** Split: left, an MCP-native host with the ArchLang server connected, running
`describe` on the same file and returning the same JSON. Right, a terminal running:

**Use the post-fix `offwall.arch`** — the one shot 4 repaired, not `offwall.arch.bak`. It matters:
driven over stdio, the shim (`archlang` 0.2.6) returns `area_m2: 20`, `reachable: true`,
`depthFromEntrance: 1`, `hasEntrance: true` for the fixed plan, and `reachable: false`,
`hasEntrance: false` for the pre-fix one, because an off-wall door is not an entrance. Both match
the CLI on the same bytes, which is the point of the shot; showing the wrong file would put a
`false` on screen under a voiceover saying the two surfaces agree.

```
$ arch compile examples/aquarium.arch -o a1.svg
$ arch compile examples/aquarium.arch -o a2.svg
$ sha256sum a1.svg a2.svg
```

Two identical hashes on screen.

**Voiceover.**
> For hosts that speak MCP there is a server over the same pure functions — a discovery channel,
> not a second implementation. The CLI stays the primary interface, because it costs an agent
> nothing in context until it is called.
>
> And all of it is deterministic by contract, not by habit. This is a curved plan — the hardest
> case — and the bytes are identical. The contract goes further than the shot: a test renders it
> with the optional geometry backend registered, cleared, and registered again, and requires the
> same bytes all three times. An optional dependency may add capability; it may never change the
> output of a plan that did not need it.

**Direction.** The two hashes are the whole right-hand shot. Say the with/without-backend part as
a statement about the test suite — do not imply the screen is showing it, because it is not. If
the host on the left is slow to respond, cut to it pre-connected rather than showing a spinner.

---

## Shot 8 — Close (4:15 – 4:30)

**On screen.** Title card with three lines: `npx @chanmeng666/archlang`,
`https://archlang.uk`, `https://playground.archlang.uk`. Underneath, small:
*co-authored with Claude Code agents under human direction.*

**Voiceover.**
> ArchLang is on npm, with a playground, docs, an editor extension and an MCP server. It was
> co-authored with coding agents under human direction, which we state plainly in the paper. And
> the drawing, again, is the easy part.

---

## What in this script has actually been run

The paper's own standard, applied to the script. Every command below was executed against the
built CLI, the built MCP server or the built LSP bundle on 2026-08-22, at commit `8096f2d`,
against the committed `paper/demo/offwall.arch`. Values printed in this script are the values
those runs produced. **Three things were not executed and are marked as such** — do not treat
them as verified until the record-time check passes.

| Shot | What was run | Status |
|---|---|---|
| 3 | `compile offwall.arch --json`; `explain W_DOOR_OFF_WALL` | executed — code, message, `line 11`, `col 3`, `span [499,547]`, title at 60%, `machine-applicable`, `newText`, `fixId` all reproduce |
| 4 | `fix --dry-run`; `fix --backup`; `describe --json --select rooms,access` | executed — diff, `backup: offwall.arch.bak`, `1 fix, 1 pass`, `area_m2: 20`, `reachable: true`, `depthFromEntrance: 1` |
| 5 | `lint crowded.arch`; `repair crowded.arch`; `validate offwall.arch.bak --strict [--code …] --json` | executed — the sofa shift, and exit **2** both filtered and unfiltered with `total_diagnostics: 2` |
| 6 | `editors/vscode/dist/server.js --stdio`: `publishDiagnostics`, `textDocument/codeAction` | **protocol executed; the GUI is not.** The values are confirmed; that VS Code *renders* them as a squiggle and a lightbulb is assumed and must be checked on camera |
| 7 (left) | `packages/mcp/dist/server.js` over stdio: `initialize`, `tools/call describe` | executed — handshake `archlang 0.2.6`, and `describe` agrees with the CLI field for field |
| 7 (right) | two `compile examples/aquarium.arch` runs + `sha256sum` | executed — identical digests |
| 1 | the playground rendering `offwall.arch` | **not executed.** `https://playground.archlang.uk` answers 200; that it renders this plan as described is unverified |
| 2, 8 | title cards | nothing to run |

The two unverified rows are both *rendering* claims, and rendering is the one thing this
checklist cannot settle from a shell. Drive them once before the take. If either disagrees with
what is written here, change the script rather than the framing — the script is a description of
the tool, and a description that does not match what it describes is the subject of the paper.

---

## Notes for the editor

- **Never show a command that was not actually run.** Every block above was executed against the
  built CLI while the script was written; re-run them at record time rather than re-using a
  screenshot, because the paper's whole subject is guards that pass without having executed.
- **Do not speed-ramp a terminal.** If a command is slow, cut, do not fake latency.
- **No music under the voiceover.** Optional bed under shots 1, 2 and 8 only.
- **Captions/subtitles are required** for accessibility; burn in an SRT rather than relying on
  auto-captions, which mis-transcribe `W_DOOR_OFF_WALL` and `arch fix`.
- **Nothing on screen may claim what the paper does not.** In particular: no "first", no "only",
  no compliance language, and no claim that the diagnostic loop makes a model better — that
  comparison was never run and the paper says so.
