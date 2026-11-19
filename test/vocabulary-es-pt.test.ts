/**
 * Spanish and Portuguese room words (backlog NR.16, product-roadmap RM-D68): the label classifier
 * (`USE_VOCABULARY` / `FALLBACK_USE_VOCABULARY`, `src/vocabulary.ts`) and the intent concept table
 * (`CONCEPTS`, `src/intent-concepts.ts`) read a small, closed set of es/pt words, compared without
 * accents and token-bounded like every English word.
 *
 * Pinned here: one label per language per use kind and per concept the change touched, through
 * `describe()` (so a concept is judged on the room `describe()` reports, `uses` and `room_type`
 * included), the accent fold ("Bano" = "Baño", a decomposed "ñ" too), the unchanged public
 * `normalizeLabel`, the token boundary, and the deliberate absences and the one guard. That no
 * English answer moves is held by `test/vocabulary-matcher-oracle.test.ts` (the matcher against
 * its per-word oracle) and `test/vocabulary-equivalence.test.ts` (the corpus classification).
 */

import { describe, expect, it } from "vitest";
import type { RoomSummary } from "../src/describe.js";
import { describe as describePlan } from "../src/index.js";
import { SYNONYMS_VERSION, roomsMatchingConcept } from "../src/intent-concepts.js";
import { classifyLabelUses, normalizeLabel, synonymMatchesLabel } from "../src/vocabulary.js";

