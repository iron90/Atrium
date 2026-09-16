import { describe, expect, it } from "vitest";
import { orderChanged, reorderProjectIds } from "./project-reorder";

describe("project reorder rules", () => {
  it("moves a project before or after an existing target", () => {
    expect(reorderProjectIds(["a", "b", "c"], "a", "c", "before")).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(reorderProjectIds(["a", "b", "c"], "a", "c", "after")).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("leaves invalid and no-op moves unchanged", () => {
    const order = ["a", "b", "c"];
    expect(reorderProjectIds(order, "b", "b", "before")).toBe(order);
    expect(reorderProjectIds(order, "b", "missing", "after")).toBe(order);
    expect(orderChanged(order, order)).toBe(false);
    expect(orderChanged(order, ["b", "a", "c"])).toBe(true);
  });
});
