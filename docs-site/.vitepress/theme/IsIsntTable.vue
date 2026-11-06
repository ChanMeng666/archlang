<script setup lang="ts">
// What it is / what it isn't: the boundaries from archcanvas-growth's strategy/category.md §5,
// in ArchLang's words, plus the PS-D1 honest-limits line. Deliberately NOT a comparison table
// against AI image tools or CAD (positioning ban B1). site-markdown.mjs reads ROWS and LIMITS.
const ROWS = [
  {
    is: "A text language for floor plans: rooms, walls, doors, windows and furniture in millimetres, in a file you can diff.",
    isnt: "Not CAD software: the compiler draws plans, and the 3D preview is a separate package's flat-colour preview. Heights draw nothing in the plan; there are no sections or elevations.",
  },
  {
    is: "A 3D preview from the same source (the separate archlang-3d package): walls, openings, floors, stairs and furniture in flat colours.",
    isnt: "Not a renderer, not BIM: no pitched roofs yet, no sections or elevations.",
  },
  {
    is: "A compiler from that text to SVG, PDF and DXF offline; PNG with one optional download. The same text gives the same bytes.",
    isnt: "Not a CAD interchange tool: DXF is a one-way export. There is no DXF or DWG import.",
  },
  {
    is: "A checker: describe reports areas and reachability, and lint returns messages, each with a code and, where there is one, a fix.",
    isnt: "Not a permit or compliance product: every check other than reachability and area is advisory.",
  },
  {
    is: "The format an agent emits when it needs a floor plan: a CLI with JSON output, an MCP server and a skill.",
    isnt: "Not an image reader: your AI reads a photo or a PDF and writes ArchLang from it.",
  },
  {
    is: "Open: MIT licensed, zero runtime dependencies, and it runs in Node, in the browser and in CI.",
    isnt: "Not BIM: there is no IFC import or export.",
  },
  {
    is: "Explicit about edits: finish fills what a plan left empty, and runs when you ask it to.",
    isnt: "Not a layout solver: the compiler draws what the source says. No optimiser, no auto-layout.",
  },
] as const;

/** The one honest-limits line (PS-D1), around its one link. */
const LIMITS = {
  before: "Plan drawings only (no 3D in the core, no BIM/IFC, not permit drawings); it does not read images (your AI can: ",
  link: "/from-an-image",
  after: "); clearances are advisory.",
} as const;
</script>

<template>
  <section class="isisnt" aria-labelledby="isisnt-title">
    <div class="isisnt__inner">
      <h2 id="isisnt-title" class="isisnt__title">What it is, and what it isn't</h2>
      <table class="isisnt__table">
        <thead>
          <tr>
            <th scope="col">What it is</th>
            <th scope="col">What it isn't</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in ROWS" :key="i">
            <td>{{ r.is }}</td>
            <td>{{ r.isnt }}</td>
          </tr>
        </tbody>
      </table>
      <p class="isisnt__limits">
        <strong>Limits.</strong> {{ LIMITS.before }}<a :href="LIMITS.link">{{ LIMITS.link }}</a>{{ LIMITS.after }}
      </p>
      <p class="isisnt__links">
        <a href="/from-an-image">Starting from a photo or a PDF</a> ·
        <a href="/edit-one-room">Change one room, keep the rest</a> ·
        <a href="/vs-mermaid">How it compares with Mermaid</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.isisnt {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.isisnt__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.isisnt__title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 640;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--ink);
}
.isisnt__table {
  display: table;
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  table-layout: fixed;
}
.isisnt__table th,
.isisnt__table td {
  padding: 10px 14px;
  border: 1px solid var(--hairline);
  background: var(--paper-panel);
  vertical-align: top;
  text-align: left;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink);
}
.isisnt__table th {
  background: var(--paper);
  font-family: var(--font-display);
  font-variation-settings: "wdth" 88;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.isisnt__table td + td {
  color: var(--ink-muted);
}
.isisnt__limits {
  margin: 16px 0 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink);
}
.isisnt__links {
  margin: 8px 0 0;
  font-size: 14px;
}
@media (max-width: 640px) {
  .isisnt__table th,
  .isisnt__table td {
    padding: 8px 10px;
    font-size: 13.5px;
  }
}
</style>
