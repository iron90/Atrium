import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./AppSidebar";
import type { RuntimeStatus } from "./LocalActivityPanel";

afterEach(cleanup);

const status: RuntimeStatus = { kind: "ready" };

function renderSidebar(updateAvailable: boolean) {
  const onPageChange = vi.fn();
  render(
    <AppSidebar
      activePage="projects"
      onPageChange={onPageChange}
      status={status}
      onStop={vi.fn()}
      updateAvailable={updateAvailable}
    />,
  );
  return onPageChange;
}

describe("app sidebar update badge", () => {
  it("shows the badge next to the version and opens the settings page", () => {
    const onPageChange = renderSidebar(true);

    const badge = screen.getByRole("button", { name: "Update available" });
    fireEvent.click(badge);
    expect(onPageChange).toHaveBeenCalledWith("settings");
  });

  it("hides the badge when no update is available", () => {
    renderSidebar(false);

    expect(
      screen.queryByRole("button", { name: "Update available" }),
    ).not.toBeInTheDocument();
  });
});
