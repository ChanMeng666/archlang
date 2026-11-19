/**
 * Spanish and Portuguese room words in the use classifier (backlog NR.16, product-roadmap RM-D68):
 * `USE_VOCABULARY` / `FALLBACK_USE_VOCABULARY` (`src/vocabulary.ts`) read a small, closed set of
 * es/pt words, and `classifyLabelUses` alone compares without accents, token-bounded like every
 * English word. The intent concept table (`CONCEPTS`) and its matcher are unchanged: an es/pt
 * room reaches a concept through the `uses` the classifier gives it (or the `room_type` those
 * uses imply), never by its label.
 *
 * Pinned here, on the classifier directly (a label with no authored `uses`): one label per
 * language per use kind, the aliases, the "quarto" guard (consecutive phrases only), the accent
 * fold and what it does not fold, that nothing outside the classifier folds, the token boundary,
 * the deliberate absences, the English prefix of every row, the concepts reached through `uses`
 * and `room_type`, the label-only concepts that stay English, and `dwellingReading` on es/pt
 * flats. That no English answer moves is held by `test/vocabulary-matcher-oracle.test.ts` and
 * `test/vocabulary-equivalence.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { dwellingReading } from "../src/analyze/dwelling.js";
import type { RoomSummary } from "../src/describe.js";
import { SYNONYMS_VERSION, roomsMatchingConcept } from "../src/intent-concepts.js";
import { roomTypeForUses } from "../src/plan-json/room-types.js";
import {
  FALLBACK_USE_VOCABULARY,
  USE_VOCABULARY,
  classifyLabelUses,
  matchesLivingDining,
  nonResidentialWord,
  normalizeLabel,
  synonymMatchesLabel,
} from "../src/vocabulary.js";

/** Combining marks, built from code points so this file holds none as a raw character. */
const TILDE = String.fromCharCode(0x303);
const ACUTE = String.fromCharCode(0x301);

const usesOf = (label: string): string[] => classifyLabelUses(label).uses;

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
    ["Arrumos", ["storage"]],
    ["Roupeiro", ["storage"]],
    ["Armário", ["storage"]],
    ["Escritório", ["office"]],
    ["Lavanderia", ["utility"]],
    ["Área de serviço", ["utility"]],
  ],
};

