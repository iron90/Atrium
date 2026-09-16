import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("uses the message from Error instances", () => {
    expect(errorMessage(new Error("failed to scan"))).toBe("failed to scan");
  });

  it("preserves the string representation of non-Error values", () => {
    expect(errorMessage("failed to open")).toBe("failed to open");
    expect(errorMessage(404)).toBe("404");
  });
});
