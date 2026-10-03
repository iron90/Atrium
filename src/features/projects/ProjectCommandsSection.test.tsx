import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectCommand } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { ProjectCommandsSection } from "./ProjectCommandsSection";

afterEach(cleanup);

const baseProject = demoSnapshot("/workspace").projects[0];

const command = (
  id: string,
  kind: ProjectCommand["kind"],
  displayCommand: string,
): ProjectCommand => ({
  id,
  kind,
  label: id,
  program: "npm",
  args: ["run", id],
  workingDirectory: "/workspace/SnapCutout",
  displayCommand,
  source: `package.json#scripts.${id}`,
});

const renderSection = (
  overrides: Partial<Parameters<typeof ProjectCommandsSection>[0]> = {},
) =>
  render(
    <ProjectCommandsSection
      project={baseProject}
      isLoading={false}
      onRun={vi.fn()}
      rawCommandsRevealed
      onRevealRawCommands={vi.fn()}
      {...overrides}
    />,
  );

describe("discovered repository commands", () => {
  it("keeps the reveal gate before showing any command", () => {
    renderSection({ rawCommandsRevealed: false });

    expect(
      screen.getByRole("button", { name: "Confirm and show repository commands" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("npm run dev")).not.toBeInTheDocument();
  });

  it("renders every discovered command as a plain command", () => {
    renderSection({
      project: {
        ...baseProject,
        commands: [
          command("dev", "run", "npm run dev"),
          command("quality", "other", "npm run quality"),
          command("build", "build", "npm run build"),
        ],
      },
    });

    const items = screen.getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "npm run dev",
      "npm run quality",
      "npm run build",
    ]);
    // The Run/Check/Build vocabulary belongs to the build profile cards;
    // name-guessed kinds must not resurface as action labels here.
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Build" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/other repository commands/),
    ).not.toBeInTheDocument();
  });
});
