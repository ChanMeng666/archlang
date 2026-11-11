/**
 * Where each lint ruleset number comes from, as data: a table parallel to {@link DEFAULT_RULESET}
 * and {@link LINT_PROFILES}, keyed by profile and ruleset key, with the document, clause, edition
 * and verification grade of every number. Neither ruleset object gains a field; `lint()` neither
 * reads this table nor returns any of it. Read by `lint --rules` (the CLI) and by its test, and by
 * nothing on the compile path, so the browser bundle never carries it.
 *
 * **Keys.** A scalar field is its own key (`minRoomAreaM2`); an entry of a per-use table is the
 * table's key and the use, dotted (`minRoomAreaByUseM2.wc`). `defaults` holds a row for every key
 * of {@link DEFAULT_RULESET}; `profiles[name]` holds a row for every key that profile SETS, and
 * no other. `test/lint-provenance.test.ts` derives both key lists from the ruleset objects and
 * holds this table to them, both ways.
 *
 * **Grades** ({@link VERIFICATION_GRADES}). `V`: the official text was read. `S-full`: the full
 * text was read in a third-party copy. `S-secondary`: a paraphrase, a summary, a handout, a forum
 * or an article quoting the clause. `M`: a magazine. `convention`: ArchLang's own choice, with no
 * literature behind the number. Each row restates the tag of the source comment in
 * `src/lint/ruleset.ts`, read against the research record that comment names: a `[V]` read in a
 * university's or a transcriber's copy is `S-full`, and an `[S]` stays `S-secondary` until the full
 * text is read. Advisory, never compliance (ADR 0005).
 */

import { DEFAULT_RULESET, LINT_PROFILES, type LintRuleset, resolveRuleset } from "./ruleset.js";

/** The five verification grades, strongest first. */
export const VERIFICATION_GRADES = ["V", "S-full", "S-secondary", "M", "convention"] as const;
export type VerificationGrade = (typeof VERIFICATION_GRADES)[number];

/** A document a number is read from. */
export interface RuleSource {
  document: string;
  /** The clause, table, diagram or paragraph, as the document numbers it; `null` when it has none. */
  clause: string | null;
  /** The edition, year or date read; `null` when the document states none. */
  edition: string | null;
  verification: Exclude<VerificationGrade, "convention">;
  /** How the text was read, when the grade needs the reason. */
  note?: string;
}

/** A number ArchLang chose itself. */
export interface RuleConvention {
  verification: "convention";
  note?: string;
}

/** One row: the source the number is taken from, and any further sources that agree with it. */
export type RuleProvenance = (RuleSource & { also?: readonly RuleSource[] }) | RuleConvention;

const CONVENTION: RuleConvention = { verification: "convention" };
const conv = (note: string): RuleConvention => ({ verification: "convention", note });

// --- the documents, one place each --------------------------------------------------------------

/** GB 50096-2011, read in full in a university-hosted PDF (`archlang-lab` prior-art.md §3.1). */
const gb50096 = (clause: string): RuleSource => ({
  document: "GB 50096-2011 住宅设计规范 (Design code for residential buildings)",
  clause,
  edition: "2011",
  verification: "S-full",
  note: "full text read in a third-party copy, not the publisher's; partly superseded by GB 55038-2025, not yet read",
});
/** GB 50096-2011 5.7.4, read only in an article quoting it. */
const gb50096Stair = (clause: string): RuleSource => ({
  ...gb50096(clause),
  verification: "S-secondary",
  note: "read in an article quoting the clause (gf.cabr-fire.com, article 7235), not the full text",
});
const ndss = (clause: string): RuleSource => ({
  document: "Nationally Described Space Standard",
  clause,
  edition: "2015",
  verification: "V",
});
const adm = (clause: string, edition = "2015"): RuleSource => ({
  document: "Approved Document M, Volume 1: Dwellings",
  clause,
  edition,
  verification: "V",
});
const admHall: RuleSource = {
  ...adm("M4(2), hall width"),
  verification: "S-secondary",
  note: "second-hand: guidance summaries, not the Approved Document's text",
};
const adk = (clause: string): RuleSource => ({
  document: "Approved Document K",
  clause,
  edition: "2013",
  verification: "V",
});
/** IRC 2021: the ICC text was not readable; every figure is from a jurisdiction handout or summary. */
const irc = (clause: string, note = "read in jurisdiction handouts, not the ICC text"): RuleSource => ({
  document: "International Residential Code",
  clause,
  edition: "2021",
  verification: "S-secondary",
  note,
});
const ada = (clause: string, verification: "S-full" | "S-secondary", note: string): RuleSource => ({
  document: "2010 ADA Standards for Accessible Design",
  clause,
  edition: "2010",
  verification,
  note,
});
const buckinghamshire = (clause: string): RuleSource => ({
  document: "Buckinghamshire Council, Parking guidance for new developments",
  clause,
  edition: "2022",
  verification: "V",
});
const monmouthshire = (clause: string): RuleSource => ({
  document: "Monmouthshire County Council, SPG Domestic Garages",
  clause,
  edition: "2013",
  verification: "V",
});
const which = (): RuleSource => ({
  document: "Which?, UK mattress sizes: bed and mattress size guide",
  clause: 'table "Standard UK bed and mattress sizes"',
  edition: "8 May 2026",
  verification: "M",
});

