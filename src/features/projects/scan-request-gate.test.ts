import { describe, expect, it } from "vitest";
import { LatestRequestGate } from "./scan-request-gate";

describe("latest workspace scan request", () => {
  it("keeps a newer request active when an older one finishes", () => {
    const gate = new LatestRequestGate();
    const firstRequest = gate.begin();
    const secondRequest = gate.begin();

    expect(gate.isBusy).toBe(true);
    expect(gate.isCurrent(firstRequest)).toBe(false);
    expect(gate.finish(firstRequest)).toBe(false);
    expect(gate.isBusy).toBe(true);
    expect(gate.isCurrent(secondRequest)).toBe(true);
    expect(gate.finish(secondRequest)).toBe(true);
    expect(gate.isBusy).toBe(false);
  });
});
