import { useCallback, useState } from "react";
import type { ProjectSnapshot, WorkspaceSnapshot } from "../../bridge";
import { metaForProject, reorderProjectMeta, type ProjectMeta } from "./model";

export interface ProjectMetaState {
  projectMeta: Record<string, ProjectMeta>;
  ensureProjectMeta: (snapshot: WorkspaceSnapshot) => void;
  updateProjectMeta: (
    projectId: string,
    change: Partial<ProjectMeta>,
    fallbackOrder: number,
  ) => void;
  reorderProjects: (
    projects: ProjectSnapshot[],
    orderedVisibleIds: string[],
  ) => void;
  moveProjectByKeyboard: (
    projects: ProjectSnapshot[],
    visibleProjects: ProjectSnapshot[],
    projectId: string,
    direction: "up" | "down",
  ) => boolean;
}

export function useProjectMetaState(
  initialProjectMeta: Record<string, ProjectMeta>,
): ProjectMetaState {
  const [projectMeta, setProjectMeta] = useState(initialProjectMeta);

  const ensureProjectMeta = useCallback((snapshot: WorkspaceSnapshot) => {
    setProjectMeta((current) => {
      const next = { ...current };
      let changed = false;
      snapshot.projects.forEach((project, index) => {
        if (!next[project.id]) {
          next[project.id] = {
            favorite: false,
            hidden: false,
            order: index,
          };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, []);

  const updateProjectMeta = useCallback(
    (
      projectId: string,
      change: Partial<ProjectMeta>,
      fallbackOrder: number,
    ) => {
      setProjectMeta((current) => ({
        ...current,
        [projectId]: {
          ...metaForProject(current, projectId, fallbackOrder),
          ...change,
        },
      }));
    },
    [],
  );

  const reorderProjects = useCallback(
    (projects: ProjectSnapshot[], orderedVisibleIds: string[]) => {
      setProjectMeta(
        (current) =>
          reorderProjectMeta(projects, current, orderedVisibleIds) ?? current,
      );
    },
    [],
  );

  const moveProjectByKeyboard = useCallback(
    (
      projects: ProjectSnapshot[],
      visibleProjects: ProjectSnapshot[],
      projectId: string,
      direction: "up" | "down",
    ) => {
      const orderedIds = visibleProjects.map((project) => project.id);
      const index = orderedIds.indexOf(projectId);
      const nextIndex = index + (direction === "up" ? -1 : 1);
      if (index < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
        return false;
      }
      [orderedIds[index], orderedIds[nextIndex]] = [
        orderedIds[nextIndex],
        orderedIds[index],
      ];
      reorderProjects(projects, orderedIds);
      return true;
    },
    [reorderProjects],
  );

  return {
    projectMeta,
    ensureProjectMeta,
    updateProjectMeta,
    reorderProjects,
    moveProjectByKeyboard,
  };
}
