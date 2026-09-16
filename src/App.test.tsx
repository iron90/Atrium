import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    const macosChip = document.querySelector(
      '.facet-chip .platform-mark[data-platform="macos"]',
    )?.parentElement;
    expect(macosChip).not.toHaveTextContent("macOS");
    expect(macosChip).toHaveAttribute("aria-label", "macOS");
    expect(document.querySelector(".protocol-details")).not.toHaveAttribute(
      "open",
    );
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
      target: { value: "Easy" },
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

  it("reorders projects with a drag gesture in manual order", () => {
    render(<App />);

    const mockPipelineRow = screen
      .getAllByText("SampleForge", { exact: true })
      .find((element) => element.closest(".project-row"))
      ?.closest(".project-row");
    const cognitiveRhythmRow = screen
      .getByText("Cognitive Rhythm", { exact: true })
      .closest(".project-row");

    expect(mockPipelineRow).not.toBeNull();
    expect(cognitiveRhythmRow).not.toBeNull();
    const initialNames = Array.from(
      document.querySelectorAll(".project-list .project-row"),
    ).map((row) => row.querySelector(".project-copy strong")?.textContent);
    const initialSampleForgeIndex = initialNames.indexOf("SampleForge");
    vi.spyOn(cognitiveRhythmRow!, "getBoundingClientRect").mockReturnValue({
      top: 100,
      height: 80,
      bottom: 180,
      left: 0,
      right: 500,
      width: 500,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const dragHandle = mockPipelineRow!.querySelector(".project-drag-handle");
    expect(dragHandle).not.toBeNull();
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "none",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    fireEvent.dragStart(dragHandle!, {
      dataTransfer,
    });
    expect(mockPipelineRow).toHaveClass("is-dragging");
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    expect(cognitiveRhythmRow!.getBoundingClientRect().top).toBe(100);
    fireEvent.dragOver(cognitiveRhythmRow!, {
      clientX: 20,
      clientY: 0,
      dataTransfer,
    });
    expect(cognitiveRhythmRow).toHaveClass("is-drop-target");
    const previewNames = Array.from(
      document.querySelectorAll(".project-list .project-row"),
    ).map((row) => row.querySelector(".project-copy strong")?.textContent);
    const previewSampleForgeIndex = previewNames.indexOf("SampleForge");
    const previewCalmCadenceIndex =
      previewNames.indexOf("Cognitive Rhythm");
    expect(previewSampleForgeIndex).not.toBe(initialSampleForgeIndex);
    expect(previewSampleForgeIndex).toBeLessThan(previewCalmCadenceIndex);
    fireEvent.drop(cognitiveRhythmRow!, {
      clientY: 0,
      dataTransfer,
    });
    fireEvent.dragEnd(dragHandle!, {
      dataTransfer,
    });

    const rows = Array.from(
      document.querySelectorAll(".project-list .project-row"),
    );
    const names = rows.map(
      (row) => row.querySelector(".project-copy strong")?.textContent,
    );
    const cognitiveRhythmIndex = names.indexOf("Cognitive Rhythm");
    expect(cognitiveRhythmIndex).toBeGreaterThan(0);
    expect(names[cognitiveRhythmIndex - 1]).toBe("SampleForge");
    expect(screen.queryByTitle("Move up")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Move down")).not.toBeInTheDocument();
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
});
