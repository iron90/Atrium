import type { Facet, ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { ProjectFilterBar } from "./ProjectFilterBar";
import { ProjectListRow } from "./ProjectListRow";
import {
  metaForProject,
  type ProjectMeta,
  type ProjectSort,
} from "./project-list-model";

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
}: ProjectListProps) {
  const { t } = useI18n();

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
        <div className="project-list" role="list">
          <div className="project-list-head">
            <span>{t("project")}</span>
            <span>{t("git")}</span>
            <span>{t("platforms")}</span>
            <span>{t("channels")}</span>
            <span>{t("actions")}</span>
          </div>
          {projects.map((project) => (
            <ProjectListRow
              key={project.id}
              project={project}
              selectedId={selectedId}
              onSelect={onSelect}
              meta={metaForProject(projectMeta, project.id)}
              onToggleFavorite={onToggleFavorite}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </div>
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
