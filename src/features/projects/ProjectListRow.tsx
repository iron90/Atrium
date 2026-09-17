import type { ProjectSnapshot } from "../../bridge";
import type { ProjectMeta } from "./project-list-model";
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
}: {
  project: ProjectSnapshot;
  selectedId?: string;
  onSelect: (projectId: string) => void;
  meta: ProjectMeta;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
}) {
  return (
    <article
      className={`project-row ${project.id === selectedId ? "is-selected" : ""}`}
      role="listitem"
      data-project-id={project.id}
      onClick={() => onSelect(project.id)}
    >
      <ProjectIdentityCell project={project} onSelect={onSelect} />
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
