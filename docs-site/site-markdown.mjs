// Plain-markdown rendering of the HAND-WRITTEN docs-site pages (SITE_PAGES in
// sync-docs.mjs), published at `/<route>.md`. Pure apart from reading the repo: the build
// facts it needs (the compiler, `describe`, the permalink codec) are INJECTED, so
// `test/site-markdown.test.ts` can run the very same transform over every SITE_PAGES row
// without the built `dist/`.
//
// Contract: nothing is dropped silently. A Vue component is replaced by its text (the
// home page's feature cards and facts band are read out of their component sources), and
// any markup this file cannot map is a build error — a silent drop would publish a page
// with a hole in it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME_3D_PLAN, previewLines, sizeLabel, threeDAssets, VIEW3D_PARAM } from "./three-d.mjs";

/**
 * The core's version, written in a hand-written page as this token (the `/embed` page's pinned
 * jsDelivr URL) so no page ever carries a typed version. Replaced from the repo-root
 * `package.json` in BOTH renderings: here for the raw `/<route>.md` copy, and by
 * `.vitepress/config.ts` (which imports this function) for the HTML page.
 */
export const VERSION_TOKEN = "%ARCHLANG_VERSION%";

/** `text` with every {@link VERSION_TOKEN} replaced by `version`. */
export function withVersion(text, version) {
  return text.split(VERSION_TOKEN).join(version);
}

/** `html` with every tag removed, repeated to a fixpoint so removing one tag can never splice
 * its neighbours into a new one (`<scr<b>ipt>` must not survive as `<script>`). */
function stripTags(html) {
  let out = html;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/<[^>]+>/g, "");
  }
  return out;
}

