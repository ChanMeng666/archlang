// Playground example plans.
//
// The flagship examples are the SAME files the CLI, docs, and spec ship — imported
// verbatim via Vite's `?raw` so the playground can never drift from the canonical,
// lint-clean source (these used to be hand-copied here and went stale: an open bath,
// dimensions drawn into the building, furniture on the door swings). `server.fs.allow`
// in vite.config.js already whitelists the repo root, and `?raw` inlines the file
// contents at build time. Edit examples/*.arch, not a duplicate.
import studio from "../../examples/studio.arch?raw";
import twoBed from "../../examples/two-bed.arch?raw";
import relational from "../../examples/relational.arch?raw";
import attached from "../../examples/attached.arch?raw";
import accessible from "../../examples/accessible.arch?raw";
import themed from "../../examples/themed.arch?raw";
import parametric from "../../examples/parametric.arch?raw";

// Ordered as a learning progression (the <select> preserves insertion order).
export const EXAMPLES: Record<string, string> = {
  "Single room": `plan "One Room" {
  units mm
  grid 100
  wall exterior thickness 150 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Studio"
  door at (2500,4000) width 900 wall exterior hinge left swing in
  window at (0,2000) width 1500 wall exterior
}`,
  "Studio (1BR)": studio,
  "Two-bed flat": twoBed,
  "Relational (right-of / below)": relational,
  "Attached (strip + on-wall + anchor)": attached,
  "Accessible (accTitle / accDescr)": accessible,
  "Themed (blueprint + brick)": themed,
  "Parametric (let + for loop)": parametric,
};
