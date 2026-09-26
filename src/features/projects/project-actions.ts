import { bridge, isTauriRuntime } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";

export type ProjectAction = "directory" | "terminal" | "remote" | "link";

// A repo-declared file:// link points at an arbitrary local path, so opening
// it requires an explicit confirmation; http(s) links open directly.
const confirmFileLink = async (url: string): Promise<boolean> => {
  if (isTauriRuntime()) {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return confirm(
      `Open the local link ${url} with the default system handler?`,
      { title: "Atrium" },
    );
  }
  return window.confirm(
    `Open the local link ${url} with the default system handler?`,
  );
};

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
    case "link": {
      if (!linkId) return;
      const link = project.links.find((candidate) => candidate.id === linkId);
      if (
        link?.url.startsWith("file://") &&
        !(await confirmFileLink(link.url))
      ) {
        return;
      }
      await bridge.openProjectLink(project.path, linkId);
      return;
    }
  }
};
