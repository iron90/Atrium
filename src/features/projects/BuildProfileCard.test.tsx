import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  checkCommandId: "npm:check",
  buildCommandId: "npm:build:macos",
  installCommandId: "npm:ci",
  runCommandId: "npm:dev",
  serviceUrl: null,
  hostRequirements: {
    install: null,
    check: null,
    build: null,
    run: null,
  },
  verification: {
    install: ["macos"],
    check: ["macos"],
    build: ["macos"],
    run: ["macos"],
  },
  hostMismatchActions: [],
  unverifiedActions: [],
  verificationBlockers: [],
  blockedActions: [],
  source: ".atrium/manifest.toml#build_profiles.macos-direct",
  region: null,
  payment: null,
  artifacts: ["dist/SnapCutout.dmg"],
  issues: [],
};

const commands: ProjectCommand[] = [
  {
    id: "npm:ci",
    kind: "install",
    label: "Install",
    program: "npm",
    args: ["ci"],
    workingDirectory: "/workspace/SnapCutout",
    displayCommand: "npm ci",
    source: "package.json#scripts.restore",
  },
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
  onRun = vi.fn(),
) =>
  render(
    <BuildProfileCard
      profile={profileOverride}
      commands={commands}
      artifacts={artifacts}
      projectPath="/workspace/SnapCutout"
      canExecute
      onRun={onRun}
      onOpenWebService={vi.fn()}
      onOpenArtifact={vi.fn()}
    />,
  );

describe("build profile card", () => {
  it("shows the profile title without repeating the platform, channel, or id", () => {
    renderCard();

    expect(screen.getByText("macOS · Direct")).toBeInTheDocument();
    expect(screen.queryByText("macos-direct")).not.toBeInTheDocument();
    expect(
      screen.getByText("macOS · Direct").closest(".profile-heading")
        ?.textContent,
    ).toBe("macOS · Direct");
  });

  it("orders profile actions as install, check, build, then run", () => {
    const { container } = renderCard([availableArtifact]);

    expect(
      within(container)
        .getAllByRole("button")
        .filter((button) => button.classList.contains("profile-action"))
        .map((button) => button.textContent),
    ).toEqual(["Install", "Check", "Build", "Run"]);
  });

  it("offers install as its own button that never stands in for another action", () => {
    const onRun = vi.fn();
    renderCard([availableArtifact], profile, onRun);

    // Install is independent: enabling or pressing it neither triggers
    // install on its own nor is required before Check or Build.
    const installButton = screen.getByRole("button", { name: "Install" });
    expect(installButton).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0][2]).toBe("build");

    fireEvent.click(installButton);
    expect(onRun).toHaveBeenCalledTimes(2);
    expect(onRun.mock.calls[1][2]).toBe("install");
  });

  it("omits the install button when the project declares no install entry", () => {
    renderCard([availableArtifact], { ...profile, installCommandId: null });

    expect(
      screen.queryByRole("button", { name: "Install" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check" })).toBeInTheDocument();
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

  it("opens a web service from run instead of a project command", () => {
    const onOpenWebService = vi.fn();
    const onRun = vi.fn();
    render(
      <BuildProfileCard
        profile={{
          ...profile,
          platform: { ...profile.platform, key: "web", label: "Web" },
          runCommandId: null,
          serviceUrl: "http://127.0.0.1:3000",
          artifacts: [],
        }}
        commands={commands}
        artifacts={[]}
        projectPath="/workspace/PortfolioSite"
        canExecute
        onRun={onRun}
        onOpenWebService={onOpenWebService}
        onOpenArtifact={vi.fn()}
      />,
    );

    screen.getByRole("button", { name: "Run" }).click();

    expect(onOpenWebService).toHaveBeenCalledWith(profile.id);
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute(
      "title",
      "http://127.0.0.1:3000",
    );
  });

  it("enables run when the profile declares no artifacts", () => {
    renderCard([], { ...profile, artifacts: [] });

    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(document.querySelector(".profile-action-hint")).toBeNull();
    expect(
      screen.getByText("No build artifacts are declared for this profile."),
    ).toBeInTheDocument();
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

  it("explains a declared verification blocker instead of the generic pending note", () => {
    const reason = "Missing Apple Developer signing identity.";
    renderCard([availableArtifact], {
      ...profile,
      verification: {
        ...profile.verification,
        build: [],
      },
      unverifiedActions: ["build"],
      verificationBlockers: [{ action: "build", host: "macos", reason }],
      blockedActions: [{ action: "build", reason }],
    });

    const buildButton = screen.getByRole("button", { name: "Build" });
    expect(buildButton).toBeDisabled();
    const blockedMessage = `Verification is blocked for Build; the development Agent recorded: ${reason}`;
    expect(buildButton).toHaveAttribute("title", blockedMessage);
    expect(screen.getByText(blockedMessage)).toBeInTheDocument();
    expect(
      screen.queryByText(
        "This action has not been verified on the current host.",
      ),
    ).not.toBeInTheDocument();
  });
});
