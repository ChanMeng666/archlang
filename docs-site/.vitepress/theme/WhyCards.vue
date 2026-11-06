<script setup lang="ts">
// Why: the three PS-D1 cards, word for word (test/docs-home-copy.test.ts pins them), each with a
// small real visual from the compiler. The drawings and figures are HOME, which sync-docs.mjs
// makes from HOME_PROOFS on every build, all on examples/: a describe() of one example, an
// impact() of one changed number, and a lint() of a flat with its bedroom window taken out (the
// highlight on the flagged room is added by the site). No figure is typed here.
import { HOME } from "./home-data.js";

/** The cards. `body` marks code with backticks; site-markdown.mjs reads this table. */
const WHY = [
  {
    key: "exact",
    title: "Exact.",
    body: "Areas and reachability are computed, not estimated; the same text gives the same drawing, byte for byte.",
  },
  {
    key: "change",
    title: "Change one line, see what moved.",
    body: "Edit a number and only what depends on it moves; `impact --lock` proves the rest didn't.",
  },
  {
    key: "check",
    title: "It checks itself.",
    body: "An unreachable room or an opening off its wall comes back as a message with a code and a fix your AI can apply; checks other than reachability and area are advisory.",
  },
] as const;

/**
 * What the language itself gives, as positive properties only: no contrast with any other format
 * or output (positioning B1). `text` marks code with backticks; site-markdown.mjs reads it.
 */
const LANGUAGE = {
  heading: "What writing it as a language gives you",
  text: "Rooms, walls, doors and windows have names, so the compiler can measure each room and check how the rooms connect. Some mistakes — an unreachable room, an opening off its wall — come back as a message with a code that points at the exact place in the text, often with a fix your AI can apply; other checks are advisory. The same text gives the same bytes every time, and `impact` shows which parts of the drawing a change moved.",
} as const;

/** The pages behind "It checks itself": what describe and lint report, and every error code. */
const CHECKS = [
  { href: "/analysis", label: "The checks →" },
  { href: "/errors", label: "Error codes →" },
] as const;

/** `a `b` c` → text and code runs, so the template never needs v-html. */
const runs = (s: string) => s.split("`").map((text, i) => ({ text, code: i % 2 === 1 }));

const { exact, change, check } = HOME;
</script>

