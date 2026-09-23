import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./runtime";

export const openArtifact = async (
  projectPath: string,
  profileId: string,
  relativePath: string,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  return invoke<void>("open_declared_artifact_command", {
    projectPath,
    profileId,
    relativePath,
  });
};

export const openProjectDirectory = async (
  projectPath: string,
): Promise<void> => {
  if (!isTauriRuntime()) return;
  return invoke<void>("open_project_directory_command", { projectPath });
};

export const openProjectTerminal = async (
  projectPath: string,
): Promise<void> => {
  if (!isTauriRuntime()) return;
  return invoke<void>("open_project_terminal_command", { projectPath });
};

export const openProjectRemote = async (remote: string): Promise<void> => {
  if (!isTauriRuntime()) return;
  return invoke<void>("open_project_remote_command", { remote });
};

export const openProjectLink = async (
  projectPath: string,
  linkId: string,
): Promise<void> => {
  if (!isTauriRuntime()) return;
  return invoke<void>("open_project_link_command", { projectPath, linkId });
};
