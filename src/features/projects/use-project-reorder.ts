import { useI18n } from "../../i18n";
import type { ProjectSnapshot } from "../../bridge";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMemo } from "react";
import type { DropPosition } from "./project-reorder";
import { useProjectDragSession } from "./use-project-drag-session";

export interface ProjectReorderState {
  canReorder: boolean;
  draggingId: string | null;
  dropTarget: { projectId: string; position: DropPosition } | null;
  orderedProjects: ProjectSnapshot[];
  dragAnnouncement: string;
  handleDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
  handleDragOver: (
    event: ReactDragEvent<HTMLElement>,
    projectId: string,
  ) => void;
  handleDrop: (event: ReactDragEvent<HTMLElement>, projectId: string) => void;
  handleDragEnd: () => void;
  handleKeyboardMove: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
}

export function useProjectReorder({
  projects,
  projectSort,
  onReorder,
  onKeyboardMove,
}: {
  projects: ProjectSnapshot[];
  projectSort: string;
  onReorder: (orderedProjectIds: string[]) => void;
  onKeyboardMove: (projectId: string, direction: "up" | "down") => boolean;
}): ProjectReorderState {
  const { t } = useI18n();
  const canReorder = projectSort === "manual";
  const drag = useProjectDragSession({ projects, canReorder, onReorder });

  const orderedProjects = useMemo(() => {
    if (!drag.previewOrderIds?.length) return projects;
    const order = new Map(
      drag.previewOrderIds.map((projectId, index) => [projectId, index]),
    );
    if (
      order.size !== projects.length ||
      projects.some((project) => !order.has(project.id))
    ) {
      return projects;
    }
    return [...projects].sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
  }, [drag.previewOrderIds, projects]);

  const handleKeyboardMove = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    if (!canReorder) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const moved = onKeyboardMove(
      projectId,
      event.key === "ArrowUp" ? "up" : "down",
    );
    drag.announce(t(moved ? "dragSaved" : "dragUnchanged"));
  };

  return {
    canReorder,
    draggingId: drag.draggingId,
    dropTarget: drag.dropTarget,
    orderedProjects,
    dragAnnouncement: drag.announcement,
    handleDragStart: drag.handleDragStart,
    handleDragOver: drag.handleDragOver,
    handleDrop: drag.handleDrop,
    handleDragEnd: drag.handleDragEnd,
    handleKeyboardMove,
  };
}
