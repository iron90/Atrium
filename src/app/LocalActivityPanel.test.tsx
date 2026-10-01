import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocalActivityPanel, type RuntimeStatus } from "./LocalActivityPanel";

const noop = () => undefined;

afterEach(cleanup);

describe("LocalActivityPanel", () => {
  it("shows the running command with a stop action", () => {
    const status: RuntimeStatus = {
      kind: "running",
      command: "npm run dev",
      projectName: "easycutout",
    };

    render(<LocalActivityPanel status={status} onStop={noop} />);

    expect(screen.getByText("Running command")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("shows scanning while a manual scan runs", () => {
    const status: RuntimeStatus = { kind: "scanning" };

    render(<LocalActivityPanel status={status} onStop={noop} />);

    expect(screen.getByText("Scanning workspace…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("shows a runtime error without a stop action", () => {
    const status: RuntimeStatus = {
      kind: "error",
      message: "Workspace scan did not finish in time",
    };

    render(<LocalActivityPanel status={status} onStop={noop} />);

    expect(screen.getByText("Runtime error")).toBeInTheDocument();
    expect(
      screen.getByText("Workspace scan did not finish in time"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  it("shows the ready state when idle", () => {
    const status: RuntimeStatus = { kind: "ready" };

    render(<LocalActivityPanel status={status} onStop={noop} />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });
});
