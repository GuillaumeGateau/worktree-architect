import { describe, expect, it } from "vitest";
import { filterAndReverseActivity, sortStepsByOrdinal } from "./feature-view-utils";

describe("feature-view-utils", () => {
  it("sorts steps by ordinal", () => {
    expect(
      sortStepsByOrdinal([
        { ordinal: 2, id: "b" },
        { ordinal: 0, id: "a" },
        { ordinal: 1, id: "m" },
      ]).map((s) => s.id)
    ).toEqual(["a", "m", "b"]);
  });

  it("filters activity by kind and reverses", () => {
    const rows = [
      { kind: "agent", id: "1", t: 1 },
      { kind: "note", id: "2", t: 2 },
      { kind: "agent", id: "3", t: 3 },
    ];
    expect(filterAndReverseActivity(rows, "all").map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(filterAndReverseActivity(rows, "agent").map((r) => r.id)).toEqual(["3", "1"]);
  });
});
