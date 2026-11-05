/**
 * The five topic pages stay linked (public-surfaces PS-D6).
 *
 * `/floor-plans-as-code`, `/floor-plan-dsl`, `/mcp`, `/javascript` and `/vs-mermaid` each answer
 * one developer search. The nav went down to five slots and none of them is a topic page, so the
 * pages would be reachable only through the sidebar and an old dropdown that no longer exists. They
 * are linked instead from the title-block footer on every page and from the home page's Topics row,
 * both rendering the one `TOPICS` list in `docs-site/.vitepress/theme/topics.ts`. This holds that
 * list to the five routes, each to a real page with a PAGE_META row, and both renderers to the list.
 *
 * Source-level on purpose: the e2e suite proves the built links resolve (routes.spec.ts fetches every
 * route); this is the part that fails in `check:quick` the moment a topic is dropped.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** The five, as the decision record names them. */
const FIVE = ["/floor-plans-as-code", "/floor-plan-dsl", "/mcp", "/javascript", "/vs-mermaid"];

const topicsSrc = read("docs-site/.vitepress/theme/topics.ts");
const hrefs = [...topicsSrc.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]!);

describe("the topic pages stay linked", () => {
  it("TOPICS lists exactly the five topic pages", () => {
    expect([...hrefs].sort()).toEqual([...FIVE].sort());
  });

  it("each topic is a hand-written page with a PAGE_META row", () => {
    const config = read("docs-site/.vitepress/config.ts");
    for (const href of FIVE) {
      expect(existsSync(`docs-site${href}.md`), `docs-site${href}.md`).toBe(true);
      expect(config, `PAGE_META has no row for ${href}`).toContain(`    "${href}",\n`);
    }
  });

  it("the title-block footer renders every topic on every page", () => {
    const footer = read("docs-site/.vitepress/theme/TitleBlockFooter.vue");
    expect(footer).toMatch(/import \{ TOPICS \} from "\.\/topics"/);
    expect(footer).toMatch(/v-for="t in TOPICS"[^>]*:href="t\.href"/);
    // The footer is the site-wide layout-bottom slot, so a link there is a link on every page.
    expect(read("docs-site/.vitepress/theme/Layout.vue")).toMatch(/<template #layout-bottom>\s*<TitleBlockFooter \/>/);
  });

  it("the home page has its own Topics row from the same list", () => {
    const row = read("docs-site/.vitepress/theme/TopicsRow.vue");
    expect(row).toMatch(/import \{ TOPICS \} from "\.\/topics"/);
    expect(row).toMatch(/v-for="t in TOPICS"/);
    expect(read("docs-site/index.md")).toMatch(/^<TopicsRow \/>$/m);
  });
});