/** Markup → plain text: tags removed, the few entities the components use decoded. */
function plain(html) {
  return stripTags(html.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`").replace(/<em>([\s\S]*?)<\/em>/g, "*$1*"))
    .replace(/&nbsp;/g, " ")
    .replace(/&rarr;/g, "->")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first match of `re` in `src`, or a build error naming the component that moved. */
function pull(src, re, what) {
  const m = re.exec(src);
  if (!m) throw new Error(`site-markdown: cannot find ${what} — the component changed shape; update site-markdown.mjs`);
  return m;
}

/** A fenced block of plain text (a prompt, a command, a URL to paste). */
const textFence = (body) => `\`\`\`text\n${body}\n\`\`\``;

/**
 * One door's way in, as markdown — the same values DoorBody.vue renders, from doors.json.
 * @param {any} file the parsed `site-shared/doors.json`
 * @param {string} id a key of `file.doors`
 */
export function doorMarkdown(file, id) {
  const d = file.doors;
  switch (id) {
    case "playground":
      return `[${d.playground.label}](${d.playground.url}) (${d.playground.note})`;
    case "chatgpt":
      return [
        `[${d.chatgpt.label}](${d.chatgpt.url}) (${d.chatgpt.note})`,
        "Then ask, for example:",
        textFence(d.chatgpt.example),
        d.chatgpt.returns,
      ].join("\n\n");
    case "claudeai":
      return [
        `${d.claudeai.label} (${d.claudeai.note}):`,
        textFence(d.claudeai.url),
        d.claudeai.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        d.claudeai.plansNote,
        `[Claude's help page on custom connectors](${d.claudeai.stepsSource})`,
      ].join("\n\n");
    case "agent":
      return [
        textFence(file.agentPrompt.join("\n")),
        "Claude Code, connected to the hosted server:",
        textFence(d.agent.claudeCodeHttp),
        `The skill on its own ([skills.sh](${d.agent.skills.url})):`,
        textFence(d.agent.skills.command),
      ].join("\n\n");
    case "vscode":
      return `[${d.vscode.label}, Visual Studio Marketplace](${d.vscode.marketplace}) · [${d.vscode.label}, Open VSX](${d.vscode.openVsx})`;
    default:
      throw new Error(`site-markdown: no markdown rendering for the door "${id}" — add one beside DoorBody.vue's`);
  }
}

/**
 * @param {string} src repo-relative path of the page (e.g. `docs-site/guide.md`)
 * @param {{
 *   repo: string,
 *   compile: (source: string, opts: object) => { pages?: Array<{ level: number }> },
 *   describe: (source: string) => any,
 *   encodePlanHash: (source: string) => string,
 *   levelSvgName: (name: string, level: number) => string,
 *   playground: string,
 *   exampleCount: number,
 *   hero: { id: string, model: string | null, brief: string | null, source: string, link: string },
 * }} deps `exampleCount` is how many example plans the build compiled (the home proof line's N);
 *   `hero` is the plan sync-docs chose for the home hero (HOME_PROOFS.hero)
 */
export function siteMarkdown(src, deps) {
  const { repo, compile, describe, encodePlanHash, levelSvgName, playground, exampleCount, hero } = deps;
  const read = (...p) => readFileSync(join(repo, ...p), "utf8").replace(/\r\n/g, "\n");
  const raw = withVersion(read(src), JSON.parse(read("package.json")).version);
  let text = raw.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<script setup>[\s\S]*?<\/script>\n?/, "");
  const alias = {}; // `const hero = EXAMPLES["one-room"]` in the page's own script
  for (const m of raw.matchAll(/const (\w+) = EXAMPLES\["([^"]+)"\]/g)) alias[m[1]] = m[2];
  const example = (name) => read("examples", `${name}.arch`).trimEnd();
  const fence = (body) => `\`\`\`arch\n${body}\n\`\`\``;
  const playgroundLink = (source) => `${playground}/#z=${encodePlanHash(source)}`;

  // <ArchLive :src="EXAMPLES['x']" /> → the compiled drawing's route + the source, and the
  // plan's static playground page when the widget names one (`page="x"`).
  text = text.replace(/^<ArchLive :src="([^"]+)"([^>]*)\/>$/gm, (_, expr, attrs) => {
    const name = /^EXAMPLES\['([^']+)'\]$/.exec(expr)?.[1] ?? alias[expr];
    if (!name) throw new Error(`${src}: cannot resolve <ArchLive :src="${expr}">`);
    const page = /\bpage="([^"]+)"/.exec(attrs)?.[1];
    const pageLink = page ? `\n\n[Static page](${playground}/examples/${page}.html)` : "";
    return `![${name}.arch, compiled](/examples/${name}.svg)${pageLink}\n\n${fence(example(name))}`;
  });

  // <AgentPlan id="x" /> → the same provenance the component prints, the sheets, the source.
  const galleryDir = join("docs", "gallery");
  text = text.replace(/^<AgentPlan id="([^"]+)" \/>$/gm, (_, id) => {
    const entry = JSON.parse(read(galleryDir, "gallery.json")).find((e) => e.id === id);
    if (!entry) throw new Error(`${src}: <AgentPlan id="${id}"> is not in docs/gallery/gallery.json`);
    const brief = read(galleryDir, `${id}.brief.txt`).trim().replace(/^/gm, "> ");
    const source = read(galleryDir, `${id}.arch`);
    const pages = compile(source, { noCache: true }).pages;
    const files = pages?.length ? pages.map((p) => levelSvgName(id, p.level)) : [`${id}.svg`];
    const sheets = files.map((f, i) => {
      const alt =
        files.length > 1
          ? `${entry.title}: compiled floor plan, sheet ${i + 1} of ${files.length}`
          : `${entry.title}: compiled floor plan`;
      return `![${alt}](/gallery/${f})`;
    });
    // AgentPlan.vue's order: brief, plan, playground, then the provenance and the source.
    return [
      `The brief, as given to ${entry.model}:`,
      brief,
      sheets.join("\n\n"),
      `[Open in Playground](${playgroundLink(source)})`,
      `Written by **${entry.model}**, then completed with \`arch finish\`.`,
      fence(source.trimEnd()),
      `[Raw source](/gallery/${id}.arch)`,
    ].join("\n\n");
  });

  text = text.replace(/^<img src="([^"]+)" alt="([^"]*)"[^>]*\/>$/gm, "![$2]($1)");

  // /start: every door from doors.json in `order.start`, worded by door-copy.json — the two
  // files StartDoors.vue and DoorBody.vue render from.
  const theme = join("docs-site", ".vitepress", "theme");
  const doorsFile = JSON.parse(read("site-shared", "doors.json"));
  const doorCopy = JSON.parse(read(theme, "door-copy.json"));
  text = text.replace(/^<StartDoors \/>$/m, () =>
    doorsFile.order.start
      .map((id, i) =>
        [`## ${i + 1} ${doorCopy[id].heading}`, doorCopy[id].body, doorMarkdown(doorsFile, id)].join("\n\n"),
      )
      .join("\n\n"),
  );
  text = text.replace(/^<FilmFacade poster="([^"]+)" \/>$/m, () => {
    const vue = read(theme, "components", "FilmFacade.vue");
    const id = pull(vue, /const FILM_ID = "([^"]+)"/, "FilmFacade's FILM_ID")[1];
    const title = pull(vue, /const FILM_TITLE = "([^"]+)"/, "FilmFacade's FILM_TITLE")[1];
    return `[${title} (YouTube)](https://youtu.be/${id})`;
  });

  // The 3D preview (card X6): its lines (PreviewLine.vue), the home band (SameSource.vue) and the
  // /3d page's plans (ThreeDPlans.vue), from the package's constants and the 3D manifest, which
  // three-d.mjs reads for the components' data module too.
  const preview = () => previewLines(repo);
  const assets3d = () => threeDAssets(repo);
  // The plan as the home gallery's raw links carry it (`example()`), then the 3D flag.
  const link3d = (name) => `${playgroundLink(example(name))}&${VIEW3D_PARAM}`;
  text = text.replace(/^<PreviewLine which="(label|limits)" \/>$/gm, (_, which) => {
    const p = preview();
    return which === "label" ? `**${p.lead}** ${p.rest} ${p.download}` : p.limits;
  });
  text = text.replace(/^<SameSource \/>\n*/m, () => {
    const vue = read(theme, "SameSource.vue");
    const p = preview();
    const a = assets3d().find((x) => x.name === HOME_3D_PLAN);
    if (!a) throw new Error(`site-markdown: the home band's plan ${HOME_3D_PLAN} has no 3D assets`);
    const links = [...vue.matchAll(/<a [^>]*?:?href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a\s*>/g)].map(([, h, l]) => [h, l]);
    const [play, about] = [links.find(([h]) => h === "PLAN.link3d"), links.find(([h]) => h === "/3d")];
    if (!play || !about) throw new Error("site-markdown: SameSource's two links changed shape");
    return (
      [
        `## ${p.title}`,
        p.rest,
        `![The plan: ${a.name}.arch, compiled to SVG.](/examples/${a.name}.svg)`,
        `![The 3D preview of ${a.name}.arch, from the same source as the plan.](${a.poster.png})`,
        `[The drafting-order replay of ${a.name}.arch (MP4)](${a.video.mp4})`,
        p.limits,
        `[${play[1]}](${link3d(a.name)}) · [${about[1]}](/3d)`,
      ].join("\n\n") + "\n\n"
    );
  });
  text = text.replace(/^<ThreeDPlans \/>$/m, () =>
    assets3d()
      .map((a) => {
        const storey = a.poster.storey ? `, storey ${a.poster.storey}` : "";
        return [
          `### ${a.name}.arch`,
          `![The plan: ${a.name}.arch${storey}, compiled to SVG.](/examples/${a.name}.svg)`,
          `![The 3D preview of ${a.name}.arch${storey}, from the same source as the plan.](${a.poster.png})`,
          `${a.video ? `[Play the replay (MP4)](${a.video.mp4}) · ` : ""}[Download GLB (${sizeLabel(a.glb.bytes)})](${a.glb.href}) · [Open in the playground (3D)](${link3d(a.name)}) · [Plan source](/examples/${a.name}.arch)`,
        ].join("\n\n");
      })
      .join("\n\n"),
  );

  // The home page: hero (CompileSeam.vue), feature cards (SheetGrid.vue), facts (FactsSection.vue).
  text = text.replace(/^<SheetGrid \/>\n*/m, () => {
    const vue = read(theme, "SheetGrid.vue");
    const heading = plain(pull(vue, /<h2 class="dimdiv__label">([\s\S]*?)<\/h2>/, "SheetGrid's section heading")[1]);
    const cards = [
      ...vue.matchAll(
        /no: "(A-\d+)",\s*tag: "([^"]+)",\s*title: "([^"]+)",\s*body:\s*"((?:[^"\\]|\\.)*)",\s*(?:example: "([^"]+)",)?(?:\s*art: \{ levels: \[([\d, ]+)\] \},)?/g,
      ),
    ];
    const expected = (vue.match(/\bno: "A-\d+"/g) ?? []).length;
    if (expected === 0 || cards.length !== expected) {
      throw new Error(
        `site-markdown: parsed ${cards.length} of ${expected} SheetGrid cards — the card literal changed shape`,
      );
    }
    const out = cards.map(([, no, tag, title, body, ex, levels]) => {
      const art = !ex
        ? ""
        : levels
          ? levels
              .split(",")
              .map((n) => `![${ex}.arch storey ${n.trim()}](/examples/${ex}.L${n.trim()}.svg)`)
              .join("\n\n")
          : `![${title}](/examples/${ex}.svg)`;
      return [`### ${no} · ${tag} — ${title}`, JSON.parse(`"${body}"`), art].filter(Boolean).join("\n\n");
    });
    return `## ${heading}\n\n${out.join("\n\n")}\n\n`;
  });
  text = text.replace(/^<FactsSection \/>\n*/m, () => {
    const vue = read(theme, "FactsSection.vue");
    const plan = pull(vue, /const PLAN = "([^"]+)"/, "FactsSection's PLAN")[1];
    const eyebrow = plain(pull(vue, /<p class="facts__eyebrow">([\s\S]*?)<\/p>/, "FactsSection's eyebrow")[1]);
    const title = plain(pull(vue, /<h2 class="facts__title">([\s\S]*?)<\/h2>/, "FactsSection's title")[1]);
    const lede = plain(pull(vue, /<p class="facts__lede">([\s\S]*?)<\/p>/, "FactsSection's lede")[1]);
    const source = example(plan);
    const facts = describe(source);
    const rows = facts.rooms.map(
      (r) => `| ${r.label} | ${r.uses.join(", ") || "—"} | ${r.area_m2} m² | ${r.adjacent.length} |`,
    );
    const t = facts.totals;
    return (
      [
        `## ${title}`,
        `*${eyebrow}*`,
        lede,
        `The room schedule below is \`describe()\` on [\`examples/${plan}.arch\`](${playgroundLink(source)}), the plan drawn at \`/examples/${plan}.svg\`:`,
        [
          "| Room | Use | Area | Adj. |",
          "|---|---|---:|---:|",
          ...rows,
          `| Total | ${t.rooms} rooms | ${t.floor_area_m2} m² | ${t.doors + t.windows} |`,
        ].join("\n"),
        `${t.doors} doors · ${t.windows} windows · ${facts.access.hasEntrance ? "an entrance" : "no entrance"} · ${facts.access.rooms.every((r) => r.reachable) ? "every room reachable" : "a room cannot be reached"}`,
      ].join("\n\n") + "\n\n"
    );
  });
  // The home page's sections, each read out of its own component (the hero last, because it
  // goes on top of everything else).
  text = text.replace(/^<WhyCards \/>\n*/m, () => {
    const vue = read(theme, "WhyCards.vue");
    const heading = plain(pull(vue, /<h2 id="why-title"[^>]*>([\s\S]*?)<\/h2>/, "WhyCards' heading")[1]);
    const table = pull(vue, /const WHY = \[([\s\S]*?)\] as const;/, "WhyCards' WHY table")[1];
    const cards = [...table.matchAll(/key: "([^"]+)",\s*title: "([^"]+)",\s*body: "([^"]+)",/g)];
    if (cards.length !== 3)
      throw new Error(`site-markdown: parsed ${cards.length} of 3 WhyCards — the WHY table changed shape`);
    const checks = [
      ...pull(vue, /const CHECKS = \[([\s\S]*?)\] as const;/, "WhyCards' CHECKS")[1].matchAll(
        /\{ href: "([^"]+)", label: "([^"]+)" \}/g,
      ),
    ].map(([, href, label]) => `[${label}](${href})`);
    if (checks.length === 0) throw new Error("site-markdown: parsed no WhyCards CHECKS links");
    const lang = pull(
      vue,
      /const LANGUAGE = \{\s*heading: "([^"]+)",\s*text: "([^"]+)",\s*\} as const;/,
      "WhyCards' LANGUAGE paragraph",
    );
    // The checks links sit beside the "check" card, as WhyCards.vue draws them.
    const items = cards.map(([, k, t, b]) => `- **${t}** ${b}${k === "check" ? ` ${checks.join(" · ")}` : ""}`);
    return `## ${heading}\n\n${items.join("\n")}\n\n### ${lang[1]}\n\n${lang[2]}\n\n`;
  });
  text = text.replace(/^<HowSteps \/>\n*/m, () => {
    const vue = read(theme, "HowSteps.vue");
    const heading = plain(pull(vue, /<h2 id="how-title"[^>]*>([\s\S]*?)<\/h2>/, "HowSteps' heading")[1]);
    const steps = [...vue.matchAll(/title: "([^"]+)",\s*body: "([^"]+)",/g)];
    if (steps.length !== 3)
      throw new Error(`site-markdown: parsed ${steps.length} of 3 HowSteps — the STEPS table changed shape`);
    const film = read(theme, "components", "FilmFacade.vue");
    const filmId = pull(film, /const FILM_ID = "([^"]+)"/, "FilmFacade's FILM_ID")[1];
    const filmTitle = pull(film, /const FILM_TITLE = "([^"]+)"/, "FilmFacade's FILM_TITLE")[1];
    const doors = doorsFile.order.docsHome.map(
      (id) => `### ${doorCopy[id].heading}\n\n${doorCopy[id].body}\n\n${doorMarkdown(doorsFile, id)}`,
    );
    return (
      [
        `## ${heading}`,
        steps.map(([, t, b], i) => `${i + 1}. **${t}.** ${b}`).join("\n"),
        ...doors,
        `[${filmTitle} (YouTube)](https://youtu.be/${filmId})`,
      ].join("\n\n") + "\n\n"
    );
  });
  text = text.replace(/^<HomeGallery \/>\n*/m, () => {
    const vue = read(theme, "HomeGallery.vue");
    const heading = plain(pull(vue, /<h2 id="home-gallery-title"[^>]*>([\s\S]*?)<\/h2>/, "HomeGallery's heading")[1]);
    const note = plain(
      pull(vue, /<p class="home-gallery__note">([\s\S]*?)<\/p>/, "HomeGallery's note")[1].replace(
        /<a href="([^"]+)">([^<]+)<\/a>/g,
        "[$2]($1)",
      ),
    );
    const plans = [...vue.matchAll(/\{ example: "([^"]+)", caption: "([^"]+)" \}/g)];
    if (plans.length < 6 || plans.length > 8)
      throw new Error(`site-markdown: parsed ${plans.length} HomeGallery plans (6 to 8 expected)`);
    // A card with a 3D preview (HomeGallery.vue's swap) carries its poster after the drawing.
    const posters = new Map(assets3d().map((a) => [a.name, a.poster.png]));
    const items = plans.map(
      ([, ex, cap]) =>
        `- ${cap} [Open \`${ex}.arch\` in the playground](${playgroundLink(example(ex))})\n\n  ![${cap}](/examples/${ex}.svg)` +
        (posters.has(ex) ? `\n\n  ![The 3D preview of ${ex}.arch, from the same source.](${posters.get(ex)})` : ""),
    );
    // HomeGallery.vue's limits line, under the grid when any card has a 3D preview.
    const limits = plans.some(([, ex]) => posters.has(ex)) ? `${preview().limits}\n\n` : "";
    return `## ${heading}\n\n${note}\n\n${items.join("\n")}\n\n${limits}`;
  });
  text = text.replace(/^<IsIsntTable \/>\n*/m, () => {
    const vue = read(theme, "IsIsntTable.vue");
    const heading = plain(pull(vue, /<h2 id="isisnt-title"[^>]*>([\s\S]*?)<\/h2>/, "IsIsntTable's heading")[1]);
    const rows = [...vue.matchAll(/is: "([^"]+)",\s*isnt: "([^"]+)",/g)];
    if (rows.length === 0) throw new Error("site-markdown: parsed no IsIsntTable rows — the ROWS table changed shape");
    const limits = pull(vue, /before: "([^"]+)",\s*link: "([^"]+)",\s*after: "([^"]+)",/, "IsIsntTable's LIMITS");
    const links = [
      ...pull(vue, /<p class="isisnt__links">([\s\S]*?)<\/p>/, "IsIsntTable's links")[1].matchAll(
        /<a href="([^"]+)">([^<]+)<\/a>/g,
      ),
    ];
    return (
      [
        `## ${heading}`,
        ["| What it is | What it isn't |", "|---|---|", ...rows.map(([, a, b]) => `| ${a} | ${b} |`)].join("\n"),
        `**Limits.** ${limits[1]}[${limits[2]}](${limits[2]})${limits[3]}`,
        links.map(([, href, label]) => `[${label}](${href})`).join(" · "),
      ].join("\n\n") + "\n\n"
    );
  });
  text = text.replace(/^<TopicsRow \/>\n*/m, () => {
    const topics = [...read(theme, "topics.ts").matchAll(/\{ href: "([^"]+)", label: "([^"]+)" \}/g)];
    if (topics.length !== 5) throw new Error(`site-markdown: parsed ${topics.length} of 5 topics in topics.ts`);
    return `## Topics\n\n${topics.map(([, href, label]) => `- [${label}](${href})`).join("\n")}\n\n`;
  });
  if (src === "docs-site/index.md") {
    const vue = read(theme, "CompileSeam.vue");
    const h1 = pull(vue, /<h1 class="headline">([\s\S]*?)<\/h1>/, "CompileSeam's headline")[1];
    const sub = plain(pull(h1, /<span class="headline__sub">([\s\S]*?)<\/span>/, "CompileSeam's sub-headline")[1]);
    const title = plain(h1.replace(/<span class="headline__sub">[\s\S]*?<\/span>/, ""));
    if (!/<p class="tagline">\{\{ canonicalLine \}\}<\/p>/.test(vue)) {
      throw new Error("site-markdown: CompileSeam's lede is no longer doors.json's canonicalLine");
    }
    const primaries = [...vue.matchAll(/<span class="primary__title">([^<]+)<\/span>/g)].map((m) => plain(m[1]));
    if (primaries.length !== 2)
      throw new Error(`site-markdown: found ${primaries.length} of 2 hero primaries in CompileSeam.vue`);
    const proof = plain(pull(vue, /<p class="proof">([\s\S]*?)<\/p>/, "CompileSeam's proof line")[1]).replace(
      "{{ EXAMPLE_COUNT }}",
      String(exampleCount),
    );
    // The hero is the one sync-docs chose (HOME_PROOFS.hero, with its fallbacks), injected rather
    // than re-read here, so the copy says exactly what the page shows.
    if (!hero) throw new Error("site-markdown: the home page needs the hero sync-docs chose (deps.hero)");
    const heroLines = hero.brief
      ? [
          `The brief below was given to ${hero.model}, and the plan under it is the ArchLang it wrote:`,
          hero.brief.trim().replace(/^/gm, "> "),
        ]
      : [`The plan below is \`${hero.id}.arch\`:`];
    text = [
      `# ${title}`,
      sub,
      doorsFile.canonicalLine,
      `- **${primaries[0]}:** [${doorsFile.doors.chatgpt.label}](${doorsFile.doors.chatgpt.url}) (${doorsFile.doors.chatgpt.note})`,
      `**${primaries[1]}:**\n\n${textFence(doorsFile.agentPrompt.join("\n"))}`,
      `Or open a plan in the [${doorsFile.doors.playground.label}](${doorsFile.doors.playground.url}). New here? [Get a floor plan from your AI](/start).`,
      proof,
      ...heroLines,
      fence(hero.source.trimEnd()),
      `[Open this plan in the Playground](${hero.link})`,
      text.replace(/^\n+/, ""),
    ].join("\n\n");
  }

  // The home page's agents band (a hand-written <section>).
  text = text.replace(
    /^<section[\s\S]*?^<\/section>\n?/gm,
    (block) =>
      `${stripTags(
        block
          .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
          .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`")
          .replace(/<br \/>/g, "\n")
          .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/, "## $1\n"),
      )
        .replace(/&nbsp;/g, " ")
        .replace(/&rarr;/g, "->")
        .split("\n")
        .map((l) => l.trim())
        .filter((l, i, a) => l || (a[i - 1] && a[i - 1] !== ""))
        .join("\n")}\n`,
  );

  // Whatever markup is left outside fences and inline code is a hole: fail the build.
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""); // a code span may wrap lines
  const left = /<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>/.exec(prose);
  if (left) throw new Error(`${src}: markup left in the raw markdown copy: ${left[0]}`);
  if (!/^# /m.test(text)) text = `# ArchLang\n\n${text}`;
  return `${text
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
