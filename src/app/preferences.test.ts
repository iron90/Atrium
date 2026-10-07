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

  it("rewrites stored windows verbatim paths to the legacy form", () => {
    const preferences = parseLocalPreferences(
      JSON.stringify({
        rootPath: "\\\\?\\D:\\A_Projects",
        workspaces: ["\\\\?\\D:\\A_Projects", "\\\\?\\UNC\\files\\share"],
        projectMeta: {
          "\\\\?\\D:\\A_Projects\\SpinningTop": { favorite: true },
          "D:\\A_Projects\\SpinningTop": { hidden: true },
        },
      }),
    );

    expect(preferences.rootPath).toBe("D:\\A_Projects");
    expect(preferences.workspaces).toEqual([
      "D:\\A_Projects",
      "\\\\files\\share",
    ]);
    expect(preferences.projectMeta).toEqual({
      "D:\\A_Projects\\SpinningTop": { favorite: true, hidden: true },
    });
  });

  it("round-trips the startup update check preference", () => {
    const preferences = parseLocalPreferences(
      JSON.stringify({ autoCheckUpdates: false }),
    );

    expect(preferences.autoCheckUpdates).toBe(false);

    persistLocalPreferences({ autoCheckUpdates: true });
    expect(readLocalPreferences().autoCheckUpdates).toBe(true);
  });

  it("keeps only known inspector sections in the hidden list", () => {
    const preferences = parseLocalPreferences(
      JSON.stringify({
        hiddenInspectorSections: [
          "storage",
          "recentCommits",
          "not-a-section",
          42,
        ],
      }),
    );

    expect(preferences.hiddenInspectorSections).toEqual([
      "storage",
      "recentCommits",
    ]);
    expect(
      parseLocalPreferences(
        JSON.stringify({ hiddenInspectorSections: "storage" }),
      ).hiddenInspectorSections,
    ).toBeUndefined();

    persistLocalPreferences({ hiddenInspectorSections: ["runHistory"] });
    expect(readLocalPreferences().hiddenInspectorSections).toEqual([
      "runHistory",
    ]);
  });

  it("round-trips preferences through the browser storage boundary", () => {
    persistLocalPreferences({
      theme: "mist-silver",
      language: "en",
      rootPath: "/workspace",
    });

    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).not.toBeNull();
    expect(readLocalPreferences()).toEqual({
      theme: "mist-silver",
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

  it("keeps persisting favorites by pruning oldest project meta entries", () => {
    const meta: Record<string, { favorite: boolean; hidden: boolean }> = {};
    for (let index = 0; index < 2048; index += 1) {
      meta[`/very/long/workspace/path/project-${index}`] = {
        favorite: index === 2047,
        hidden: false,
      };
    }
    persistLocalPreferences({ rootPath: "/workspace", projectMeta: meta });

    persistLocalPreferences({
      rootPath: "/workspace",
      projectMeta: meta,
    });
    const serialized = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    expect(serialized).not.toBeNull();
    expect(serialized!.length).toBeLessThanOrEqual(MAX_PREFERENCES_BYTES);
    expect(serialized).toContain("project-2047");
  });
});
