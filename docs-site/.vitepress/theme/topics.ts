// The five topic pages (PS-D6). Each answers one search a developer types, so each stays linked
// from every page through the title-block footer and from the home page's Topics row.
// test/docs-topics.test.ts holds this list to the five routes and to PAGE_META.
export const TOPICS = [
  { href: "/floor-plans-as-code", label: "Floor plans as code" },
  { href: "/floor-plan-dsl", label: "A floor plan DSL" },
  { href: "/mcp", label: "Floor plan MCP server" },
  { href: "/javascript", label: "Floor plans in JavaScript" },
  { href: "/vs-mermaid", label: "ArchLang vs Mermaid" },
] as const;
