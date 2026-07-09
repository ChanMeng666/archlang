<script setup lang="ts">
// The site footer IS a drawing's title block: a hairline-ruled grid of labelled
// cells (PROJECT / DRAWN BY / LICENSE / ISSUED / SHEET) plus an ECOSYSTEM cell of
// family links. Rendered via the layout-bottom slot. Lives in the SHEET world, so
// it reads on paper (light) and mylar (.dark) automatically through the tokens.
const ECOSYSTEM = [
  { href: "https://archlang-playground.vercel.app", label: "Playground ↗" },
  { href: "https://archcanvas.chanmeng.org", label: "ArchCanvas ↗" },
  { href: "https://www.npmjs.com/package/@chanmeng666/archlang", label: "npm ↗" },
  { href: "https://github.com/chanmeng666/archlang", label: "GitHub ↗" },
];
</script>

<template>
  <footer class="tblock">
    <div class="tblock__inner">
      <div class="tblock__ident">
        <img class="tblock__mark" src="/brand/archlang-icon-plum.svg" alt="" width="26" height="26" />
        <div>
          <p class="tblock__name"><b>Arch</b>Lang</p>
          <p class="tblock__blurb">
            A small declarative language that compiles to professional SVG floor plans — the open
            foundation the ArchCanvas design agent is built on.
          </p>
        </div>
      </div>

      <div class="tblock__grid">
        <div class="cell">
          <span class="cell__label">Project</span>
          <span class="cell__value">ArchLang</span>
        </div>
        <div class="cell">
          <span class="cell__label">Drawn by</span>
          <a
            class="cell__value cell__credit"
            href="https://github.com/ChanMeng666"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/brand/chan-meng-monkey.svg" alt="" width="16" height="16" />
            <span>Chan Meng</span>
          </a>
        </div>
        <div class="cell">
          <span class="cell__label">License</span>
          <span class="cell__value">MIT</span>
        </div>
        <div class="cell">
          <span class="cell__label">Issued</span>
          <span class="cell__value">2026</span>
        </div>
        <div class="cell">
          <span class="cell__label">Sheet</span>
          <span class="cell__value">1 of 1</span>
        </div>
        <div class="cell cell--eco">
          <span class="cell__label">Ecosystem</span>
          <nav class="cell__links">
            <a
              v-for="l in ECOSYSTEM"
              :key="l.href"
              :href="l.href"
              target="_blank"
              rel="noopener noreferrer"
              >{{ l.label }}</a
            >
          </nav>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.tblock {
  border-top: 1px solid var(--hairline);
  background: var(--paper);
  padding: clamp(40px, 6vw, 64px) 24px clamp(32px, 5vw, 48px);
}
.tblock__inner {
  max-width: 1152px;
  margin: 0 auto;
}

/* Identity strip above the block */
.tblock__ident {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 28px;
}
.tblock__mark {
  display: block;
  flex: none;
}
.tblock__name {
  margin: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 110;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
}
.tblock__name b {
  color: var(--redline-ink);
}
.tblock__blurb {
  margin: 6px 0 0;
  max-width: 34rem;
  font-family: var(--font-body);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-muted);
}

/* The ruled title block. Container carries the top+left rule; each cell carries
   its right+bottom rule → a fully ruled grid at any wrap. */
.tblock__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  border-top: 1px solid var(--hairline);
  border-left: 1px solid var(--hairline);
}
.cell {
  border-right: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  padding: 12px 14px;
  min-height: 62px;
}
.cell--eco {
  grid-column: 1 / -1;
}
.cell__label {
  display: block;
  margin-bottom: 7px;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 84;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.cell__value {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 550;
  color: var(--ink);
  text-decoration: none;
}
.cell__credit {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: color 0.2s;
}
.cell__credit:hover {
  color: var(--redline-ink);
}
.cell__credit img {
  display: block;
}
.cell__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
}
.cell__links a {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink-muted);
  text-decoration: none;
  transition: color 0.2s;
}
.cell__links a:hover {
  color: var(--redline-ink);
}
</style>

<style>
/* Unscoped on purpose: partial `:global(.dark) descendant` selectors are
   miscompiled by the SFC compiler into a bare `.dark` rule (which inverted
   the whole site). The credit mark is the one raster that needs inverting
   on mylar. */
.dark .cell__credit img {
  filter: invert(1);
}
</style>
