import { useCallback, useState } from "react";
import type { WorkspaceSnapshot } from "../../bridge";
import { metaForProject, type ProjectMeta } from "./project-list-model";

export interface ProjectMetaState {
  projectMeta: Record<string, ProjectMeta>;
  ensureProjectMeta: (snapshot: WorkspaceSnapshot) => void;
  updateProjectMeta: (projectId: string, change: Partial<ProjectMeta>) => void;
}

export function useProjectMetaState(
  initialProjectMeta: Record<string, ProjectMeta>,
): ProjectMetaState {
  const [projectMeta, setProjectMeta] = useState(initialProjectMeta);

  const ensureProjectMeta = useCallback((snapshot: WorkspaceSnapshot) => {
    setProjectMeta((current) => {
      const next = { ...current };
      let changed = false;
      snapshot.projects.forEach((project) => {
        if (!next[project.id]) {
          next[project.id] = {
            favorite: false,
            hidden: false,
          };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, []);

  const updateProjectMeta = useCallback(
    (projectId: string, change: Partial<ProjectMeta>) => {
      setProjectMeta((current) => ({
        ...current,
        [projectId]: {
          ...metaForProject(current, projectId),
          ...change,
        },
      }));
    },
    [],
  );

  return {
    projectMeta,
    ensureProjectMeta,
    updateProjectMeta,
  };
}