const GB_NO_AREA = conv("exempt: GB 50096-2011 sets no area for it, and a passage is judged by its width");
const OFF = conv("off by default; a profile sets it");

/** The provenance of every number of {@link DEFAULT_RULESET}, in its key order. */
const DEFAULTS: Readonly<Record<string, RuleProvenance>> = {
  minRoomAreaM2: CONVENTION,
  minDoorWidthMm: CONVENTION,
  tolMm: CONVENTION,
  maxUnenclosedMm: CONVENTION,
  swingClearanceMm: CONVENTION,
  fixtureWallTolMm: CONVENTION,
  doorwayLandingMm: CONVENTION,
  minClearAreaM2: CONVENTION,
  minPathClearWidthMm: CONVENTION,
  maxDetourRatio: CONVENTION,
  pocketRunClearanceMm: CONVENTION,
  minCornerNibRatio: CONVENTION,
  minJunctionNibMm: {
    document: 'BuildHub forum, "Architrave offset" thread',
    clause: null,
    edition: null,
    verification: "S-secondary",
    note: "the low end of the 100-150 mm trade practice it reports",
  },
  junctionNibThicknessRatio: CONVENTION,
  minMullionMm: CONVENTION,
  minStraddleCoverMm: CONVENTION,
  wetDoorKitchenProximityMm: gb50096("5.3.5"),
  maxBoundaryGapMm: CONVENTION,
  minFaceCoverRatio: CONVENTION,
  minUnassignedM2: CONVENTION,
  minOutsideShellM2: CONVENTION,
  "minRoomAreaByUseM2.wc": gb50096("5.4.2 item 5"),
  "minRoomAreaByUseM2.bath": gb50096("5.4.2 items 2 and 3"),
  "minRoomAreaByUseM2.storage": GB_NO_AREA,
  "minRoomAreaByUseM2.utility": GB_NO_AREA,
  "minRoomAreaByUseM2.hall": GB_NO_AREA,
  "minRoomAreaByUseM2.circulation": GB_NO_AREA,
  "minRoomAreaByUseM2.entry": GB_NO_AREA,
  roomAreaFloorMode: conv('"at-least-generic" whenever a profile or the caller sets minRoomAreaM2'),
  assumeDwelling: CONVENTION,
  seatTableReachMm: CONVENTION,
  minDoubleBedroomAreaM2: OFF,
  minDoubleBedroomShortSideMm: OFF,
  minMainDoubleBedroomShortSideMm: OFF,
  minEntryPassageWidthMm: OFF,
  roomAreaMeasure: CONVENTION,
  wcSideClearanceMm: {
    ...adm("M4(2) Diagram 2.5"),
    note: "the low end of its 400-500 mm",
    also: [irc("P2705.1", "15 in (381 mm), the code minimum; read in a trade article, not the ICC text")],
  },
  wcAccessibleSideWallMaxMm: {
    ...adm("M4(2) Diagram 2.5"),
    note: "the high end of its 400-500 mm",
    also: [
      adm("M4(3) Diagrams 3.11 and 3.16", "2015, 2016 corrections"),
      ada("604.2", "S-secondary", "16-18 in (406-457 mm), second-hand"),
    ],
  },
  stairMaxRiseMm: adk("Table 1.1, private stair"),
  stairMinGoingMm: adk("Table 1.1, private stair"),
  stairMaxPitchRatio: conv("no pitch cap by default"),
  hobLandingMm: {
    document: "NKBA Kitchen Planning Guidelines with Access Standards",
    clause: "guideline 17",
    edition: null,
    verification: "V",
    note: "12 in (305 mm), the lesser of its two landing figures",
  },
  maxHingedLeafMm: {
    document: "International Building Code",
    clause: "1010.1.1",
    edition: "2018 and earlier",
    verification: "S-secondary",
    note: "quoted by the door-hardware reference iDigHardware (2018); the 2021 edition dropped the sentence",
  },
  garageDepthMm: { ...buckinghamshire("§8 Table 9"), also: [monmouthshire("¶21")] },
  exitApproachMm: irc(
    "R311.3",
    "read verbatim in two state training copies (Indiana DHS, Montana DLI), not the ICC text",
  ),
  exitApproachPullMm: conv("the same as exitApproachMm"),
  bedMinLengthMm: which(),
  bedMinWidthMm: which(),
  wallGapMm: CONVENTION,
};

