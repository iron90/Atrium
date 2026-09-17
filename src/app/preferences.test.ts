import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_PREFERENCES_BYTES,
  PREFERENCES_STORAGE_KEY,
  parseLocalPreferences,
  persistLocalPreferences,
  readLocalPreferences,
} from "./preferences";

afterEach(() => {
  window.localStorage.clear();
});

describe("local preferences", () => {
  it("parses only supported preference values", () => {
    const preferences = parseLocalPreferences(
      JSON.stringify({
        theme: "warm-ink",
        layout: "matrix",
        language: "zh",
        rootPath: " /workspace ",
        workspaces: ["/one", "", 42],
        excludeNames: ["node_modules", " ", null],
        projectMeta: {
          alpha: { favorite: true, hidden: "yes", order: 3 },
          beta: { favorite: false },
        },
      }),
    );

    expect(preferences).toEqual({
      theme: "warm-ink",
      layout: "matrix",
      language: "zh",
      rootPath: " /workspace ",
      workspaces: ["/one"],
      excludeNames: ["node_modules"],
      projectMeta: {
        alpha: { favorite: true, hidden: false },
        beta: { favorite: false, hidden: false },
      },
    });
  });

  it("round-trips preferences through the browser storage boundary", () => {
    persistLocalPreferences({
      theme: "mist-silver",
      layout: "overview",
      language: "en",
      rootPath: "/workspace",
    });

    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
    expect(readLocalPreferences()).toEqual({
      theme: "mist-silver",
      layout: "overview",
      language: "en",
      rootPath: "/workspace",
    });
  });

  it("ignores malformed persisted data", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "not-json");

    expect(readLocalPreferences()).toEqual({});
    expect(parseLocalPreferences(JSON.stringify(["invalid"]))).toEqual({});
  });

  it("bounds persisted input before parsing and normalizing it", () => {
    const oversized = JSON.stringify({
      rootPath: "x".repeat(MAX_PREFERENCES_BYTES),
    });

    expect(parseLocalPreferences(oversized)).toEqual({});
    expect(
      parseLocalPreferences(
        JSON.stringify({
          workspaces: Array.from(
            { length: 130 },
            (_, index) => `/workspace/${index}`,
          ),
        }),
      ).workspaces,
    ).toHaveLength(128);
  });

  it("does not replace a valid stored snapshot with an oversized one", () => {
    persistLocalPreferences({ rootPath: "/workspace" });
    const previous = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);

    persistLocalPreferences({
      rootPath: "x".repeat(MAX_PREFERENCES_BYTES),
    });

    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBe(previous);
  });
});
