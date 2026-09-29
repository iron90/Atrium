import { act, cleanup, render, screen } from "@testing-library/react";
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

  it("flashes the refresh button once when a refresh completes", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderHeader(true);

      rerender(
        <ProjectInspectorHeader
          project={project}
          isRefreshing={false}
          onRefreshProject={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", { name: "Refresh project" });
      expect(button).toHaveClass("is-flashed");

      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect(button).not.toHaveClass("is-flashed");

      // Landing on the idle state without a preceding refresh must not flash.
      rerender(
        <ProjectInspectorHeader
          project={project}
          isRefreshing={false}
          onRefreshProject={vi.fn()}
        />,
      );
      expect(button).not.toHaveClass("is-flashed");
    } finally {
      vi.useRealTimers();
    }
  });
});
