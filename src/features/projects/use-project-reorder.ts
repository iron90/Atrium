import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import type { ProjectSnapshot } from "../../bridge";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMemo, useRef, useState } from "react";
import {
  orderChanged,
  reorderProjectIds,
  type DropPosition,
} from "./project-reorder";

interface DragSession {
  projectId: string;
  originalOrderIds: string[];
  previewOrderIds: string[];
  committed: boolean;
}

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    projectId: string;
    position: DropPosition;
  } | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const canReorder = projectSort === "manual";

  const orderedProjects = useMemo(() => {
    if (!dragOrderIds?.length) return projects;
    const order = new Map(
      dragOrderIds.map((projectId, index) => [projectId, index]),
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
  }, [dragOrderIds, projects]);

  const clearDragState = () => {
    dragSessionRef.current = null;
    setDragOrderIds(null);
    setDraggingId(null);
    setDropTarget(null);
  };

  const dropPositionFor = (
    event: ReactDragEvent<HTMLElement>,
    targetRect: DOMRect,
  ): DropPosition => {
    const clientY = Number.isFinite(event.clientY)
      ? event.clientY
      : targetRect.top;
    return clientY <= targetRect.top + targetRect.height / 2
      ? "before"
      : "after";
  };

  const handleDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    const orderIds = projects.map((project) => project.id);
    dragSessionRef.current = {
      projectId,
      originalOrderIds: orderIds,
      previewOrderIds: orderIds,
      committed: false,
    };
    setDraggingId(projectId);
    setDragOrderIds(orderIds);
    setDropTarget(null);
    setDragAnnouncement("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
    const dragRow = event.currentTarget.closest<HTMLElement>(
      ".project-row[data-project-id]",
    );
    if (dragRow && typeof event.dataTransfer.setDragImage === "function") {
      const rowRect = dragRow.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        dragRow,
        Math.max(0, Math.min(rowRect.width, event.clientX - rowRect.left)),
        Math.max(0, Math.min(rowRect.height, event.clientY - rowRect.top)),
      );
    }
  };

  const handleDragOver = (
    event: ReactDragEvent<HTMLElement>,
    targetProjectId: string,
  ) => {
    const drag = dragSessionRef.current;
    if (!canReorder || !drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (targetProjectId === drag.projectId) {
      setDropTarget(null);
      return;
    }

    const position = dropPositionFor(
      event,
      event.currentTarget.getBoundingClientRect(),
    );
    const nextIds = reorderProjectIds(
      drag.previewOrderIds,
      drag.projectId,
      targetProjectId,
      position,
    );
    if (orderChanged(nextIds, drag.previewOrderIds)) {
      drag.previewOrderIds = nextIds;
      setDragOrderIds(nextIds);
    }
    setDropTarget({ projectId: targetProjectId, position });
    const draggedProject = projects.find(
      (project) => project.id === drag.projectId,
    );
    const targetProject = projects.find(
      (project) => project.id === targetProjectId,
    );
    if (draggedProject && targetProject) {
      setDragAnnouncement(
        fill(
          fill(
            t(position === "before" ? "dragPreviewBefore" : "dragPreviewAfter"),
            "project",
            draggedProject.name,
          ),
          "target",
          targetProject.name,
        ),
      );
    }
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetProjectId: string,
  ) => {
    const drag = dragSessionRef.current;
    if (!canReorder || !drag) return;
    event.preventDefault();
    if (targetProjectId === drag.projectId) {
      setDragAnnouncement(t("dragCancelled"));
      clearDragState();
      return;
    }
    const position = dropPositionFor(
      event,
      event.currentTarget.getBoundingClientRect(),
    );
    const nextIds = reorderProjectIds(
      drag.previewOrderIds,
      drag.projectId,
      targetProjectId,
      position,
    );
    drag.committed = true;
    if (orderChanged(drag.originalOrderIds, nextIds)) {
      onReorder(nextIds);
      setDragAnnouncement(t("dragSaved"));
    } else {
      setDragAnnouncement(t("dragUnchanged"));
    }
    clearDragState();
  };

  const handleDragEnd = () => {
    const drag = dragSessionRef.current;
    if (!drag) return;
    if (!drag.committed) setDragAnnouncement(t("dragCancelled"));
    clearDragState();
  };

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
    setDragAnnouncement(t(moved ? "dragSaved" : "dragUnchanged"));
  };

  return {
    canReorder,
    draggingId,
    dropTarget,
    orderedProjects,
    dragAnnouncement,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleKeyboardMove,
  };
}
