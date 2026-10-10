import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";

export type ProjectAction = "directory" | "terminal" | "remote";

export const openProjectAction = async (
  action: ProjectAction,
  project: ProjectSnapshot,
): Promise<void> => {
  switch (action) {
    case "directory":
      await bridge.openProjectDirectory(project.path);
      return;
    case "terminal":
      await bridge.openProjectTerminal(project.path);
      return;
    case "remote":
      if (project.repo?.remote) {
        await bridge.openProjectRemote(project.repo.remote);
      }
  }
};
