import { describe, expect, it } from "vitest";
import { looksLikeMissingDependency } from "./missing-dependency-signature";

describe("missing dependency signature", () => {
  it("recognizes the usual missing dependency output", () => {
    for (const output of [
      "Error: Cannot find module 'vite'",
      "Module not found: Error: Can't resolve './app'",
      "ModuleNotFoundError: No module named 'cutout'",
      "sh: 1: tauri: command not found",
      "'tauri' is not recognized as an internal or external command",
      "error: failed to fetch `https://crates.io/api/v1/crates/tauri`",
      "error: package `left-pad` not found",
      "error: no such file or directory: /repo/node_modules/vite/bin/vite.js",
    ]) {
      expect(looksLikeMissingDependency(output)).toBe(true);
    }
  });

  it("stays silent on ordinary failures so the guess never becomes noise", () => {
    for (const output of [
      "error[E0308]: mismatched types",
      "test failed: 2 assertions failed",
      "error: the following arguments were not expected: --out-dir",
      "warning: unused variable `x`",
      // Ambiguous: a missing interpreter and a missing script look the same,
      // so the guess stays quiet instead of sending the user to Install.
      "python: can't open file '/repo/src/main.py': [Errno 2] No such file or directory",
    ]) {
      expect(looksLikeMissingDependency(output)).toBe(false);
    }
  });
});
