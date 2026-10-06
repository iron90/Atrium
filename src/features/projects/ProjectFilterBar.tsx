import type { Facet } from "../../bridge";
import { useI18n } from "../../i18n";
import { DropdownSelect } from "../../shared/DropdownSelect";
import { EyeIcon } from "./ProjectActionIcons";
import type { ProjectSort } from "./project-list-model";

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
      <DropdownSelect
        ariaLabel={t("allPlatforms")}
        value={platformFilter}
        options={[
          { value: "all", label: t("allPlatforms") },
          ...filterOptions.platforms.map((facet) => ({
            value: facet.key,
            label: facet.label,
          })),
        ]}
        onChange={setPlatformFilter}
      />
      <DropdownSelect
        ariaLabel={t("allChannels")}
        value={channelFilter}
        options={[
          { value: "all", label: t("allChannels") },
          ...filterOptions.channels.map((facet) => ({
            value: facet.key,
            label: facet.label,
          })),
        ]}
        onChange={setChannelFilter}
      />
      <DropdownSelect
        ariaLabel={t("sortName")}
        value={projectSort}
        options={[
          { value: "modified", label: t("sortModified") },
          { value: "recent", label: t("sortRecentModified") },
          { value: "storage", label: t("sortStorage") },
          { value: "name", label: t("sortName") },
        ]}
        onChange={(value) => setProjectSort(value as ProjectSort)}
      />
      <button
        type="button"
        className={`toolbar-control ${showHidden ? "is-toggle-active" : ""}`}
        aria-label={showHidden ? t("hideHidden") : t("showHidden")}
        aria-pressed={showHidden}
        title={showHidden ? t("hideHidden") : t("showHidden")}
        onClick={() => setShowHidden(!showHidden)}
      >
        <EyeIcon slashed={!showHidden} />
      </button>
    </div>
  );
}
