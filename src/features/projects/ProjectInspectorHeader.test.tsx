import { cleanup, render, screen } from "@testing-library/react";
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

    expect(button.querySelector("svg")).not.toBeNull();

    rerender(
      <ProjectInspectorHeader
        project={project}
        isRefreshing
        onRefreshProject={vi.fn()}
      />,
    );

    const refreshedButton = screen.getByRole("button", { name: "Refreshing…" });
    expect(refreshedButton).toHaveClass("is-refreshing");
    expect(refreshedButton.querySelector("svg")).not.toBeNull();
  });
});
