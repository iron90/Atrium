import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

afterEach(cleanup);

const baseProps = () => ({
  theme: "deep-ocean" as const,
  setTheme: vi.fn(),
  layout: "overview" as const,
  setLayout: vi.fn(),
  language: "en" as const,
  setLanguage: vi.fn(),
  workspacePaths: [] as string[],
  onWorkspacePathsChange: vi.fn(),
  excludeNames: [] as string[],
  setExcludeNames: vi.fn(),
  onScan: vi.fn(),
  isScanning: false,
  onToggleInspectorSection: vi.fn(),
});

describe("settings detail-card switches", () => {
  it("lists every hideable section in detail-card order", () => {
    render(
      <SettingsPanel
        {...baseProps()}
        hiddenInspectorSections={[]}
        onToggleInspectorSection={vi.fn()}
      />,
    );

    const names = screen
      .getAllByRole("switch")
      .map((control) => control.closest("label")?.textContent);

    expect(names).toEqual([
      "Storage",
      "Build profiles",
      "Discovered repository commands",
      "Persistent run history",
      "Recent commits",
    ]);
  });

  it("reflects hidden sections and reports toggle requests", () => {
    const onToggleInspectorSection = vi.fn();
    render(
      <SettingsPanel
        {...baseProps()}
        hiddenInspectorSections={["storage", "recentCommits"]}
        onToggleInspectorSection={onToggleInspectorSection}
      />,
    );

    expect(screen.getByRole("switch", { name: "Storage" })).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Recent commits" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Build profiles" }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("switch", { name: "Build profiles" }));
    expect(onToggleInspectorSection).toHaveBeenCalledWith("buildProfiles");
  });
});
