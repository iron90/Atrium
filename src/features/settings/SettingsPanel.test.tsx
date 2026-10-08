import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "../../bridge";
import { SettingsPanel } from "./SettingsPanel";
import type { InspectorSectionId } from "../projects/inspector-section-visibility";
import type { AppUpdateController, AppUpdateState } from "./use-app-update";

const idleUpdateState: AppUpdateState = {
  phase: "idle",
  info: null,
  progress: null,
  errorKind: null,
  lastCheckedAt: null,
};

function makeUpdateController(
  state: Partial<AppUpdateState> = {},
): AppUpdateController & { check: ReturnType<typeof vi.fn> } {
  return {
    state: { ...idleUpdateState, ...state },
    check: vi.fn(),
    install: vi.fn(),
    restart: vi.fn(),
    openReleasePage: vi.fn(),
  } as AppUpdateController & { check: ReturnType<typeof vi.fn> };
}

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
  hiddenInspectorSections: [] as InspectorSectionId[],
  onToggleInspectorSection: vi.fn(),
  appVersion: "0.1.0",
  update: makeUpdateController(),
  autoCheckUpdates: true,
  onAutoCheckUpdatesChange: vi.fn(),
  inAppInstallSupported: true,
});

describe("workspace exclusions", () => {
  it("adds a picked folder's name to the exclusions", async () => {
    const setExcludeNames = vi.fn();
    const pickSpy = vi
      .spyOn(bridge, "pickWorkspaceDirectory")
      .mockResolvedValue("/ws/demo/node_modules");
    render(
      <SettingsPanel {...baseProps()} setExcludeNames={setExcludeNames} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add excluded folder" }),
    );
    await vi.waitFor(() =>
      expect(setExcludeNames).toHaveBeenCalledWith(["node_modules"]),
    );
    pickSpy.mockRestore();
  });

  it("skips a folder whose name is already excluded", async () => {
    const setExcludeNames = vi.fn();
    const pickSpy = vi
      .spyOn(bridge, "pickWorkspaceDirectory")
      .mockResolvedValue("/ws/demo/node_modules");
    render(
      <SettingsPanel
        {...baseProps()}
        excludeNames={["node_modules"]}
        setExcludeNames={setExcludeNames}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add excluded folder" }),
    );
    await vi.waitFor(() => expect(pickSpy).toHaveBeenCalled());
    expect(setExcludeNames).not.toHaveBeenCalled();
    pickSpy.mockRestore();
  });

  it("removes an exclusion row", () => {
    const setExcludeNames = vi.fn();
    render(
      <SettingsPanel
        {...baseProps()}
        excludeNames={["node_modules", "target"]}
        setExcludeNames={setExcludeNames}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove excluded directory node_modules",
      }),
    );
    expect(setExcludeNames).toHaveBeenCalledWith(["target"]);
  });
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
      "Check for updates on startup",
    ]);
  });

  it("shows the current version and reports update checks", () => {
    const update = makeUpdateController();
    render(<SettingsPanel {...baseProps()} update={update} />);

    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(update.check).toHaveBeenCalledTimes(1);
  });

  it("offers install and download-page fallback when an update is available", () => {
    const update = makeUpdateController({
      phase: "available",
      info: { version: "0.2.0", notes: "Bug fixes", date: "" },
      lastCheckedAt: 1_000,
    });
    render(<SettingsPanel {...baseProps()} update={update} />);

    expect(screen.getByText("Update available: 0.2.0")).toBeInTheDocument();
    expect(screen.getByText("Bug fixes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(update.install).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open download page" }));
    expect(update.openReleasePage).toHaveBeenCalledWith(
      "https://github.com/iron90/Atrium/releases/latest",
    );
  });

  it("shows the english release notes in both interface languages", () => {
    const notes = [
      "从下方资产下载对应平台的安装包。在终端执行一次：xattr -rd com.apple.quarantine /Applications/Atrium.app",
      "",
      "---",
      "",
      "Download the installer for your platform from the assets below. Run once: xattr -rd com.apple.quarantine /Applications/Atrium.app",
    ].join("\n");
    const update = makeUpdateController({
      phase: "available",
      info: { version: "0.3.2", notes, date: "" },
    });

    const { rerender } = render(
      <SettingsPanel {...baseProps()} language="zh" update={update} />,
    );

    expect(screen.getByText(/Download the installer/)).toBeInTheDocument();
    expect(screen.queryByText(/从下方资产下载/)).not.toBeInTheDocument();
    expect(screen.getByText(/xattr -rd/)).toBeInTheDocument();

    rerender(<SettingsPanel {...baseProps()} language="en" update={update} />);

    expect(screen.getByText(/Download the installer/)).toBeInTheDocument();
    expect(screen.queryByText(/从下方资产下载/)).not.toBeInTheDocument();
  });

  it("falls back to the download page where in-app install is unsupported", () => {
    const update = makeUpdateController({
      phase: "available",
      info: { version: "0.2.0", notes: "", date: "" },
    });
    render(
      <SettingsPanel
        {...baseProps()}
        update={update}
        inAppInstallSupported={false}
      />,
    );

    expect(screen.getByText("Update available: 0.2.0")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update now" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open download page" }),
    ).toBeInTheDocument();
  });

  it("toggles the startup update check", () => {
    const onAutoCheckUpdatesChange = vi.fn();
    render(
      <SettingsPanel
        {...baseProps()}
        autoCheckUpdates={false}
        onAutoCheckUpdatesChange={onAutoCheckUpdatesChange}
      />,
    );

    const startupSwitch = screen.getByRole("switch", {
      name: "Check for updates on startup",
    });
    expect(startupSwitch).not.toBeChecked();
    fireEvent.click(startupSwitch);
    expect(onAutoCheckUpdatesChange).toHaveBeenCalledWith(true);
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