/** The provenance of every number each built-in profile SETS. */
const PROFILES: Readonly<Record<string, Readonly<Record<string, RuleProvenance>>>> = {
  "residential-basic": {
    assumeDwelling: conv("the profile judges every plan as a dwelling, as its name asserts"),
  },
  "accessibility-advisory": {
    minDoorWidthMm: conv("a nominal width giving roughly the ADA's 815 mm (32 in) clear opening"),
    minRoomAreaM2: CONVENTION,
    swingClearanceMm: CONVENTION,
    doorwayLandingMm: CONVENTION,
    minPathClearWidthMm: conv("a continuous clear width for wheelchair passage"),
    wcSideClearanceMm: {
      ...adm("M4(3) Diagrams 3.11 and 3.16", "2015, 2016 corrections"),
      note: "the low end of its 450-500 mm",
      also: [ada("604.2", "S-secondary", "16-18 in (406-457 mm), second-hand")],
    },
    exitApproachMm: ada(
      "404.2.4.1, Table 404.2.4.1 (front approach, push side)",
      "S-full",
      "read in a third-party transcription of the Standards (corada.com), not the official publication",
    ),
    exitApproachPullMm: ada(
      "404.2.4.1, Table 404.2.4.1 (front approach, pull side)",
      "S-full",
      "read in a third-party transcription of the Standards (corada.com), not the official publication",
    ),
  },
  "cn-residential-advisory": {
    roomAreaMeasure: gb50096("5.2-5.4 (使用面积)"),
    "minRoomAreaByUseM2.bedroom": gb50096("5.2.1"),
    "minRoomAreaByUseM2.living": gb50096("5.2.2"),
    "minRoomAreaByUseM2.kitchen": gb50096("5.3.1"),
    minDoubleBedroomAreaM2: gb50096("5.2.1"),
    minEntryPassageWidthMm: gb50096("5.7.1"),
    "minPathClearWidthByUseMm.bedroom": gb50096("5.7.1"),
    "minPathClearWidthByUseMm.living": gb50096("5.7.1"),
    "minPathClearWidthByUseMm.kitchen": gb50096("5.7.1"),
    "minPathClearWidthByUseMm.bath": gb50096("5.7.1"),
    "minPathClearWidthByUseMm.wc": gb50096("5.7.1"),
    "minPathClearWidthByUseMm.storage": gb50096("5.7.1"),
    stairMaxRiseMm: gb50096Stair("5.7.4"),
    stairMinGoingMm: gb50096Stair("5.7.4"),
  },
  "uk-residential-advisory": {
    roomAreaMeasure: {
      ...ndss("10"),
      verification: "S-secondary",
      note: "that the areas are internal floor area is a review's reading, not quoted from the clause",
    },
    "minRoomAreaByUseM2.bedroom": ndss("10(c)"),
    minDoubleBedroomAreaM2: ndss("10(d)"),
    "minRoomShortSideByUseMm.bedroom": ndss("10(c)"),
    "minRoomShortSideByUseMm.hall": admHall,
    "minRoomShortSideByUseMm.circulation": admHall,
    "minRoomShortSideByUseMm.entry": admHall,
    minDoubleBedroomShortSideMm: ndss("10(e)"),
    minMainDoubleBedroomShortSideMm: ndss("10(e)"),
    wcSideClearanceMm: { ...adm("M4(2) Diagram 2.5"), note: "the low end of its 400-500 mm" },
    stairMaxRiseMm: adk("Table 1.1, private stair"),
    stairMinGoingMm: adk("Table 1.1, private stair"),
    stairMaxPitchRatio: { ...adk("Table 1.1 note 1, private stair"), note: "42°, as its tangent" },
    garageDepthMm: { ...monmouthshire("¶12, ¶25"), also: [buckinghamshire("§9 Table 11")] },
  },
  "us-residential-advisory": {
    roomAreaMeasure: irc("R304.1"),
    "minRoomAreaByUseM2.living": irc("R304.1"),
    "minRoomAreaByUseM2.dining": irc("R304.1"),
    "minRoomAreaByUseM2.bedroom": irc("R304.1"),
    "minRoomShortSideByUseMm.living": irc("R304.2"),
    "minRoomShortSideByUseMm.dining": irc("R304.2"),
    "minRoomShortSideByUseMm.bedroom": irc("R304.2"),
    "minRoomShortSideByUseMm.hall": irc("R311.6"),
    "minRoomShortSideByUseMm.circulation": irc("R311.6"),
    "minRoomShortSideByUseMm.entry": irc("R311.6"),
    wcSideClearanceMm: irc("P2705.1", "read in a trade article, not the ICC text"),
    stairMaxRiseMm: irc("R311.7.5.1"),
    stairMinGoingMm: irc("R311.7.5.2"),
    exitApproachMm: irc(
      "R311.3",
      "read verbatim in two state training copies (Indiana DHS, Montana DLI), not the ICC text",
    ),
  },
};

