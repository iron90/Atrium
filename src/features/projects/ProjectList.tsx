import type { Facet, ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { ProjectFilterBar } from "./ProjectFilterBar";
import { ProjectListRow } from "./ProjectListRow";
import { metaForProject, type ProjectMeta, type ProjectSort } from "./model";
import { useProjectReorder } from "./use-project-reorder";

export interface ProjectListProps {
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
}

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
}: ProjectListProps) {
  const { t } = useI18n();
  const reorder = useProjectReorder({
    projects,
    projectSort,
    onReorder,
    onKeyboardMove,
  });

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
            {reorder.canReorder ? t("dragToReorder") : t("dragRequiresManual")}
            <span className="sr-only" role="status" aria-live="polite">
              {reorder.dragAnnouncement}
            </span>
          </div>
          <div
            className={`project-list ${reorder.canReorder ? "is-reorderable" : ""}`}
            role="list"
          >
            <div className="project-list-head">
              <span>{t("project")}</span>
              <span>{t("git")}</span>
              <span>{t("platforms")}</span>
              <span>{t("channels")}</span>
              <span>{t("actions")}</span>
            </div>
            {reorder.orderedProjects.map((project, index) => (
              <ProjectListRow
                key={project.id}
                project={project}
                selectedId={selectedId}
                onSelect={onSelect}
                meta={metaForProject(projectMeta, project.id, index)}
                onToggleFavorite={onToggleFavorite}
                onToggleHidden={onToggleHidden}
                dragEnabled={reorder.canReorder}
                isDragging={reorder.draggingId === project.id}
                isDropTarget={
                  reorder.dropTarget?.projectId === project.id &&
                  reorder.draggingId !== project.id
                }
                dropPosition={
                  reorder.dropTarget?.projectId === project.id &&
                  reorder.draggingId !== project.id
                    ? reorder.dropTarget.position
                    : null
                }
                onDragStart={reorder.handleDragStart}
                onDragOver={reorder.handleDragOver}
                onDrop={reorder.handleDrop}
                onDragEnd={reorder.handleDragEnd}
                onKeyboardMove={reorder.handleKeyboardMove}
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
