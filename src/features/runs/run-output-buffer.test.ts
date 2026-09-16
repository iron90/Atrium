import { describe, expect, it } from "vitest";
import {
  appendRunOutput,
  outputForRun,
  removeRunOutput,
  replaceRunOutput,
} from "./run-output-buffer";

describe("run output buffer", () => {
  it("keeps output isolated by run and caps live lines", () => {
    let buffer = appendRunOutput({}, "run-a", "one");
    buffer = appendRunOutput(buffer, "run-b", "other");
    for (let index = 0; index < 181; index += 1) {
      buffer = appendRunOutput(buffer, "run-a", String(index));
    }

    expect(outputForRun(buffer, "run-b")).toEqual(["other"]);
    expect(outputForRun(buffer, "run-a")).toHaveLength(180);
    expect(outputForRun(buffer, "run-a")[0]).toBe("1");
  });

  it("replaces and removes a run without mutating the input buffer", () => {
    const original = { "run-a": ["old"], "run-b": ["keep"] };
    const replaced = replaceRunOutput(original, "run-a", ["new"]);
    const removed = removeRunOutput(replaced, "run-a");

    expect(original).toEqual({ "run-a": ["old"], "run-b": ["keep"] });
    expect(replaced).toEqual({ "run-a": ["new"], "run-b": ["keep"] });
    expect(removed).toEqual({ "run-b": ["keep"] });
  });
});