/** One storey of 3000 × 3000 rooms in a row, one per label, no `uses` authored. */
function roomsOf(labels: readonly string[]): RoomSummary[] {
  const rooms = labels.map((l, i) => `  room id=r${i} at (${i * 3000},0) size 3000x3000 label "${l}"`).join("\n");
  const src = `plan "t" {\n  units mm\n${rooms}\n}`;
  const d = describePlan(src);
  expect(d.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  return d.rooms;
}

/** A label's classified uses, read off `describe()`. */
const usesOf = (label: string): string[] => roomsOf([label])[0]!.uses;

/** Whether a room labelled `label` (as `describe()` reports it) satisfies `concept`. */
const satisfies = (concept: string, label: string): boolean =>
  roomsMatchingConcept(concept, roomsOf([label])).length === 1;

/** [label, uses] per language; every use kind the change gave a word. */
const USES: Record<"es" | "pt", readonly (readonly [string, readonly string[]])[]> = {
  es: [
    ["Dormitorio 1", ["bedroom"]],
    ["Recámara principal", ["bedroom"]],
    ["Habitación 2", ["bedroom"]],
    ["Baño", ["bath"]],
    ["Aseo", ["wc"]],
    ["Cocina", ["kitchen"]],
    ["Comedor", ["dining"]],
    ["Sala de estar", ["living"]],
    ["Entrada", ["entry"]],
    ["Recibidor", ["entry"]],
    ["Vestíbulo", ["entry"]],
    ["Pasillo", ["hall"]],
    ["Distribuidor", ["hall"]],
    ["Rellano", ["hall"]],
    ["Garaje", ["garage"]],
    ["Cochera", ["garage"]],
    ["Despensa", ["storage"]],
    ["Trastero", ["storage"]],
    ["Armario", ["storage"]],
    ["Vestidor", ["storage"]],
    ["Escritorio", ["office"]],
    ["Estudio", ["office"]],
    ["Oficina", ["office"]],
    ["Lavandería", ["utility"]],
    ["Lavadero", ["utility"]],
  ],
  pt: [
    ["Quarto 1", ["bedroom"]],
    ["Dormitório", ["bedroom"]],
    ["Quarto de hóspedes", ["bedroom"]],
    ["Banheiro", ["bath"]],
    ["Banheiro da suíte", ["bath"]],
    ["Casa de banho", ["bath"]],
    ["Quarto de banho", ["bath"]],
    ["Lavabo", ["wc"]],
    ["Cozinha", ["kitchen"]],
    ["Sala de jantar", ["dining"]],
    ["Sala de estar", ["living"]],
    ["Entrada", ["entry"]],
    ["Corredor", ["hall"]],
    ["Patamar", ["hall"]],
    ["Garagem", ["garage"]],
    ["Despensa", ["storage"]],
    ["Roupeiro", ["storage"]],
    ["Armário", ["storage"]],
    ["Escritório", ["office"]],
    ["Lavanderia", ["utility"]],
    ["Área de serviço", ["utility"]],
  ],
};

describe("NR.16: Spanish and Portuguese labels classify (describe().rooms[].uses)", () => {
  for (const lang of ["es", "pt"] as const)
    it(`${lang}: one label per use kind`, () => {
      const rows = USES[lang];
      const rooms = roomsOf(rows.map(([l]) => l));
      expect(rooms.map((r) => [r.label, r.uses])).toEqual(rows.map(([l, u]) => [l, u]));
    });

  it("an indirect word classifies through an alias, as an English one does (W_ALIAS_MATCH's hook)", () => {
    for (const [l, kind, word] of [
      ["Habitación", "bedroom", "habitación"],
      ["Aseo", "wc", "aseo"],
      ["Lavabo", "wc", "lavabo"],
      ["Vestíbulo", "entry", "vestíbulo"],
      ["Distribuidor", "hall", "distribuidor"],
      ["Cochera", "garage", "cochera"],
      ["Estudio", "office", "estudio"],
      ["Oficina", "office", "oficina"],
    ] as const)
      expect(classifyLabelUses(l), l).toEqual({ uses: [kind], aliases: [{ kind, word }] });
    for (const l of ["Dormitorio", "Quarto", "Baño", "Cocina", "Garagem", "Despensa", "Escritório"])
      expect(classifyLabelUses(l).aliases, l).toEqual([]);
  });

  it("two kinds in one label, in the classifier's emission order", () => {
    expect(usesOf("Cocina-comedor")).toEqual(["kitchen", "dining"]);
    expect(usesOf("Sala de estar/jantar")).toEqual(["living", "dining"]);
    expect(usesOf("Hall de entrada")).toEqual(["entry"]);
    expect(usesOf("Dormitorio con baño")).toEqual(["bedroom", "bath"]);
  });
});

/** [concept, es label, pt label]: every concept the change gave a word, one label per language. */
const CONCEPT_ROWS: readonly (readonly [string, string, string])[] = [
  ["bathroom", "Baño", "Banheiro"],
  ["bedroom", "Dormitorio", "Quarto 2"],
  ["consulting-room", "Consultorio", "Consultório"],
  ["corridor", "Pasillo", "Circulação"],
  ["dining", "Comedor", "Sala de jantar"],
  ["hall", "Recibidor", "Entrada"],
  ["kitchen", "Cocina", "Cozinha"],
  ["kitchenette", "Cocina", "Cozinha"],
  ["living-room", "Sala de estar", "Sala de estar"],
  ["main-bathroom", "Baño principal", "Banheiro social"],
  ["master-bedroom", "Dormitorio principal", "Quarto principal"],
  ["meeting-room", "Sala de reuniones", "Sala de reuniões"],
  ["open-office", "Escritorio", "Escritório"],
  ["private-office", "Escritorio", "Escritório"],
  ["reception", "Recepción", "Recepção"],
  ["study", "Escritorio", "Escritório"],
  ["unit", "Apartamento", "Apartamento"],
  ["utility", "Lavandería", "Área de serviço"],
  ["wc", "Aseo", "Lavabo"],
  ["wet-room", "Baño", "Casa de banho"],
];

describe("NR.16: Spanish and Portuguese labels satisfy brief concepts (roomsMatchingConcept)", () => {
  for (const [concept, es, pt] of CONCEPT_ROWS)
    it(`${concept}: "${es}" (es) and "${pt}" (pt)`, () => {
      expect(satisfies(concept, es)).toBe(true);
      expect(satisfies(concept, pt)).toBe(true);
    });

  it("a word left out of the concept labels reaches its concept through uses and room_type", () => {
    // "Quarto" and "habitación" also name any room, so they are no bedroom LABEL; the classifier
    // reads them, and describe() gives the room `uses bedroom`.
    for (const l of ["Quarto", "Habitación"]) expect(satisfies("bedroom", l), l).toBe(true);
    expect(satisfies("study", "Estudio")).toBe(true);
  });

  it("the table's version moved with it", () => {
    expect(SYNONYMS_VERSION).toBe(2);
  });
});

describe("NR.16: accents are folded for comparison only", () => {
  it("'Bano' is 'Baño', in either Unicode form and any case", () => {
    for (const l of ["Baño", "Bano", "BAÑO", "Baño", "baño 2", "Baño2"]) {
      expect(classifyLabelUses(l).uses, l).toEqual(["bath"]);
      expect(satisfies("bathroom", l), l).toBe(true);
    }
    for (const l of ["Dormitório", "Dormitorio", "DORMITÓRIO", "Dormitório"])
      expect(classifyLabelUses(l).uses, l).toEqual(["bedroom"]);
    expect(classifyLabelUses("Lavanderia")).toEqual(classifyLabelUses("Lavandería"));
    expect(classifyLabelUses("Area de servico")).toEqual(classifyLabelUses("Área de serviço"));
  });

  it("both sides fold: a synonym written with accents matches a label without them, and back", () => {
    expect(synonymMatchesLabel("baño", "Bano")).toBe(true);
    expect(synonymMatchesLabel("bano", "Baño")).toBe(true);
    expect(synonymMatchesLabel("café", "Cafe")).toBe(true);
  });

  it("normalizeLabel's public output keeps its accents", () => {
    expect(normalizeLabel("Baño Principal")).toBe("baño principal");
    expect(normalizeLabel("Área_de-serviço")).toBe("área de serviço");
    expect(normalizeLabel("Baño")).toBe("baño");
  });

  it("a letter that is not an accented Latin one stays itself (ł, ß, CJK)", () => {
    for (const l of ["Łazienka", "Straße", "卫生间", "Küche"]) expect(classifyLabelUses(l).uses, l).toEqual([]);
  });
});

describe("NR.16: token-bounded, never a substring", () => {
  it("a word inside a longer word does not match", () => {
    for (const l of [
      "Bañoxyz",
      "Cocinas",
      "Pasillos",
      "Quartos",
      "Comedores",
      "Garajes",
      "Escritorios",
      "Subcocina",
      "Entradas",
      "Cocinero",
      "Quartzo",
      "Dormitorios",
    ])
      expect(classifyLabelUses(l).uses, l).toEqual([]);
    expect(satisfies("kitchen", "Cocinas")).toBe(false);
    expect(satisfies("dining", "Comedores")).toBe(false);
  });

  it("a fused numeric suffix still reads, as in English ('Bedroom2')", () => {
    expect(classifyLabelUses("Quarto2").uses).toEqual(["bedroom"]);
    expect(classifyLabelUses("Baño3").uses).toEqual(["bath"]);
  });
});

describe("NR.16: the deliberate absences and the one guard", () => {
  it("'quarto de banho' (European Portuguese) is a bathroom, not a bedroom", () => {
    expect(classifyLabelUses("Quarto de banho")).toEqual({ uses: ["bath"], aliases: [] });
    expect(classifyLabelUses("Quarto de banho 2")).toEqual({ uses: ["bath"], aliases: [] });
    expect(satisfies("bedroom", "Quarto de banho")).toBe(false);
    expect(satisfies("bathroom", "Quarto de banho")).toBe(true);
    // The guard is the phrase: any other quarto is still a bedroom.
    expect(classifyLabelUses("Quarto de casal").uses).toEqual(["bedroom"]);
  });

  it("a bare 'sala', 'salón', 'suíte', 'cuarto', 'balcón' and 'varanda' classify to nothing", () => {
    // "Sala" is any room, "salón" folds to the English "salon", a Brazilian suíte is a bedroom
    // while "Banheiro da suíte" is its bathroom, "cuarto" is any room, and a balcony is an
    // `outdoor` surface in English too.
    for (const l of ["Sala", "Sala 2", "Salón", "Suíte", "Cuarto", "Balcón", "Varanda", "Sala de máquinas"])
      expect(classifyLabelUses(l).uses, l).toEqual([]);
    expect(satisfies("living-room", "Sala")).toBe(false);
    expect(satisfies("living-room", "Salón")).toBe(false);
    expect(satisfies("bedroom", "Suíte")).toBe(false);
  });

  it("a Spanish or Portuguese word never displaces an English one: authored uses still win", () => {
    const src = `plan "t" {
  units mm
  room id=r at (0,0) size 3000x3000 label "Dormitorio" uses office
}`;
    expect(describePlan(src).rooms[0]!.uses).toEqual(["office"]);
  });
});
