import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

const ThrowingChild = (): never => {
  throw new Error("render exploded");
};

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>normal content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("normal content")).toBeTruthy();
  });

  it("shows a recoverable fallback instead of a blank window", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("render exploded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload Atrium" })).toBeTruthy();

    consoleError.mockRestore();
  });
});
