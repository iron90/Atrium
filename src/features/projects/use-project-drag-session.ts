import type { DragEvent as ReactDragEvent } from "react";
import { useRef, useState } from "react";
import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
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

export interface ProjectDragSessionState {
  draggingId: string | null;
  dropTarget: { projectId: string; position: DropPosition } | null;
  previewOrderIds: string[] | null;
  announcement: string;
  announce: (message: string) => void;
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
}

export function useProjectDragSession({
  projects,
  canReorder,
  onReorder,
}: {
  projects: ProjectSnapshot[];
  canReorder: boolean;
  onReorder: (orderedProjectIds: string[]) => void;
}): ProjectDragSessionState {
  const { t } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    projectId: string;
    position: DropPosition;
  } | null>(null);
  const [previewOrderIds, setPreviewOrderIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragSessionRef = useRef<DragSession | null>(null);

  const clearDragState = () => {
    dragSessionRef.current = null;
    setPreviewOrderIds(null);
    setDraggingId(null);
    setDropTarget(null);
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
    setPreviewOrderIds(orderIds);
    setDropTarget(null);
    setAnnouncement("");
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
      setPreviewOrderIds(nextIds);
    }
    setDropTarget({ projectId: targetProjectId, position });
    const draggedProject = projects.find(
      (project) => project.id === drag.projectId,
    );
    const targetProject = projects.find(
      (project) => project.id === targetProjectId,
    );
    if (draggedProject && targetProject) {
      setAnnouncement(
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
      setAnnouncement(t("dragCancelled"));
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
      setAnnouncement(t("dragSaved"));
    } else {
      setAnnouncement(t("dragUnchanged"));
    }
    clearDragState();
  };

  const handleDragEnd = () => {
    const drag = dragSessionRef.current;
    if (!drag) return;
    if (!drag.committed) setAnnouncement(t("dragCancelled"));
    clearDragState();
  };

  const announce = (message: string) => setAnnouncement(message);

  return {
    draggingId,
    dropTarget,
    previewOrderIds,
    announcement,
    announce,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}

function dropPositionFor(
  event: ReactDragEvent<HTMLElement>,
  targetRect: DOMRect,
): DropPosition {
  const clientY = Number.isFinite(event.clientY)
    ? event.clientY
    : targetRect.top;
  return clientY <= targetRect.top + targetRect.height / 2 ? "before" : "after";
}
