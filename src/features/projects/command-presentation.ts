import type { BuildProfile, ProfileAction, ProjectCommand } from "../../bridge";

const profileCommandId = (
  profile: BuildProfile,
  action: ProfileAction,
): string | null => {
  if (action === "run") return profile.runCommandId;
  if (action === "check") return profile.checkCommandId;
  return profile.buildCommandId;
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
