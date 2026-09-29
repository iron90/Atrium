import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Atrium board", () => {
  it("shows repository facts without introducing a project lifecycle stage", () => {
    render(<App />);

    expect(screen.getByText("Atrium")).toBeInTheDocument();
    expect(screen.getByText("PROJECT INDEX")).toBeInTheDocument();
    expect(screen.getAllByText("SampleForge").length).toBeGreaterThan(0);
    expect(screen.queryByText(/stage/i)).not.toBeInTheDocument();
    expect(document.querySelector(".page-heading > .eyebrow")).toBeNull();
    const projectListHeader = document.querySelector(".project-list-head");
    expect(
      Array.from(projectListHeader?.querySelectorAll("span") ?? []).map(
        (column) => column.textContent,
      ),
    ).toEqual(["Project", "Git", "Platforms", "Channels", "Actions"]);
    expect(projectListHeader?.textContent).not.toContain("Commands");
    expect(document.querySelectorAll(".platform-mark").length).toBeGreaterThan(
      0,
    );
    expect(
      document.querySelectorAll(".platform-mark-icon").length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelector('[data-platform="macos"] .platform-mark-icon'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-platform="windows"] .platform-mark-icon'),
    ).toBeInTheDocument();
    const projectFilters = document.querySelector(".project-filters");
    expect(projectFilters?.children).toHaveLength(5);
    expect(
      Array.from(projectFilters?.children ?? []).every((control) =>
        control.classList.contains("toolbar-control"),
      ),
    ).toBe(true);
    expect(
      projectFilters?.querySelector('[data-icon="eye-off"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.project-row-actions [data-icon="star"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.project-row-actions [data-icon="eye-off"]'),
    ).toBeInTheDocument();
    const showHiddenButton = screen.getByRole("button", {
      name: "Show hidden",
    });
    expect(showHiddenButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(showHiddenButton);
    expect(screen.getByRole("button", { name: "Hide hidden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      projectFilters?.querySelector('[data-icon="eye"]'),
    ).toBeInTheDocument();
    const macosChip = document.querySelector(
      '.facet-chip .platform-mark[data-platform="macos"]',
    )?.parentElement;
    expect(macosChip).not.toHaveTextContent("macOS");
    expect(macosChip).toHaveAttribute("aria-label", "macOS");
    expect(document.querySelector(".protocol-details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.getByText("Identity & icon")).toBeInTheDocument();
    expect(
      screen.queryByText("Schema 1", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Schema unavailable", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("switches visual modes without changing the scanned data", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(document.getElementById("settings-theme")!, {
      target: { value: "warm-ink" },
    });
    fireEvent.change(document.getElementById("settings-layout")!, {
      target: { value: "matrix" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "warm-ink",
    );
    expect(
      screen.getByRole("heading", { name: "Platform matrix" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("SampleForge").length).toBeGreaterThan(0);
  });

  it("switches projects from any area of a project row", () => {
    render(<App />);

    const mockPipelineRow = screen
      .getAllByText("SampleForge")[0]
      .closest(".project-row");

    expect(mockPipelineRow).not.toBeNull();
    fireEvent.click(mockPipelineRow!.querySelector(".git-cell")!);

    expect(
      screen.getByRole("heading", { name: "SampleForge", level: 2 }),
    ).toBeInTheDocument();
  });

  it("shows working tree changes and upstream sync counts separately", () => {
    render(<App />);

    const pinNoteRow = screen
      .getAllByText("TackNote")[0]
      .closest(".project-row");
    const easyCutoutRow = screen
      .getAllByText("SnapCutout")[0]
      .closest(".project-row");

    expect(pinNoteRow).toHaveTextContent("3 uncommitted files");
    expect(pinNoteRow).toHaveTextContent("No upstream");
    expect(easyCutoutRow).toHaveTextContent("↑ 0 · ↓ 1");
  });

  it("opens settings and switches the interface language", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Templates" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Terminal command", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Runtime", { exact: true }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".settings-card .eyebrow")).toBeNull();

    fireEvent.change(document.getElementById("settings-language")!, {
      target: { value: "zh" },
    });

    expect(
      screen.getByRole("heading", { name: "设置", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "外观", level: 3 }),
    ).toBeInTheDocument();
  });

  it("does not repeat the global heading inside secondary pages", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Git history" }));

    expect(
      screen.getAllByRole("heading", { name: /^Git history$/ }),
    ).toHaveLength(1);
    expect(
      document.querySelector(".git-history-view .matrix-intro"),
    ).toBeNull();
  });

  it("does not expose a standalone runs page or layout", () => {
    render(<App />);

    expect(
      screen.queryByRole("button", { name: "Runs" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.queryByRole("option", { name: "Runs" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the global run status in the sidebar without duplicating scan status", () => {
    render(<App />);

    expect(
      document.querySelector(".sidebar .local-activity"),
    ).toBeInTheDocument();
    expect(document.querySelector(".board-pane .local-activity")).toBeNull();
    expect(
      screen.queryByText("Recent scan", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("LOCAL FIRST", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Native session", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preview session", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("persists display preferences locally across a remount", () => {
    const firstRender = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(document.getElementById("settings-theme")!, {
      target: { value: "warm-ink" },
    });
    fireEvent.change(document.getElementById("settings-layout")!, {
      target: { value: "matrix" },
    });
    fireEvent.change(document.getElementById("settings-language")!, {
      target: { value: "zh" },
    });
    firstRender.unmount();

    render(<App />);

    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "warm-ink",
    );
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-layout",
      "matrix",
    );
    expect(
      screen.getByRole("heading", { name: "把项目，都放在视野里。", level: 1 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(
      screen.getByRole("heading", { name: "设置", level: 1 }),
    ).toBeInTheDocument();
  });

  it("filters projects by a declared platform without changing facts", () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("Search projects"), {
      target: { value: "Snap" },
    });
    expect(screen.getAllByText("SnapCutout").length).toBeGreaterThan(0);
    expect(document.querySelector(".project-list")?.textContent).not.toContain(
      "SampleForge",
    );

    fireEvent.change(screen.getByDisplayValue("All platforms"), {
      target: { value: "windows" },
    });
    expect(screen.getAllByText("SnapCutout").length).toBeGreaterThan(0);
  });

  it("exposes settings-only workspace scanning and the Git history page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("button", { name: "Scan workspace" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));
    expect(document.querySelectorAll(".workspace-path-row input")).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByRole("button", { name: "Git history" }));
    expect(
      screen.getByRole("heading", { name: "Version changes" }),
    ).toBeInTheDocument();
  });

  it("surfaces activity messages in the sidebar activity log", async () => {
    render(<App />);

    expect(document.querySelector(".status-banner")).toBeNull();
    expect(document.querySelector(".activity-card.is-note")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan workspace" }));

    await waitFor(() => {
      expect(document.querySelector(".activity-card.is-note")).toHaveTextContent(
        /\d+ projects discovered/,
      );
    });
    expect(document.querySelector(".activity-card.is-note")).toBeInTheDocument();
  });
});
