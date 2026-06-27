<script setup>
// Brand-family footer, rendered via the layout-bottom slot (VitePress's built-in
// footer only supports a message/copyright line). Echoes the ArchCanvas footer
// so the two products read as one family, and surfaces the full ecosystem
// (docs ↔ playground ↔ archcanvas + npm/github) for bidirectional navigation.
const ECOSYSTEM = [
  { href: "https://archlang-playground.vercel.app", label: "Playground ↗" },
  { href: "https://archcanvas.chanmeng.org", label: "ArchCanvas ↗" },
  { href: "https://www.npmjs.com/package/@chanmeng666/archlang", label: "npm ↗" },
  { href: "https://github.com/chanmeng666/archlang", label: "GitHub ↗" },
];
const year = 2026;
</script>

<template>
  <footer class="family-footer">
    <div class="family-footer__grid">
      <div class="family-footer__brand">
        <p class="family-footer__name"><b>Arch</b>Lang</p>
        <p class="family-footer__blurb">
          A small declarative language that compiles to professional SVG floor
          plans — the open foundation the ArchCanvas design agent is built on.
        </p>
      </div>
      <div class="family-footer__col">
        <p class="family-footer__heading">Ecosystem</p>
        <ul>
          <li v-for="l in ECOSYSTEM" :key="l.href">
            <a :href="l.href" target="_blank" rel="noopener noreferrer">{{ l.label }}</a>
          </li>
        </ul>
      </div>
    </div>
    <div class="family-footer__base">
      <p class="family-footer__legal">
        Released under the MIT License. · Copyright © {{ year }} Chan Meng
      </p>
      <a
        class="family-footer__credit"
        href="https://github.com/ChanMeng666"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="/brand/chan-meng-monkey.svg" alt="Chan Meng" width="20" height="20" />
        <span>Built by Chan Meng</span>
      </a>
    </div>
  </footer>
</template>

<style scoped>
.family-footer {
  border-top: 1px solid var(--vp-c-divider);
  padding: 48px 24px 40px;
  background: var(--vp-c-bg-alt);
}
.family-footer__grid {
  max-width: 1152px;
  margin: 0 auto;
  display: grid;
  gap: 40px;
  grid-template-columns: 1.6fr 1fr;
}
@media (max-width: 640px) {
  .family-footer__grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
.family-footer__name {
  margin: 0;
  font-family: var(--vp-font-family-base);
  font-size: 18px;
  font-weight: 600;
}
.family-footer__name b {
  color: var(--vp-c-brand-1);
}
.family-footer__blurb {
  margin: 12px 0 0;
  max-width: 22rem;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.family-footer__heading {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}
.family-footer__col ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.family-footer__col li {
  margin-bottom: 10px;
}
.family-footer__col a {
  font-size: 14px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}
.family-footer__col a:hover {
  color: var(--vp-c-brand-1);
}
.family-footer__base {
  max-width: 1152px;
  margin: 40px auto 0;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}
.family-footer__legal {
  margin: 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.family-footer__credit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}
.family-footer__credit:hover {
  color: var(--vp-c-text-1);
}
.family-footer__credit img {
  display: block;
}
:global(.dark) .family-footer__credit img {
  filter: invert(1);
}
</style>
