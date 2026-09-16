import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import type { ProjectMeta } from "./project-list-model";
import type { DropPosition } from "./project-reorder";
import {
  ProjectFacetCell,
  ProjectGitCell,
  ProjectIdentityCell,
  ProjectRowActions,
} from "./ProjectListRowCells";

export function ProjectListRow({
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
  const { t } = useI18n();

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
      <ProjectIdentityCell
        project={project}
        dragEnabled={dragEnabled}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyboardMove={onKeyboardMove}
      />
      <ProjectGitCell project={project} />
      <ProjectFacetCell project={project} kind="platform" />
      <ProjectFacetCell project={project} kind="channel" />
      <ProjectRowActions
        project={project}
        meta={meta}
        onToggleFavorite={onToggleFavorite}
        onToggleHidden={onToggleHidden}
      />
    </article>
  );
}
