import type { Facet } from "../../bridge";
import { useI18n } from "../../i18n";
import type { ProjectSort } from "./model";

export interface ProjectFilterBarProps {
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
}

export function ProjectFilterBar({
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
}: ProjectFilterBarProps) {
  const { t } = useI18n();

  return (
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
  );
}
