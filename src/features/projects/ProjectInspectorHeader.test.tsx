import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { ProjectInspectorHeader } from "./ProjectInspectorHeader";

const project = demoSnapshot("/workspace").projects[0];

afterEach(cleanup);

const renderHeader = (isRefreshing: boolean) =>
  render(
    <ProjectInspectorHeader
      project={project}
      isRefreshing={isRefreshing}
      onRefreshProject={vi.fn()}
    />,
  );

describe("project inspector header", () => {
  it("keeps the same refresh glyph while refreshing", () => {
    const { rerender } = renderHeader(false);
    const button = screen.getByRole("button", { name: "Refresh project" });

    expect(within(button).getByText("⟳")).toBeInTheDocument();

    rerender(
      <ProjectInspectorHeader
        project={project}
        isRefreshing
        onRefreshProject={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Refreshing…" })).toHaveClass(
      "is-refreshing",
    );
    expect(
      within(screen.getByRole("button", { name: "Refreshing…" })).getByText(
        "⟳",
      ),
    ).toBeInTheDocument();
  });
});