/** The parallel table: the default ruleset's rows, and each profile's rows for the keys it sets. */
export const RULE_PROVENANCE: {
  readonly defaults: Readonly<Record<string, RuleProvenance>>;
  readonly profiles: Readonly<Record<string, Readonly<Record<string, RuleProvenance>>>>;
} = { defaults: DEFAULTS, profiles: PROFILES };

/** A ruleset field whose value is a per-use table (an object), not a scalar. */
const isTable = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null;

/**
 * The provenance keys of a (partial) ruleset, in its own key order: each scalar field, and each
 * entry of a per-use table as `table.use`. A table with no entries has no key.
 */
export function rulesetKeys(rules: Partial<LintRuleset>): string[] {
  return Object.entries(rules).flatMap(([key, v]) =>
    isTable(v) ? Object.keys(v).map((use) => `${key}.${use}`) : [key],
  );
}

/** The value at a provenance key of a ruleset (`undefined` when it has none). */
function valueAt(rules: Partial<LintRuleset>, key: string): unknown {
  const dot = key.indexOf(".");
  const r = rules as Readonly<Record<string, unknown>>;
  if (dot < 0) return r[key];
  const table = r[key.slice(0, dot)];
  return isTable(table) ? table[key.slice(dot + 1)] : undefined;
}

/** A key's unit, read from the field name's suffix (`…Mm`, `…M2`, `…Ratio`); `null` for a word or a flag. */
export function unitsOf(key: string): "mm" | "m2" | "ratio" | null {
  const field = key.split(".")[0]!;
  if (field.endsWith("Mm")) return "mm";
  if (field.endsWith("M2")) return "m2";
  if (field.endsWith("Ratio")) return "ratio";
  return null;
}

