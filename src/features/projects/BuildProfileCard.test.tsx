import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildArtifact, BuildProfile, ProjectCommand } from "../../bridge";
import { BuildProfileCard } from "./BuildProfileCard";

afterEach(cleanup);

const profile: BuildProfile = {
  id: "macos-direct",
  label: "macOS · Direct",
  platform: {
    key: "macos",
    label: "macOS",
    source: "configured",
    evidence: [".atrium/manifest.toml"],
  },
  channel: {
    key: "direct",
    label: "Direct",
    source: "configured",
    evidence: [".atrium/manifest.toml"],
  },
  runCommandId: "npm:dev",
  checkCommandId: "npm:check",
  buildCommandId: "npm:build:macos",
  hostRequirements: {
    run: null,
    check: null,
    build: null,
  },
  verification: {
    run: ["macos"],
    check: ["macos"],
    build: ["macos"],
  },
  hostMismatchActions: [],
  unverifiedActions: [],
  source: ".atrium/manifest.toml#build_profiles.macos-direct",
  region: null,
  payment: null,
  artifacts: ["dist/SnapCutout.dmg"],
  issues: [],
};

const commands: ProjectCommand[] = [
  {
    id: "npm:dev",
    kind: "run",
    label: "Run",
    program: "npm",
    args: ["run", "dev"],
    workingDirectory: "/workspace/SnapCutout",
    displayCommand: "npm run dev",
    source: "package.json#scripts.dev",
  },
  {
    id: "npm:check",
    kind: "check",
    label: "Check",
    program: "npm",
    args: ["run", "check"],
    workingDirectory: "/workspace/SnapCutout",
    displayCommand: "npm run check",
    source: "package.json#scripts.check",
  },
  {
    id: "npm:build:macos",
    kind: "build",
    label: "Build",
    program: "npm",
    args: ["run", "build:macos"],
    workingDirectory: "/workspace/SnapCutout",
    displayCommand: "npm run build:macos",
    source: "package.json#scripts.build:macos",
  },
];

const availableArtifact: BuildArtifact = {
  profileId: profile.id,
  profileLabel: profile.label,
  relativePath: "dist/SnapCutout.dmg",
  kind: "file",
  bytes: 1024,
  fileCount: 1,
  modifiedAt: 1,
  isComplete: true,
};

const renderCard = (
  artifacts: BuildArtifact[] = [],
  profileOverride: BuildProfile = profile,
) =>
  render(
    <BuildProfileCard
      profile={profileOverride}
      commands={commands}
      artifacts={artifacts}
      projectPath="/workspace/SnapCutout"
      canExecute
      onRun={vi.fn()}
      onOpenArtifact={vi.fn()}
    />,
  );

describe("build profile card", () => {
  it("orders profile actions as check, build, then run", () => {
    const { container } = renderCard([availableArtifact]);

    expect(
      within(container)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("profile-action"))
        .map((button) => button.textContent),
    ).toEqual(["Check", "Build", "Run"]);
  });

  it("requires an available artifact before enabling run", () => {
    const { container } = renderCard();
    const runButton = within(container).getByRole("button", { name: "Run" });
    const runHint = container.querySelector(".profile-action-hint");

    expect(runButton).toBeDisabled();
    expect(runHint).toHaveAttribute(
      "title",
      "Build the project before running it.",
    );
    expect(runHint).toContainElement(runButton);
  });

  it("enables run after a declared artifact is available", () => {
    renderCard([availableArtifact]);

    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("enables run when the profile declares no artifacts", () => {
    renderCard([], { ...profile, artifacts: [] });

    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(document.querySelector(".profile-action-hint")).toBeNull();
    expect(screen.getByText("No build artifacts are declared for this profile.")).toBeInTheDocument();
  });

  it("disables actions whose declared host does not match the current host", () => {
    renderCard([availableArtifact], {
      ...profile,
      hostRequirements: {
        ...profile.hostRequirements,
        build: ["windows"],
      },
      hostMismatchActions: ["build"],
    });

    const buildButton = screen.getByRole("button", { name: "Build" });
    expect(buildButton).toBeDisabled();
    expect(buildButton).toHaveAttribute(
      "title",
      "This action is unavailable here; it requires one of these host OSes: Windows.",
    );
    expect(
      screen.getByText(
        "This action is unavailable here; it requires one of these host OSes: Windows.",
      ),
    ).toBeInTheDocument();
  });

  it("disables actions on the current host until the Agent verifies them", () => {
    renderCard([availableArtifact], {
      ...profile,
      verification: {
        ...profile.verification,
        build: [],
      },
      unverifiedActions: ["build"],
    });

    const buildButton = screen.getByRole("button", { name: "Build" });
    expect(buildButton).toBeDisabled();
    expect(buildButton).toHaveAttribute(
      "title",
      "This action has not been verified on the current host.",
    );
    expect(
      screen.getByText(
        "This action has not been verified on the current host.",
      ),
    ).toBeInTheDocument();
  });
});
