import { describe, expect, it } from "vitest";
import { canStartFeature, canCancelFeature } from "./feature-state-machine.js";

describe("feature state machine", () => {
  it("allows start from draft and ready", () => {
    expect(canStartFeature("draft")).toBe(true);
    expect(canStartFeature("ready")).toBe(true);
    expect(canStartFeature("executing")).toBe(false);
  });
  it("allows cancel for non-terminal flow", () => {
    expect(canCancelFeature("executing")).toBe(true);
    expect(canCancelFeature("completed")).toBe(false);
  });
});
