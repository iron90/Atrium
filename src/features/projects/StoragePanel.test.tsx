import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectStorage } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { StoragePanel } from "./StoragePanel";

afterEach(cleanup);

const baseProject = demoSnapshot("/workspace").projects[0];

const storage: ProjectStorage = {
  totalBytes: 100,
  cleanableBytes: 12,
  isComplete: true,
  entries: [
    {
      relativePath: "dist",
      kind: "build",
      bytes: 8,
      fileCount: 2,
      isComplete: true,
    },
    {
      relativePath: "node_modules/.vite",
      kind: "cache",
      bytes: 4,
      fileCount: 1,
      isComplete: true,
    },
  ],
};

const renderPanel = (
  overrides: Partial<Parameters<typeof StoragePanel>[0]> = {},
) =>
  render(
    <StoragePanel
      project={baseProject}
      storage={storage}
      cleanupFeedback={null}
      cleanupSelection={[]}
      cleanupConfirmation={null}
      cleanupProgress={null}
      onCleanupSelectionChange={vi.fn()}
      isCleaningArtifacts={false}
      onCleanArtifacts={vi.fn()}
      onCancelCleanup={vi.fn()}
      onConfirmCleanup={vi.fn()}
      {...overrides}
    />,
  );

const headerCheckbox = () =>
  screen.getByRole("checkbox", { name: "Select all cleanable entries" });

describe("storage panel entries disclosure", () => {
  it("collapses the entry list by default", () => {
    renderPanel();

    expect(
      screen.getByRole("button", { name: /Cleanable entries/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".storage-entries")).not.toHaveClass(
      "is-open",
    );
    expect(
      document.querySelector(".storage-entries .animated-disclosure-shell"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("2 entries · 12 B")).toBeInTheDocument();
  });

  it("opens the list and reveals the rows after expanding", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Cleanable entries/ }));

    expect(
      screen.getByRole("region", { name: "Cleanable entries" }),
    ).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByText("dist")).toBeInTheDocument();
    expect(screen.getByText("node_modules/.vite")).toBeInTheDocument();
  });

  it("selects every entry from the header checkbox", () => {
    const onCleanupSelectionChange = vi.fn();
    renderPanel({ onCleanupSelectionChange });

    fireEvent.click(headerCheckbox());

    expect(onCleanupSelectionChange).toHaveBeenCalledWith([
      "dist",
      "node_modules/.vite",
    ]);
  });

  it("clears the selection when the header checkbox is unchecked", () => {
    const onCleanupSelectionChange = vi.fn();
    renderPanel({
      onCleanupSelectionChange,
      cleanupSelection: ["dist", "node_modules/.vite"],
    });

    expect(headerCheckbox()).toBeChecked();
    fireEvent.click(headerCheckbox());

    expect(onCleanupSelectionChange).toHaveBeenCalledWith([]);
  });

  it("marks the header checkbox indeterminate for a partial selection", () => {
    renderPanel({ cleanupSelection: ["dist"] });

    const checkbox = headerCheckbox();
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveProperty("indeterminate", true);
  });
});