/** One row of the `lint --rules` export. */
export interface EffectiveRule {
  key: string;
  value: number | string | boolean | null;
  units: "mm" | "m2" | "ratio" | null;
  /** Who set the value: `"default"`, the profile's name, or `"cascade"` where the cascade derived it
   *  ({@link resolveRuleset}: `roomAreaFloorMode` under a profile that sets `minRoomAreaM2`). */
  from: string;
  verification: VerificationGrade;
  document: string | null;
  clause: string | null;
  edition: string | null;
  note?: string;
  also?: readonly RuleSource[];
}

/** The `lint --rules --json` document. Its JSON schema is {@link LINT_RULES_SCHEMA_DRAFT}. */
export interface EffectiveRuleset {
  /** The schema is a draft: it has no `$id` yet, and the shape may still change. */
  schema: { status: "draft"; id: null };
  profile: string | null;
  advisory: string;
  rules: EffectiveRule[];
}

export const RULES_ADVISORY =
  "Advisory thresholds and where each comes from. Passing them is not compliance with any code or standard.";

function rowOf(key: string, value: unknown, from: string, p: RuleProvenance): EffectiveRule {
  const src = p.verification === "convention" ? undefined : (p as RuleSource & { also?: readonly RuleSource[] });
  return {
    key,
    value: value as EffectiveRule["value"],
    units: unitsOf(key),
    from,
    verification: p.verification,
    document: src?.document ?? null,
    clause: src?.clause ?? null,
    edition: src?.edition ?? null,
    ...(p.note !== undefined ? { note: p.note } : {}),
    ...(src?.also ? { also: src.also } : {}),
  };
}

/**
 * The ruleset `lint()` runs under `profile` (none: the default ruleset), every key with its value
 * and its provenance. The profile's own row where it sets the key, the default's elsewhere. The
 * caller has checked that `profile` is a built-in one. Pure.
 */
export function effectiveRuleset(profile?: string): EffectiveRuleset {
  const overrides = profile !== undefined ? (LINT_PROFILES[profile] ?? {}) : {};
  const own = new Set(rulesetKeys(overrides));
  const resolved = resolveRuleset(overrides);
  const rows = rulesetKeys(resolved).map((key) => {
    const value = valueAt(resolved, key);
    if (profile !== undefined && own.has(key)) return rowOf(key, value, profile, PROFILES[profile]![key]!);
    const from = value === valueAt(DEFAULT_RULESET, key) ? "default" : "cascade";
    return rowOf(key, value, from, DEFAULTS[key]!);
  });
  return { schema: { status: "draft", id: null }, profile: profile ?? null, advisory: RULES_ADVISORY, rules: rows };
}

const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["document", "clause", "edition", "verification"],
  properties: {
    document: { type: "string" },
    clause: { type: ["string", "null"] },
    edition: { type: ["string", "null"] },
    verification: { enum: VERIFICATION_GRADES.filter((g) => g !== "convention") },
    note: { type: "string" },
  },
} as const;

/**
 * The JSON schema of {@link EffectiveRuleset}, a DRAFT: it carries no `$id`, because how a schema
 * is named, versioned and deprecated is not decided yet, and it is not published as a file. The
 * enums are read from the source ({@link VERIFICATION_GRADES}).
 */
export const LINT_RULES_SCHEMA_DRAFT = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ArchLang lint ruleset with provenance (draft)",
  description: `The output of \`lint --rules --json\`. ${RULES_ADVISORY}`,
  type: "object",
  additionalProperties: false,
  required: ["schema", "profile", "advisory", "rules"],
  properties: {
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["status", "id"],
      properties: { status: { const: "draft" }, id: { type: "null" } },
    },
    profile: { type: ["string", "null"] },
    advisory: { type: "string" },
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "units", "from", "verification", "document", "clause", "edition"],
        properties: {
          key: { type: "string" },
          value: { type: ["number", "string", "boolean", "null"] },
          units: { enum: ["mm", "m2", "ratio", null] },
          from: { type: "string" },
          verification: { enum: VERIFICATION_GRADES },
          document: { type: ["string", "null"] },
          clause: { type: ["string", "null"] },
          edition: { type: ["string", "null"] },
          note: { type: "string" },
          also: { type: "array", items: sourceSchema },
        },
      },
    },
  },
} as const;
