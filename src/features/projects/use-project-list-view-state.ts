import { useMemo, useState } from "react";
import type { ProjectSnapshot } from "../../bridge";
import {
  collectFilterOptions,
  filterAndSortProjects,
  type ProjectMeta,
  type ProjectSort,
} from "./model";

export interface ProjectListViewState {
  search: string;
  setSearch: (search: string) => void;
  platformFilter: string;
  setPlatformFilter: (platform: string) => void;
  channelFilter: string;
  setChannelFilter: (channel: string) => void;
  projectSort: ProjectSort;
  setProjectSort: (sort: ProjectSort) => void;
  showHiddenProjects: boolean;
  setShowHiddenProjects: (showHidden: boolean) => void;
  filterOptions: ReturnType<typeof collectFilterOptions>;
  visibleProjects: ProjectSnapshot[];
}

export function useProjectListViewState(
  projects: ProjectSnapshot[],
  projectMeta: Record<string, ProjectMeta>,
): ProjectListViewState {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [projectSort, setProjectSort] = useState<ProjectSort>("manual");
  const [showHiddenProjects, setShowHiddenProjects] = useState(false);

  const filterOptions = useMemo(
    () => collectFilterOptions(projects),
    [projects],
  );

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects(projects, projectMeta, {
        search,
        platform: platformFilter,
        channel: channelFilter,
        sort: projectSort,
        showHidden: showHiddenProjects,
      }),
    [
      channelFilter,
      platformFilter,
      projectMeta,
      projectSort,
      projects,
      search,
      showHiddenProjects,
    ],
  );

  return {
    search,
    setSearch,
    platformFilter,
    setPlatformFilter,
    channelFilter,
    setChannelFilter,
    projectSort,
    setProjectSort,
    showHiddenProjects,
    setShowHiddenProjects,
    filterOptions,
    visibleProjects,
  };
}
