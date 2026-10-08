import type { BuildProfile, ProfileAction, ProjectCommand } from "../../bridge";

export const profileActionOrder: readonly ProfileAction[] = [
  "check",
  "build",
  "run",
];

const profileCommandId = (
  profile: BuildProfile,
  action: ProfileAction,
): string | null => {
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
