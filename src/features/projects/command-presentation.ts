import type { BuildProfile, ProfileAction, ProjectCommand } from "../../bridge";
import { translate, type Language } from "../../i18n";

export const commandLabel = (
  command: ProjectCommand,
  language: Language,
): string => {
  if (command.kind === "run") return translate(language, "run");
  if (command.kind === "check") return translate(language, "check");
  if (command.kind === "build") return translate(language, "build");
  return command.label;
};

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
