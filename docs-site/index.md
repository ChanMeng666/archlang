---
layout: home

# The landing page is fully custom. The hero (the "compile seam") is injected via
# the home-hero-before slot (CompileSeam.vue); the body below is composed from
# globally-registered section components + one inline "built for agents" band.
# We intentionally omit the default `hero:`/`features:` frontmatter so neither the
# stock VitePress hero nor the VPFeatures grid renders.
---

<SheetGrid />

<FactsSection />

<section class="agents" aria-label="Built for agents">
  <div class="agents__inner">
    <p class="agents__eyebrow">// built for agents</p>
    <h2 class="agents__title">An interface, not just an image.</h2>
    <p class="agents__lede">
      ArchLang answers on an agent's own terms. Every <code class="agents__code">arch</code> command
      takes <code class="agents__code">--json</code> with deterministic exit codes;
      <code class="agents__code">arch context</code> prints the whole language, workflow and error
      catalog as one system-prompt-ready bundle (<code class="agents__code">llms-full.txt</code>); and
      <code class="agents__code">SKILL.md</code> is the write&nbsp;→&nbsp;compile&nbsp;→&nbsp;describe&nbsp;→&nbsp;repair
      loop it follows. No pixels required to verify intent.
    </p>
    <div class="agents__term" aria-hidden="true">
      <span class="agents__prompt">$</span> npx @chanmeng666/archlang describe plan.arch <span class="agents__flag">--json</span>
      <br />{ <span class="agents__key">"rooms"</span>: 4, <span class="agents__key">"doors"</span>: 3, <span class="agents__key">"windows"</span>: 3, <span class="agents__key">"floor_area_m2"</span>: 42 }
    </div>
    <div class="agents__actions">
      <a class="agents__btn agents__btn--solid" href="/agents">Use it from an agent →</a>
      <a class="agents__btn agents__btn--ghost" href="/spec">One-page spec</a>
    </div>
  </div>
</section>
