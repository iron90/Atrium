import { invoke } from "@tauri-apps/api/core";

export const nativeToolMethods = {
  openArtifact: async (
    projectPath: string,
    profileId: string,
    relativePath: string,
  ): Promise<void> =>
    invoke<void>("open_declared_artifact_command", {
      projectPath,
      profileId,
      relativePath,
    }),

  openProjectDirectory: async (projectPath: string): Promise<void> =>
    invoke<void>("open_project_directory_command", { projectPath }),

  openProjectTerminal: async (projectPath: string): Promise<void> =>
    invoke<void>("open_project_terminal_command", { projectPath }),

  openProjectRemote: async (remote: string): Promise<void> =>
    invoke<void>("open_project_remote_command", { remote }),

  openProjectLink: async (projectPath: string, linkId: string): Promise<void> =>
    invoke<void>("open_project_link_command", { projectPath, linkId }),
};

export const previewToolMethods = {
  openArtifact: async (): Promise<void> => undefined,
  openProjectDirectory: async (): Promise<void> => undefined,
  openProjectTerminal: async (): Promise<void> => undefined,
  openProjectRemote: async (): Promise<void> => undefined,
  openProjectLink: async (): Promise<void> => undefined,
};
