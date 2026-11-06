---
layout: home

# The landing page is fully custom. The hero (the "compile seam") is injected via the
# home-hero-before slot (CompileSeam.vue); the body below is the globally registered section
# components plus one inline "built for agents" band, in the order of the public-surfaces plan
# (docs/plans/public-surfaces/README.md §4). No `hero:`/`features:` frontmatter, so neither the
# stock VitePress hero nor the VPFeatures grid renders.
---

<SameSource />

<WhyCards />

<HowSteps />

<HomeGallery />

<IsIsntTable />

<FactsSection />

<section class="agents" aria-label="Built for agents">
  <div class="agents__inner">
    <p class="agents__eyebrow">// built for agents</p>
    <h2 class="agents__title">An interface, not just an image.</h2>
    <p class="agents__lede">
      Every <code class="agents__code">archlang</code> command takes
      <code class="agents__code">--json</code> and returns a deterministic exit code;
      <code class="agents__code">archlang context</code> prints the language, the workflow and the error
      catalog as one bundle for a system prompt (<code class="agents__code">llms-full.txt</code>); and
      <code class="agents__code">SKILL.md</code> is the write&nbsp;→&nbsp;compile&nbsp;→&nbsp;describe&nbsp;→&nbsp;repair
      loop an agent follows.
    </p>
    <div class="agents__term" aria-hidden="true">
      <span class="agents__prompt">$</span> npx -y @chanmeng666/archlang describe laneway-house.arch <span class="agents__flag">--json</span>
      <br />{ <span class="agents__key">"rooms"</span>: 3, <span class="agents__key">"doors"</span>: 4, <span class="agents__key">"windows"</span>: 4, <span class="agents__key">"floor_area_m2"</span>: 48.75 }
    </div>
    <div class="agents__actions">
      <a class="agents__btn agents__btn--solid" href="/agents">Use it from an agent →</a>
      <a class="agents__btn agents__btn--ghost" href="/spec">One-page spec</a>
    </div>
  </div>
</section>

<TopicsRow />
