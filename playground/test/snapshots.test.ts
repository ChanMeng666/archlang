import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSnapshots, snapshotName } from "../src/snapshots.js";
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

  const notices: { msg: string; undo: () => void }[] = [];
  const mount = (getSource: () => string, setSource: (src: string) => void, name = "Laneway House") => {
    const button = new FakeEl();
    notices.length = 0;
    mountSnapshots({
      button: button as unknown as HTMLButtonElement,
      getSource,
      setSource,
      getName: () => name,
      notify: (msg, undo) => notices.push({ msg, undo }),
    });
    return dom.lastAppended(); // the popover mountSnapshots appends to <body>
  };

  it("saves the current source to localStorage, newest first, named for the plan and the time, asking nothing", () => {
    // A prompt would answer this; it must never be asked (audit U6: Cancel used to save anyway).
    const asked = vi.fn(() => "Typed name");
    dom.setPrompt(asked);
    const pop = mount(() => "plan src", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    const saved = readJSON<StoredSnap[]>(KEYS.snapshots, []);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: snapshotName("Laneway House", new Date(saved[0]!.ts)), src: "plan src" });
    expect(saved[0]!.name).toMatch(/^Laneway House · \d\d:\d\d$/);
    expect(asked).not.toHaveBeenCalled();
  });

  it("names a snapshot of a plan with no name `Plan`, at the local time, zero-padded", () => {
    expect(snapshotName("", new Date(2026, 10, 27, 9, 5))).toBe("Plan · 09:05");
    expect(snapshotName("Edited plan", new Date(2026, 10, 27, 14, 32))).toBe("Edited plan · 14:32");
  });

  it("unshifts new saves ahead of pre-existing snapshots", () => {
    writeJSON(KEYS.snapshots, [{ name: "seed", src: "seed src", ts: 1 }]);
    const pop = mount(() => "new src", vi.fn(), "Second");

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    const saved = readJSON<StoredSnap[]>(KEYS.snapshots, []);
    expect(saved.map((s) => s.name.replace(/ · .*/, ""))).toEqual(["Second", "seed"]);
  });

  it("does not save when the source is blank", () => {
    dom.setPrompt(() => "Ignored");
    const pop = mount(() => "   ", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-save": {} }));

    expect(readJSON<StoredSnap[]>(KEYS.snapshots, [])).toHaveLength(0);
  });

  it("restores a snapshot's source through setSource, says so, and its Undo puts the plan before back", () => {
    writeJSON(KEYS.snapshots, [{ name: "a", src: "AAA", ts: 1 }]);
    const setSource = vi.fn();
    const pop = mount(() => "x", setSource);

    pop.dispatch("click", clickOn({ ".snap-restore": { dataset: { i: "0" } } }));

    expect(setSource).toHaveBeenCalledWith("AAA");
    expect(notices.map((n) => n.msg)).toEqual(["Restored “a”"]);
    notices[0]!.undo();
    expect(setSource).toHaveBeenLastCalledWith("x");
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

  it("says a delete happened, and its Undo puts the snapshot back where it was", () => {
    writeJSON(KEYS.snapshots, [
      { name: "a", src: "A", ts: 1 },
      { name: "b", src: "B", ts: 2 },
      { name: "c", src: "C", ts: 3 },
    ]);
    const pop = mount(() => "x", vi.fn());

    pop.dispatch("click", clickOn({ ".snap-del": { dataset: { i: "1" } } }));
    expect(notices.map((n) => n.msg)).toEqual(["Deleted “b”"]);
    expect(readJSON<StoredSnap[]>(KEYS.snapshots, []).map((s) => s.name)).toEqual(["a", "c"]);

    notices[0]!.undo();
    expect(readJSON<StoredSnap[]>(KEYS.snapshots, []).map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});
