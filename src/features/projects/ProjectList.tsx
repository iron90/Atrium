import { useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Facet, ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { ProjectFilterBar } from "./ProjectFilterBar";
import { ProjectListRow, type DropPosition } from "./ProjectListRow";
import { metaForProject, type ProjectMeta, type ProjectSort } from "./model";

export function ProjectList({
  projects,
  selectedId,
  onSelect,
  search,
  setSearch,
  platformFilter,
  setPlatformFilter,
  channelFilter,
  setChannelFilter,
  projectSort,
  setProjectSort,
  showHidden,
  setShowHidden,
  filterOptions,
  projectMeta,
  onToggleFavorite,
  onToggleHidden,
  onReorder,
  onKeyboardMove,
}: {
  projects: ProjectSnapshot[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
  search: string;
  setSearch: (value: string) => void;
  platformFilter: string;
  setPlatformFilter: (value: string) => void;
  channelFilter: string;
  setChannelFilter: (value: string) => void;
  projectSort: ProjectSort;
  setProjectSort: (value: ProjectSort) => void;
  showHidden: boolean;
  setShowHidden: (value: boolean) => void;
  filterOptions: { platforms: Facet[]; channels: Facet[] };
  projectMeta: Record<string, ProjectMeta>;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
  onReorder: (orderedProjectIds: string[]) => void;
  onKeyboardMove: (projectId: string, direction: "up" | "down") => boolean;
}) {
  const { t } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    projectId: string;
    position: DropPosition;
  } | null>(null);
  const dragSessionRef = useRef<{
    projectId: string;
    originalOrderIds: string[];
    previewOrderIds: string[];
    committed: boolean;
  } | null>(null);
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

  const handleRowSelect = (projectId: string) => {
    onSelect(projectId);
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
    if (!canReorder || !drag) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (targetProjectId === drag.projectId) {
      setDropTarget(null);
      return;
    }

    const targetRect = event.currentTarget.getBoundingClientRect();
    const position = dropPositionFor(event, targetRect);
    const currentIds = drag.previewOrderIds;
    const nextIds = currentIds.filter(
      (projectId) => projectId !== drag.projectId,
    );
    let insertionIndex = nextIds.indexOf(targetProjectId);
    if (position === "after") insertionIndex += 1;
    nextIds.splice(insertionIndex, 0, drag.projectId);
    if (nextIds.some((projectId, index) => projectId !== currentIds[index])) {
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
    if (!canReorder || !drag) {
      return;
    }
    event.preventDefault();
    if (targetProjectId === drag.projectId) {
      setDragAnnouncement(t("dragCancelled"));
      clearDragState();
      return;
    }
    const targetRect = event.currentTarget.getBoundingClientRect();
    const position = dropPositionFor(event, targetRect);
    const nextIds = drag.previewOrderIds.filter(
      (projectId) => projectId !== drag.projectId,
    );
    let insertionIndex = nextIds.indexOf(targetProjectId);
    if (position === "after") insertionIndex += 1;
    nextIds.splice(insertionIndex, 0, drag.projectId);
    drag.committed = true;
    if (
      nextIds.some(
        (projectId, index) => projectId !== drag.originalOrderIds[index],
      )
    ) {
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

  return (
    <>
      <ProjectFilterBar
        search={search}
        setSearch={setSearch}
        platformFilter={platformFilter}
        setPlatformFilter={setPlatformFilter}
        channelFilter={channelFilter}
        setChannelFilter={setChannelFilter}
        projectSort={projectSort}
        setProjectSort={setProjectSort}
        showHidden={showHidden}
        setShowHidden={setShowHidden}
        filterOptions={filterOptions}
      />
      {projects.length ? (
        <>
          <div className="project-order-hint">
            <span className="project-drag-handle" aria-hidden="true">
              ⠿
            </span>
            {canReorder ? t("dragToReorder") : t("dragRequiresManual")}
            <span className="sr-only" role="status" aria-live="polite">
              {dragAnnouncement}
            </span>
          </div>
          <div
            className={`project-list ${canReorder ? "is-reorderable" : ""}`}
            role="list"
          >
            <div className="project-list-head">
              <span>{t("project")}</span>
              <span>{t("git")}</span>
              <span>{t("platforms")}</span>
              <span>{t("channels")}</span>
              <span>{t("actions")}</span>
            </div>
            {orderedProjects.map((project, index) => (
              <ProjectListRow
                key={project.id}
                project={project}
                selectedId={selectedId}
                onSelect={handleRowSelect}
                meta={metaForProject(projectMeta, project.id, index)}
                onToggleFavorite={onToggleFavorite}
                onToggleHidden={onToggleHidden}
                dragEnabled={canReorder}
                isDragging={draggingId === project.id}
                isDropTarget={
                  dropTarget?.projectId === project.id &&
                  draggingId !== project.id
                }
                dropPosition={
                  dropTarget?.projectId === project.id &&
                  draggingId !== project.id
                    ? dropTarget.position
                    : null
                }
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onKeyboardMove={handleKeyboardMove}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span>◇</span>
          <h3>{t("noProjects")}</h3>
          <p>{t("chooseRoot")}</p>
        </div>
      )}
    </>
  );
}