describe("NR.16: the use classifier reads Spanish and Portuguese labels", () => {
  for (const lang of ["es", "pt"] as const)
    it(`${lang}: one label per use kind`, () => {
      for (const [l, u] of USES[lang]) expect(usesOf(l), l).toEqual(u);
    });

  it("an indirect word classifies through an alias, as an English one does (W_ALIAS_MATCH's hook)", () => {
    for (const [l, kind, word] of [
      ["Habitación", "bedroom", "habitación"],
      ["Aseo", "wc", "aseo"],
      ["Lavabo", "wc", "lavabo"],
      ["Vestíbulo", "entry", "vestíbulo"],
      ["Distribuidor", "hall", "distribuidor"],
      ["Rellano", "hall", "rellano"],
      ["Patamar", "hall", "patamar"],
      ["Cochera", "garage", "cochera"],
      ["Quarto de vestir", "storage", "quarto de vestir"],
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
    expect(matchesLivingDining("Sala de estar")).toBe(true);
    expect(matchesLivingDining("Comedor")).toBe(true);
  });
});

describe("NR.16: 'quarto' and the phrases that name another room", () => {
  it("a bathroom, a box room, a dressing room and a floor are not bedrooms", () => {
    expect(classifyLabelUses("Quarto de banho")).toEqual({ uses: ["bath"], aliases: [] });
    expect(classifyLabelUses("Quarto-de-banho 2")).toEqual({ uses: ["bath"], aliases: [] });
    expect(classifyLabelUses("Quarto de arrumos")).toEqual({ uses: ["storage"], aliases: [] });
    expect(classifyLabelUses("Quarto de despejo")).toEqual({ uses: ["storage"], aliases: [] });
    expect(classifyLabelUses("Quarto de vestir")).toEqual({
      uses: ["storage"],
      aliases: [{ kind: "storage", word: "quarto de vestir" }],
    });
    expect(usesOf("Quarto andar")).toEqual([]);
  });

  it("the guard reads consecutive words only: a bedroom with a bathroom is both, as in English", () => {
    expect(usesOf("Bedroom with en suite")).toEqual(["bedroom", "bath"]);
    expect(usesOf("Quarto de casal com casa de banho")).toEqual(["bedroom", "bath"]);
    expect(usesOf("Quarto com casa de banho privativa")).toEqual(["bedroom", "bath"]);
    expect(usesOf("Quarto de casal")).toEqual(["bedroom"]);
    expect(usesOf("Quarto de hóspedes")).toEqual(["bedroom"]);
  });
});

describe("NR.16: accents are folded in the use classifier, and only there", () => {
  it("'Bano' is 'Baño', in either Unicode form and any case", () => {
    for (const l of ["Baño", "Bano", "BAÑO", `Ban${TILDE}o`, "baño 2", "Baño2"]) expect(usesOf(l), l).toEqual(["bath"]);
    for (const l of ["Dormitório", "Dormitorio", "DORMITÓRIO", `Dormito${ACUTE}rio`])
      expect(usesOf(l), l).toEqual(["bedroom"]);
    expect(classifyLabelUses("Lavanderia")).toEqual(classifyLabelUses("Lavandería"));
    expect(classifyLabelUses("Area de servico")).toEqual(classifyLabelUses("Área de serviço"));
  });

  it("a letter canonical decomposition leaves whole is not folded", () => {
    // Each differs from a table word by one letter NFD does not split, so each would match if the
    // fold reached further than the combining marks; the accented spelling beside it does match.
    expect(usesOf("Cocína")).toEqual(["kitchen"]);
    expect(usesOf(`Coc${String.fromCharCode(0x131)}na`)).toEqual([]); // dotless i
    expect(usesOf("Dørmitorio")).toEqual([]);
    expect(usesOf("Łavabo")).toEqual([]);
    expect(usesOf("Ｃｏｃｉｎａ")).toEqual([]); // full-width: a compatibility form, not canonical
  });

  it("the concept matcher and the other readers compare exactly, as before", () => {
    expect(synonymMatchesLabel("baño", "Bano")).toBe(false);
    expect(synonymMatchesLabel("bathroom", "Bathroom")).toBe(true);
    expect(synonymMatchesLabel("cafe", "Café")).toBe(false);
    expect(nonResidentialWord("Café")).toEqual({ word: "café", ambiguous: false });
    expect(nonResidentialWord("Cafe")).toEqual({ word: "cafe", ambiguous: false });
  });

  it("normalizeLabel's public output keeps its accents", () => {
    expect(normalizeLabel("Baño Principal")).toBe("baño principal");
    expect(normalizeLabel("Área_de-serviço")).toBe("área de serviço");
    expect(normalizeLabel(`Ban${TILDE}o`)).toBe(`ban${TILDE}o`);
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
      expect(usesOf(l), l).toEqual([]);
  });

  it("a fused numeric suffix still reads, as in English ('Bedroom2')", () => {
    expect(usesOf("Quarto2")).toEqual(["bedroom"]);
    expect(usesOf("Baño3")).toEqual(["bath"]);
  });
});

describe("NR.16: the deliberate absences", () => {
  it("'sala', 'salón', 'suíte', 'cuarto', 'estudio', 'oficina' and outdoor words classify to nothing", () => {
    // "Sala" and "cuarto" are any room, "salón" folds to the English "salon", a Brazilian suíte
    // is a bedroom while "Banheiro da suíte" is its bathroom, an estudio is a studio flat as often
    // as a study, a Portuguese oficina is a workshop, and a balcony is an `outdoor` surface.
    for (const l of [
      "Sala",
      "Sala 2",
      "Salón",
      "Suíte",
      "Cuarto",
      "Estudio",
      "Oficina",
      "Balcón",
      "Varanda",
      "Sala de máquinas",
    ])
      expect(usesOf(l), l).toEqual([]);
  });
});

describe("NR.16: every row keeps its English words first, in order", () => {
  // The rows as they stood before NR.16 (main at a7924a73), frozen here on purpose: the es/pt
  // words are appended after them, so every label that matched an English word still matches the
  // same word first.
  const USE_BEFORE: Record<string, readonly [readonly string[], readonly string[]]> = {
    bedroom: [["bed", "bedroom"], []],
    bath: [
      ["bath", "bathroom", "shower"],
      ["ensuite", "en suite", "washroom"],
    ],
    wc: [["wc", "toilet"], ["powder"]],
    kitchen: [["kitchen", "kitchenette"], []],
    entry: [
      ["entry", "entrance"],
      ["foyer", "vestibule", "mudroom"],
    ],
    hall: [["hall", "hallway", "corridor"], ["landing"]],
    living: [
      ["living", "lounge"],
      ["sitting", "family"],
    ],
    dining: [["dining"], []],
    garage: [["garage"], ["carport", "car port", "parking"]],
  };
  const FALLBACK_BEFORE: Record<string, readonly [readonly string[], readonly string[]]> = {
    bedroom: [
      ["guest room", "kids room", "children's room", "master suite"],
      ["nursery", "master"],
    ],
    wc: [[], ["water closet"]],
    storage: [
      ["storage", "store", "stores", "storeroom", "closet", "wardrobe", "pantry", "larder"],
      ["dressing", "linen", "cellar"],
    ],
    office: [["office", "study"], ["consulting"]],
    utility: [
      ["utility", "laundry"],
      ["plant", "boiler"],
    ],
    living: [
      ["great room", "reception room", "drawing room"],
      ["snug", "den"],
    ],
  };
  const prefixOf = (before: readonly string[], now: readonly string[]): readonly string[] =>
    now.slice(0, before.length);

  for (const [name, table, before] of [
    ["USE_VOCABULARY", USE_VOCABULARY, USE_BEFORE],
    ["FALLBACK_USE_VOCABULARY", FALLBACK_USE_VOCABULARY, FALLBACK_BEFORE],
  ] as const)
    it(`${name}: same rows, and each list starts with its old words`, () => {
      const rows = table as Record<string, { canonical: readonly string[]; aliases: readonly string[] }>;
      expect(Object.keys(rows)).toEqual(Object.keys(before));
      for (const [k, [canonical, aliases]] of Object.entries(before)) {
        expect(prefixOf(canonical, rows[k]!.canonical), `${k} canonical`).toEqual(canonical);
        expect(prefixOf(aliases, rows[k]!.aliases), `${k} aliases`).toEqual(aliases);
      }
    });
});

/** A room as `describe()` would summarise one with no authored `uses`: the classifier's uses, and
 *  either the catch-all `Room` type (so only `uses` can satisfy a concept) or the type they imply. */
function room(label: string, type: "Room" | "fromUses" = "Room"): RoomSummary {
  const uses = classifyLabelUses(label).uses;
  return { id: "r", label, uses, room_type: type === "Room" ? "Room" : roomTypeForUses(uses) } as RoomSummary;
}
const matches = (concept: string, r: RoomSummary): boolean => roomsMatchingConcept(concept, [r]).length === 1;

describe("NR.16: brief concepts are reached through uses, never through es/pt label words", () => {
  /** [concept, es label, pt label]: the home concepts that carry `uses`. */
  const BY_USES: readonly (readonly [string, string, string])[] = [
    ["bathroom", "Baño", "Banheiro"],
    ["bedroom", "Dormitorio", "Quarto 2"],
    ["hall", "Pasillo", "Corredor"],
    ["kitchen", "Cocina", "Cozinha"],
    ["living-room", "Sala de estar", "Sala de estar"],
    ["study", "Escritorio", "Escritório"],
    ["tea-point", "Cocina", "Cozinha"],
  ];
  for (const [concept, es, pt] of BY_USES)
    it(`${concept}: "${es}" and "${pt}" match by uses alone, and by label not at all`, () => {
      for (const l of [es, pt]) {
        expect(matches(concept, room(l)), l).toBe(true);
        expect(matches(concept, { id: "r", label: l, uses: [], room_type: "Room" } as RoomSummary), l).toBe(false);
      }
    });

  /** [concept, es label, pt label]: concepts without `uses`, reached by the `room_type` uses imply. */
  const BY_TYPE: readonly (readonly [string, string, string])[] = [
    ["dining", "Comedor", "Sala de jantar"],
    ["wc", "Aseo", "Lavabo"],
    ["main-bathroom", "Baño", "Banheiro"],
    ["wet-room", "Baño", "Casa de banho"],
    ["utility", "Lavandería", "Área de serviço"],
    ["corridor", "Pasillo", "Corredor"],
    ["kitchenette", "Cocina", "Cozinha"],
  ];
  for (const [concept, es, pt] of BY_TYPE)
    it(`${concept}: "${es}" and "${pt}" match by the room_type their uses imply`, () => {
      for (const l of [es, pt]) {
        expect(matches(concept, room(l)), l).toBe(false);
        expect(matches(concept, room(l, "fromUses")), l).toBe(true);
      }
    });

  it("the label-only concepts stay English (residue: an owner-approved SYNONYMS_VERSION bump)", () => {
    for (const [concept, l] of [
      ["reception", "Recepción"],
      ["meeting-room", "Sala de reuniones"],
      ["consulting-room", "Consultorio"],
      ["private-office", "Escritório"],
      ["unit", "Apartamento"],
    ] as const)
      expect(matches(concept, room(l, "fromUses")), l).toBe(false);
    expect(SYNONYMS_VERSION).toBe(1);
  });
});

describe("NR.16: an es or pt flat reads as a dwelling", () => {
  const rooms = (labels: readonly string[]) => labels.map((label, i) => ({ id: `r${i}`, label }));

  it("a flat with a study beside its home rooms", () => {
    expect(dwellingReading(rooms(["Dormitorio", "Baño", "Cocina", "Sala de estar", "Escritorio"]))).toBe("dwelling");
    expect(dwellingReading(rooms(["Quarto", "Banheiro", "Cozinha", "Sala de estar", "Escritório"]))).toBe("dwelling");
  });

  it("a studio flat: 'Estudio' and 'Oficina' are no office, so nothing reads it as non-residential", () => {
    expect(dwellingReading(rooms(["Estudio", "Baño", "Cocina"]))).toBe("dwelling");
    expect(dwellingReading(rooms(["Oficina", "Banheiro", "Cozinha"]))).toBe("dwelling");
    // The contrast that makes the two lines above mean something: an office and no home room.
    expect(dwellingReading(rooms(["Escritorio", "Baño", "Cocina"]))).toBe("non-residential");
  });
});
