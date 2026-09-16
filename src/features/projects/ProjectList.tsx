import { useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Facet, ProjectSnapshot } from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { fill } from "../../shared/format";
import { FacetMark } from "./FacetMark";
import { facetTitle } from "./facets";
import { ProjectIconView } from "./ProjectIconView";
import { metaForProject, type ProjectMeta, type ProjectSort } from "./model";
import {
  statusClass,
  statusLabel,
  syncStatusAriaLabel,
  syncStatusClass,
  syncStatusVisual,
  hasTrustedContext,
} from "./presentation";

type DropPosition = "before" | "after";

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
      <div className="project-filters">
        <input
          className="toolbar-control"
          aria-label={t("searchProjects")}
          placeholder={t("searchProjects")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="toolbar-control"
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value)}
        >
          <option value="all">{t("allPlatforms")}</option>
          {filterOptions.platforms.map((facet) => (
            <option key={facet.key} value={facet.key}>
              {facet.label}
            </option>
          ))}
        </select>
        <select
          className="toolbar-control"
          value={channelFilter}
          onChange={(event) => setChannelFilter(event.target.value)}
        >
          <option value="all">{t("allChannels")}</option>
          {filterOptions.channels.map((facet) => (
            <option key={facet.key} value={facet.key}>
              {facet.label}
            </option>
          ))}
        </select>
        <select
          className="toolbar-control"
          value={projectSort}
          onChange={(event) =>
            setProjectSort(event.target.value as typeof projectSort)
          }
        >
          <option value="manual">{t("manualOrder")}</option>
          <option value="modified">{t("sortModified")}</option>
          <option value="storage">{t("sortStorage")}</option>
          <option value="name">{t("sortName")}</option>
        </select>
        <button
          type="button"
          className={`toolbar-control ${showHidden ? "is-toggle-active" : ""}`}
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden ? t("hideHidden") : t("showHidden")}
        </button>
      </div>
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

function ProjectListRow({
  project,
  selectedId,
  onSelect,
  meta,
  onToggleFavorite,
  onToggleHidden,
  dragEnabled,
  isDragging,
  isDropTarget,
  dropPosition,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyboardMove,
}: {
  project: ProjectSnapshot;
  selectedId?: string;
  onSelect: (projectId: string) => void;
  meta: ProjectMeta;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
  dragEnabled: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: DropPosition | null;
  onDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>, projectId: string) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>, projectId: string) => void;
  onDragEnd: () => void;
  onKeyboardMove: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    projectId: string,
  ) => void;
}) {
  const { language, t } = useI18n();
  const contextReady = hasTrustedContext(project);
  return (
    <article
      className={`project-row ${project.id === selectedId ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? `is-drop-target is-drop-${dropPosition}` : ""}`}
      role="listitem"
      data-project-id={project.id}
      aria-roledescription={dragEnabled ? t("draggableProject") : undefined}
      onClick={() => onSelect(project.id)}
      onDragOver={(event) => onDragOver(event, project.id)}
      onDrop={(event) => onDrop(event, project.id)}
    >
      <div className="project-select">
        <button
          className="project-drag-handle"
          type="button"
          draggable={dragEnabled}
          disabled={!dragEnabled}
          aria-label={t("dragProject")}
          title={dragEnabled ? t("dragProject") : t("dragRequiresManual")}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            onDragStart(event, project.id);
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => onKeyboardMove(event, project.id)}
        >
          ⠿
        </button>
        <button
          className="project-select-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(project.id);
          }}
        >
          <ProjectIconView project={project} variant="list" />
          <span className="project-copy">
            <strong>{project.name}</strong>
            <span>{project.description ?? project.path}</span>
          </span>
        </button>
      </div>
      <div className="git-cell">
        <span className="branch-line">
          <span aria-hidden="true">⑂</span>
          {project.repo?.branch ?? t("noRepository")}
        </span>
        <span className={statusClass(project)}>
          <span className="state-dot" />
          {statusLabel(project, language)}
        </span>
        {project.repo ? (
          <span
            className={`git-sync ${syncStatusClass(project.repo)}`}
            title={syncStatusAriaLabel(project.repo, language)}
          >
            <span aria-hidden="true">{syncStatusVisual(project.repo)}</span>
            <span className="sr-only">
              {syncStatusAriaLabel(project.repo, language)}
            </span>
          </span>
        ) : null}
      </div>
      <FacetChips
        facets={contextReady ? project.platforms : []}
        emptyKey="notDetected"
        kind="platform"
      />
      <FacetChips
        facets={contextReady ? project.channels : []}
        emptyKey="noEvidence"
        kind="channel"
      />
      <div
        className="project-row-actions"
        role="group"
        aria-label={t("actions")}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(project.id);
          }}
          title={t("favorite")}
        >
          {meta.favorite ? "★" : "☆"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleHidden(project.id);
          }}
          title={meta.hidden ? t("restoreProject") : t("hideProject")}
        >
          {meta.hidden ? "◉" : "◌"}
        </button>
      </div>
    </article>
  );
}

function FacetChips({
  facets,
  emptyKey,
  kind,
}: {
  facets: Facet[];
  emptyKey: "notDetected" | "noEvidence";
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();
  return (
    <div className="facet-cell">
      {facets.length ? (
        facets.slice(0, 4).map((facet) => (
          <span
            className={`facet-chip ${kind === "platform" ? "platform-chip" : ""}`}
            key={facet.key}
            title={facetTitle(language, facet)}
            aria-label={
              kind === "platform"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : undefined
            }
          >
            <FacetMark facet={facet} kind={kind} />
            {kind === "channel"
              ? localizedFacetLabel(language, facet.key, facet.label)
              : null}
          </span>
        ))
      ) : (
        <span className="muted-inline">{t(emptyKey)}</span>
      )}
    </div>
  );
}
