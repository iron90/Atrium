import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge, type NetworkProxySettings } from "../../bridge";
import { SettingsPanel } from "./SettingsPanel";
import { I18nProvider, translate } from "../../i18n";
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
  workspaceRefreshMs: 10_000 as const,
  onWorkspaceRefreshMsChange: vi.fn(),
});

describe("workspace refresh", () => {
  it("lets the user pick a refresh interval", () => {
    const onWorkspaceRefreshMsChange = vi.fn();
    render(
      <SettingsPanel
        {...baseProps()}
        workspaceRefreshMs={10_000}
        onWorkspaceRefreshMsChange={onWorkspaceRefreshMsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Automatic refresh" }));
    fireEvent.click(screen.getByRole("option", { name: "30 seconds" }));
    expect(onWorkspaceRefreshMsChange).toHaveBeenCalledWith(30_000);

    fireEvent.click(screen.getByRole("button", { name: "Automatic refresh" }));
    fireEvent.click(screen.getByRole("option", { name: "Off" }));
    expect(onWorkspaceRefreshMsChange).toHaveBeenCalledWith(0);
  });
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

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(update.check).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(update.install).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open download page" }));
    expect(update.openReleasePage).toHaveBeenCalledWith(
      "https://github.com/iron90/Atrium/releases/latest",
    );
  });

  it("shows the release notes for the selected interface language", () => {
    const notes = [
      "<!-- atrium:notes:en -->",
      "Settings on macOS can install a newer version from the version card.",
      "<!-- /atrium:notes:en -->",
      "",
      "<!-- atrium:notes:zh -->",
      "macOS 的设置页可以在版本卡片里安装更新的版本。",
      "<!-- /atrium:notes:zh -->",
      "",
      "xattr -rd com.apple.quarantine /Applications/Atrium.app",
    ].join("\n");
    const update = makeUpdateController({
      phase: "available",
      info: { version: "0.3.6", notes, date: "" },
    });

    const { rerender } = render(
      <SettingsPanel {...baseProps()} language="zh" update={update} />,
    );

    expect(screen.getByText(/版本卡片/)).toBeInTheDocument();
    expect(screen.queryByText(/version card/)).not.toBeInTheDocument();
    expect(screen.queryByText(/xattr -rd/)).not.toBeInTheDocument();

    rerender(<SettingsPanel {...baseProps()} language="en" update={update} />);

    expect(screen.getByText(/version card/)).toBeInTheDocument();
    expect(screen.queryByText(/版本卡片/)).not.toBeInTheDocument();
    expect(screen.queryByText(/xattr -rd/)).not.toBeInTheDocument();
  });

  it("shows only the tagged update text from a GitHub release body", () => {
    const notes = [
      "## English",
      "",
      "### Updates",
      "",
      "<!-- atrium:notes:en -->",
      "Settings keeps Check for updates next to an available update.",
      "<!-- /atrium:notes:en -->",
      "",
      "## 中文",
      "",
      "### 更新说明",
      "",
      "<!-- atrium:notes:zh -->",
      "发现新版本后，「检查更新」仍留在旁边。",
      "<!-- /atrium:notes:zh -->",
      "",
      "### 安装后首次运行",
      "",
      "在 macOS 上安装后首次运行时，若提示「已损坏」，在终端执行：",
      "",
      "```sh",
      "xattr -rd com.apple.quarantine /Applications/Atrium.app",
      "```",
    ].join("\n");
    render(
      <SettingsPanel
        {...baseProps()}
        language="zh"
        update={makeUpdateController({
          phase: "available",
          info: { version: "0.3.7", notes, date: "" },
        })}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "更新说明" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "安装后首次运行" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/检查更新/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Check for updates next/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/xattr -rd/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已损坏/)).not.toBeInTheDocument();
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

describe("build network proxy", () => {
  const rowText = (host: string) =>
    screen.getByText(host).closest("li")?.textContent ?? "";

  const proxyField = () =>
    screen.getByLabelText("Proxy address") as HTMLInputElement;

  it("shows the stored address and saves a newly typed one", async () => {
    const readSpy = vi
      .spyOn(bridge, "readNetworkProxy")
      .mockResolvedValue({ proxy: "http://127.0.0.1:7890" });
    const saveSpy = vi
      .spyOn(bridge, "saveNetworkProxy")
      .mockImplementation(async (settings) => settings);
    render(<SettingsPanel {...baseProps()} />);

    await waitFor(() =>
      expect(proxyField().value).toBe("http://127.0.0.1:7890"),
    );

    fireEvent.change(proxyField(), {
      target: { value: "socks5://127.0.0.1:1080" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save proxy" }));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith({
        proxy: "socks5://127.0.0.1:1080",
        noProxy: "",
        testHost: "",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Saved. Commands started from now on use it."),
      ).toBeTruthy(),
    );

    readSpy.mockRestore();
    saveSpy.mockRestore();
  });

  it("reports a rejected address without clearing what the user typed", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const saveSpy = vi
      .spyOn(bridge, "saveNetworkProxy")
      .mockRejectedValue("A proxy address must be a valid absolute URL");
    render(<SettingsPanel {...baseProps()} />);

    await waitFor(() => expect(proxyField().value).toBe(""));
    fireEvent.change(proxyField(), { target: { value: "127.0.0.1:7890" } });
    fireEvent.click(screen.getByRole("button", { name: "Save proxy" }));

    await waitFor(() =>
      expect(
        screen.getByText("A proxy address must be a valid absolute URL"),
      ).toBeTruthy(),
    );
    expect(proxyField().value).toBe("127.0.0.1:7890");

    saveSpy.mockRestore();
  });

  it("offers a detected local proxy without calling it a proxy on trust", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const detectSpy = vi.spyOn(bridge, "detectLocalProxies").mockResolvedValue([
      { url: "http://127.0.0.1:7890", kind: "http" },
      { url: "socks5://127.0.0.1:1080", kind: "socks5" },
      { url: "http://127.0.0.1:9999", kind: "listener" },
    ]);
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Detect a local proxy" }),
    );

    await waitFor(() =>
      expect(screen.getByText("http://127.0.0.1:7890")).toBeInTheDocument(),
    );
    expect(screen.getByText("Answers as an HTTP proxy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Something is listening, but it does not answer as a proxy",
      ),
    ).toBeInTheDocument();
    expect(detectSpy).toHaveBeenCalledTimes(1);
  });

  it("fills the field from a detected endpoint", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    vi.spyOn(bridge, "detectLocalProxies").mockResolvedValue([
      { url: "http://127.0.0.1:7890", kind: "http" },
    ]);
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Detect a local proxy" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Use this" }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Proxy address") as HTMLInputElement).value,
      ).toBe("http://127.0.0.1:7890"),
    );
  });

  it("says plainly when no local proxy answered", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    vi.spyOn(bridge, "detectLocalProxies").mockResolvedValue([]);
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Detect a local proxy" }),
    );

    expect(
      await screen.findByText(
        "No proxy answered on the usual local ports. Open your proxy client and copy the address it shows here.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the bypass list behind an advanced disclosure", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    render(<SettingsPanel {...baseProps()} />);

    const disclosure = screen.getByRole("button", { name: "Advanced" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(disclosure);

    await waitFor(() =>
      expect(disclosure).toHaveAttribute("aria-expanded", "true"),
    );
    expect(
      screen.getByLabelText("Never proxy these addresses"),
    ).toBeInTheDocument();
  });

  it("reports a working proxy for every host it checks", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({
      proxy: "http://127.0.0.1:7890",
    });
    const testSpy = vi
      .spyOn(bridge, "testNetworkProxy")
      .mockResolvedValue({ kind: "tunnelled", latencyMillis: 128 });
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));

    await waitFor(() =>
      expect(rowText("www.gstatic.com")).toContain(
        "Connected through the proxy in 128 ms",
      ),
    );
    // Every listed host is probed against the configured proxy.
    for (const host of [
      "github.com",
      "objects.githubusercontent.com",
      "registry.npmjs.org",
      "static.crates.io",
      "files.pythonhosted.org",
    ]) {
      expect(testSpy).toHaveBeenCalledWith({
        proxy: "http://127.0.0.1:7890",
        noProxy: "",
        testHost: host,
      });
    }
  });

  it("names the host a proxy refused instead of blaming the proxy", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    vi.spyOn(bridge, "testNetworkProxy").mockImplementation(async (settings) =>
      settings.testHost === "github.com"
        ? { kind: "refused", status: 407 }
        : { kind: "tunnelled", latencyMillis: 90 },
    );
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));

    await waitFor(() =>
      expect(rowText("github.com")).toContain(
        "refused the tunnel (status 407)",
      ),
    );
    expect(rowText("github.com")).toContain("GitHub ·");
  });

  it("says nothing is configured when no address is set", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    vi.spyOn(bridge, "testNetworkProxy").mockResolvedValue({
      kind: "inherited",
    });
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));

    await waitFor(() =>
      expect(rowText("www.gstatic.com")).toContain("No proxy is configured"),
    );
  });

  it("drops an earlier report once a new address is saved", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    vi.spyOn(bridge, "testNetworkProxy").mockResolvedValue({
      kind: "tunnelled",
      latencyMillis: 10,
    });
    vi.spyOn(bridge, "saveNetworkProxy").mockImplementation(
      async (settings) => settings,
    );
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));
    await waitFor(() =>
      expect(rowText("github.com")).toContain("Connected through the proxy"),
    );

    fireEvent.change(screen.getByLabelText("Proxy address"), {
      target: { value: "http://127.0.0.1:1080" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save proxy" }));

    await waitFor(() =>
      expect(rowText("github.com")).toContain("Not checked yet"),
    );
  });

  it("names the actions in the selected language, including Install", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const withLanguage = (language: "en" | "zh") => (
      <I18nProvider
        value={{
          language,
          setLanguage: () => undefined,
          t: (key) => translate(language, key),
        }}
      >
        <SettingsPanel {...baseProps()} language={language} />
      </I18nProvider>
    );

    const { rerender } = render(withLanguage("zh"));

    // The action names come from the catalogue, so a Chinese sentence must not
    // keep English words in it, and the new Install action must be listed.
    expect(
      screen.getByText(/安装依赖、检查、构建、运行会在各自的环境变量里/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Check, Build/)).not.toBeInTheDocument();

    rerender(withLanguage("en"));

    expect(
      screen.getByText(
        /Install, Check, Build, and Run start with this address/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/安装依赖/)).not.toBeInTheDocument();
  });

  it("separates a fast success from a target that stayed silent", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const testSpy = vi.spyOn(bridge, "testNetworkProxy");
    render(<SettingsPanel {...baseProps()} />);

    testSpy.mockResolvedValue({ kind: "tunnelled", latencyMillis: null });
    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));
    await waitFor(() =>
      expect(rowText("www.gstatic.com")).toContain(
        "granted the tunnel, but www.gstatic.com did not answer",
      ),
    );

    testSpy.mockResolvedValue({ kind: "tunnelled", latencyMillis: 214 });
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));
    await waitFor(() =>
      expect(rowText("www.gstatic.com")).toContain(
        "Connected through the proxy in 214 ms",
      ),
    );
  });

  it("probes the address the user typed as one more row", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const testSpy = vi
      .spyOn(bridge, "testNetworkProxy")
      .mockResolvedValue({ kind: "tunnelled", latencyMillis: 1900 });
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Test address"), {
      target: { value: "registry.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));

    await waitFor(() =>
      expect(testSpy).toHaveBeenCalledWith({
        proxy: "",
        noProxy: "",
        testHost: "registry.example.com",
      }),
    );
    await waitFor(() =>
      expect(rowText("registry.example.com")).toContain(
        "Connected through the proxy in 1900 ms",
      ),
    );
  });

  it("checks every known download host and reports each one separately", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({
      proxy: "http://127.0.0.1:7890",
    });
    const testSpy = vi
      .spyOn(bridge, "testNetworkProxy")
      .mockImplementation(async (settings) =>
        settings.testHost === "registry.npmjs.org"
          ? { kind: "refused", status: 403 }
          : { kind: "tunnelled", latencyMillis: 120 },
      );
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check all" }));
    await waitFor(() =>
      expect(rowText("www.gstatic.com")).toContain(
        "Connected through the proxy in 120 ms",
      ),
    );

    // One host failing must not colour the others: a rule-based proxy can
    // block a single destination while everything else works.
    expect(rowText("registry.npmjs.org")).toContain(
      "refused the tunnel (status 403)",
    );
    expect(rowText("objects.githubusercontent.com")).toContain(
      "Connected through the proxy",
    );
    expect(rowText("files.pythonhosted.org")).toContain(
      "Connected through the proxy",
    );
    // Every listed host is probed against the configured proxy, not against
    // whatever happens to be in the test address field.
    expect(testSpy).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:7890",
      noProxy: "",
      testHost: "objects.githubusercontent.com",
    });
  });

  it("tests one row without touching the others", async () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    const testSpy = vi
      .spyOn(bridge, "testNetworkProxy")
      .mockResolvedValue({ kind: "tunnelled", latencyMillis: 77 });
    // An earlier test may have left calls on the same spy.
    testSpy.mockClear();
    render(<SettingsPanel {...baseProps()} />);

    const rows = document.querySelectorAll(".proxy-detection-row");
    const githubRow = [...rows].find((row) =>
      row.textContent?.includes("github.com"),
    );
    fireEvent.click(within(githubRow as HTMLElement).getByRole("button"));

    await waitFor(() =>
      expect(rowText("github.com")).toContain(
        "Connected through the proxy in 77 ms",
      ),
    );
    // Pressing one row's button must not quietly test the rest, and must not
    // write a hidden field somewhere else in the card.
    expect(testSpy).toHaveBeenCalledTimes(1);
    expect(testSpy).toHaveBeenCalledWith({
      proxy: "",
      noProxy: "",
      testHost: "github.com",
    });
    expect(rowText("www.gstatic.com")).toContain("Not checked yet");
  });

  it("says a host is unchecked rather than failed before any sweep", () => {
    vi.spyOn(bridge, "readNetworkProxy").mockResolvedValue({});
    render(<SettingsPanel {...baseProps()} />);

    expect(screen.getAllByText(/· Not checked yet/).length).toBe(6);
  });

  it("keeps what the user typed when the saved settings arrive late", async () => {
    let release: (settings: NetworkProxySettings) => void = () => undefined;
    vi.spyOn(bridge, "readNetworkProxy").mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<SettingsPanel {...baseProps()} />);

    fireEvent.change(screen.getByLabelText("Proxy address"), {
      target: { value: "http://127.0.0.1:1080" },
    });
    release({ proxy: "http://127.0.0.1:7890" });

    await waitFor(() =>
      expect(proxyField().value).toBe("http://127.0.0.1:1080"),
    );
  });
});
