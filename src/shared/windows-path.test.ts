import { describe, expect, it } from "vitest";
import { normalizeWindowsPath } from "./windows-path";

describe("normalizeWindowsPath", () => {
  it("drops the verbatim prefix from a normal drive path", () => {
    expect(normalizeWindowsPath("\\\\?\\D:\\A_Projects\\SpinningTop")).toBe(
      "D:\\A_Projects\\SpinningTop",
    );
  });

  it("rewrites a verbatim UNC path to a legacy UNC path", () => {
    expect(normalizeWindowsPath("\\\\?\\UNC\\files\\share\\repo")).toBe(
      "\\\\files\\share\\repo",
    );
  });

  it("leaves posix paths, legacy windows paths, and extended paths alone", () => {
    expect(normalizeWindowsPath("/Users/ryu/Atrium")).toBe("/Users/ryu/Atrium");
    expect(normalizeWindowsPath("D:\\A_Projects\\SpinningTop")).toBe(
      "D:\\A_Projects\\SpinningTop",
    );
    expect(normalizeWindowsPath("\\\\?\\D:\\COM1\\repo")).toBe(
      "\\\\?\\D:\\COM1\\repo",
    );

    const extended = `\\\\?\\D:\\${"a".repeat(260)}`;
    expect(normalizeWindowsPath(extended)).toBe(extended);
  });
});
