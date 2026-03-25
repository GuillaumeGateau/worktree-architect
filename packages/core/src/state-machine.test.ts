import { describe, expect, it } from "vitest";
import { canTransition } from "./state-machine.js";

describe("state machine", () => {
  it("allows queued to claimed", () => {
    expect(canTransition("queued", "claimed")).toBe(true);
  });
  it("disallows queued to succeeded", () => {
    expect(canTransition("queued", "succeeded")).toBe(false);
  });
});