<template>
  <section class="why" aria-labelledby="why-title">
    <div class="why__inner">
      <h2 id="why-title" class="why__title">Why use it</h2>
      <div class="why__grid">
        <article v-for="c in WHY" :key="c.key" class="why-card" :data-why="c.key">
          <h3 class="why-card__title">{{ c.title }}</h3>
          <p class="why-card__body">
            <template v-for="(r, i) in runs(c.body)" :key="i"
              ><code v-if="r.code">{{ r.text }}</code
              ><template v-else>{{ r.text }}</template></template
            >
          </p>
          <p v-if="c.key === 'check'" class="why-card__more">
            <template v-for="(l, i) in CHECKS" :key="l.href"
              ><template v-if="i > 0"> · </template><a :href="l.href">{{ l.label }}</a></template
            >
          </p>

          <figure v-if="c.key === 'exact'" class="why-card__fig">
            <img :src="`/examples/${exact.example}.svg`" :alt="`${exact.plan}, compiled with its dimensions`" loading="lazy" />
            <table class="why-card__table">
              <caption>describe() on {{ exact.example }}.arch</caption>
              <thead>
                <tr>
                  <th scope="col">Room</th>
                  <th scope="col" class="num">Area</th>
                  <th scope="col" class="num">Net</th>
                  <th scope="col">Reachable</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in exact.rooms" :key="r.label">
                  <th scope="row">{{ r.label }}</th>
                  <td class="num">{{ r.area_m2 }} m²</td>
                  <td class="num">{{ r.net_area_m2 }} m²</td>
                  <td>{{ r.reachable ? "yes" : "no" }}</td>
                </tr>
              </tbody>
            </table>
          </figure>

          <figure v-else-if="c.key === 'change'" class="why-card__fig">
            <div class="why-card__pair">
              <div>
                <img :src="`/examples/${change.example}.svg`" :alt="`${change.example}.arch with ${change.let} = ${change.from}`" loading="lazy" />
                <span class="why-card__tag"><code>{{ change.let }} = {{ change.from }}</code></span>
              </div>
              <div>
                <img :src="change.after" :alt="`${change.example}.arch with ${change.let} = ${change.to}`" loading="lazy" />
                <span class="why-card__tag"><code>{{ change.let }} = {{ change.to }}</code></span>
              </div>
            </div>
            <figcaption>
              <code>impact</code>: {{ change.changed }} elements moved, {{ change.held }} held.
              <code>--lock {{ change.lock.join(",") }}</code>: {{ change.lockOk ? "nothing locked moved" : "a locked element moved" }}.
            </figcaption>
          </figure>

          <figure v-else class="why-card__fig">
            <div class="why-card__pair">
              <div>
                <img :src="check.raised" :alt="`${check.example}.arch without its line ${check.drop}: the compiler raises ${check.code}, and the site highlights the room it names`" loading="lazy" />
                <span class="why-card__tag why-card__tag--raised">raised</span>
              </div>
              <div>
                <img :src="check.cleared" :alt="`${check.example}.arch as it is: ${check.code} is not raised`" loading="lazy" />
                <span class="why-card__tag">cleared</span>
              </div>
            </div>
            <figcaption>
              <code>{{ check.code }}</code> {{ check.message }}
              <template v-if="check.fix"
                ><br />Fix:
                <template v-for="(r, i) in runs(check.fix)" :key="i"
                  ><code v-if="r.code">{{ r.text }}</code
                  ><template v-else>{{ r.text }}</template></template
                ></template
              >
            </figcaption>
          </figure>
        </article>
      </div>

      <div class="why__lang">
        <h3 id="what-a-language-gives" class="why__lang-title" tabindex="-1">{{ LANGUAGE.heading }}</h3>
        <p class="why__lang-body">
          <template v-for="(r, i) in runs(LANGUAGE.text)" :key="i"
            ><code v-if="r.code">{{ r.text }}</code
            ><template v-else>{{ r.text }}</template></template
          >
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.why {
  padding-block: clamp(48px, 7vw, 88px) 0;
}
.why__inner {
  max-width: 1152px;
  margin: 0 auto;
  padding-inline: 24px;
}
.why__title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-weight: 640;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--ink);
}
.why__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(14px, 2vw, 24px);
}
@media (max-width: 900px) {
  .why__grid {
    grid-template-columns: 1fr;
  }
}
.why-card {
  display: flex;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--paper-panel);
}
.why-card__title {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 108;
  font-weight: 650;
  font-size: 1.2rem;
  line-height: 1.2;
  color: var(--ink);
}
.why-card__body {
  margin: 8px 0 14px;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--ink-muted);
}
.why-card code,
.why-card__fig code {
  padding: 0;
  background: none;
  font-family: var(--font-mono);
  font-size: 0.88em;
  color: var(--ink);
}
.why-card__fig {
  margin: auto 0 0;
  font-size: 12.5px;
  color: var(--ink-muted);
}
.why-card__fig img {
  display: block;
  width: 100%;
  height: 170px;
  object-fit: contain;
  border: 1px solid var(--hairline);
  background: var(--paper);
}
.why-card__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.why-card__pair img {
  height: 150px;
}
.why-card__tag {
  display: block;
  margin-top: 4px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.why-card__tag--raised {
  color: var(--redline-ink);
}
.why-card__fig figcaption {
  margin-top: 8px;
  line-height: 1.5;
}
.why-card__table {
  display: table;
  width: 100%;
  margin: 8px 0 0;
  border-collapse: collapse;
  font-size: 12.5px;
}
.why-card__table caption {
  caption-side: top;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 11.5px;
  padding-bottom: 4px;
}
.why-card__table th,
.why-card__table td {
  padding: 3px 6px;
  border: 0;
  border-top: 1px solid var(--hairline);
  background: none;
  text-align: left;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink);
}
.why-card__table thead th {
  color: var(--ink-muted);
}
.why-card__table .num {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.why-card__fig figcaption code,
.why-card__body code,
.why__lang-body code {
  border: 0;
}
.why-card__more {
  margin: -6px 0 14px;
  font-size: 0.9rem;
}
.why-card__more a {
  color: var(--plum-deep);
  text-underline-offset: 3px;
}
/* What a language gives: one plain paragraph under the cards, at reading width. */
.why__lang {
  max-width: 760px;
  margin: clamp(20px, 3vw, 32px) 0 0;
}
.why__lang-title {
  margin: 0;
  border: 0;
  padding: 0;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 108;
  font-weight: 650;
  font-size: 1.2rem;
  line-height: 1.25;
  color: var(--ink);
  scroll-margin-top: calc(var(--vp-nav-height, 64px) + 16px);
}
.why__lang-body {
  margin: 8px 0 0;
  font-size: 0.98rem;
  line-height: 1.6;
  color: var(--ink-muted);
}
.why__lang-body code {
  padding: 0;
  background: none;
  font-family: var(--font-mono);
  font-size: 0.88em;
  color: var(--ink);
}
</style>
