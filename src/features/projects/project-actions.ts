import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";

export type ProjectAction = "directory" | "terminal" | "remote" | "link";

export const openProjectAction = async (
  action: ProjectAction,
  project: ProjectSnapshot,
  linkId?: string,
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
      return;
    case "link":
      if (linkId) {
        await bridge.openProjectLink(project.path, linkId);
      }
      return;
  }
};
