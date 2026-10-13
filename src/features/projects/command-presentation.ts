import type { BuildProfile, ProfileAction, ProjectCommand } from "../../bridge";

// Install leads because it restores what the later actions consume, but it is
// an independent button: nothing runs it implicitly.
export const profileActionOrder: readonly ProfileAction[] = [
  "install",
  "check",
  "build",
  "run",
];

const profileCommandId = (
  profile: BuildProfile,
  action: ProfileAction,
): string | null => {
  if (action === "install") return profile.installCommandId;
  if (action === "check") return profile.checkCommandId;
  if (action === "build") return profile.buildCommandId;
  return profile.runCommandId;
};

export const commandForProfile = (
  profile: BuildProfile,
  action: ProfileAction,
  commands: ProjectCommand[],
): ProjectCommand | undefined => {
  const commandId = profileCommandId(profile, action);
  return commandId
    ? commands.find((command) => command.id === commandId)
    : undefined;
};
