import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSnapshots } from "../src/snapshots.js";
import { KEYS, readJSON, writeJSON } from "../src/storage.js";
import { clickOn, type DomStub, FakeEl, installDom } from "./helpers.js";

interface StoredSnap {
  name: string;
  src: string;
  ts: number;
}

describe("snapshots persistence", () => {
  let dom: DomStub;

  beforeEach(() => {
    dom = installDom();
  });

  const mount = (getSource: () => string, setSource: (src: string) => void) => {
    const button = new FakeEl();
    mountSnapshots({ button: button as unknown as HTMLButtonElement, getSource, setSource });
    return dom.lastAppended(); // the popover mountSnapshots appends to <body>
  };

  it("saves the current source to localStorage, newest first", () => {
    dom.setPrompt(() => "First plan");
    const pop = mount(() => "plan src", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    const saved = readJSON<StoredSnap[]>(KEYS.snapshots, []);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "First plan", src: "plan src" });
    expect(typeof saved[0]!.ts).toBe("number");
  });

  it("unshifts new saves ahead of pre-existing snapshots", () => {
    writeJSON(KEYS.snapshots, [{ name: "seed", src: "seed src", ts: 1 }]);
    dom.setPrompt(() => "Second");
    const pop = mount(() => "new src", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    const saved = readJSON<StoredSnap[]>(KEYS.snapshots, []);
    expect(saved.map((s) => s.name)).toEqual(["Second", "seed"]);
  });

  it("does not save when the source is blank", () => {
    dom.setPrompt(() => "Ignored");
    const pop = mount(() => "   ", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    expect(readJSON<StoredSnap[]>(KEYS.snapshots, [])).toHaveLength(0);
  });

  it("restores a snapshot's source through setSource", () => {
    writeJSON(KEYS.snapshots, [{ name: "a", src: "AAA", ts: 1 }]);
    const setSource = vi.fn();
    const pop = mount(() => "x", setSource);

    pop.dispatch("click", clickOn({ ".snap-restore": { dataset: { i: "0" } } }));

    expect(setSource).toHaveBeenCalledWith("AAA");
  });

  it("deletes a snapshot and persists the shortened list", () => {
    writeJSON(KEYS.snapshots, [
      { name: "a", src: "A", ts: 1 },
      { name: "b", src: "B", ts: 2 },
    ]);
    const pop = mount(() => "x", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-del": { dataset: { i: "0" } } }));

    const saved = readJSON<StoredSnap[]>(KEYS.snapshots, []);
    expect(saved.map((s) => s.name)).toEqual(["b"]);
  });
});
