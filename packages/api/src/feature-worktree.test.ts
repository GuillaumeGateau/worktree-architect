import { describe, expect, it } from "vitest";
import { sanitizeFeatureIdForFs } from "./feature-worktree.js";

describe("feature-worktree", () => {
  it("sanitizeFeatureIdForFs strips unsafe chars", () => {
    expect(sanitizeFeatureIdForFs("ab/c:d*")).toBe("ab-c-d-");
  });
});
