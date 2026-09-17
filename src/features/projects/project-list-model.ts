import type { Facet, ProjectSnapshot } from "../../bridge";
import { hasTrustedContext } from "./protocol-presentation";

export type ProjectSort = "modified" | "recent" | "storage" | "name";

export interface ProjectMeta {
  favorite: boolean;
  hidden: boolean;
}

export interface ProjectListFilters {
  search: string;
  platform: string;
  channel: string;
  sort: ProjectSort;
  showHidden: boolean;
}

export interface ProjectFilterOptions {
  platforms: Facet[];
  channels: Facet[];
}

export const metaForProject = (
  projectMeta: Record<string, ProjectMeta>,
  projectId: string,
): ProjectMeta =>
  projectMeta[projectId] ?? {
    favorite: false,
    hidden: false,
  };

export const collectFilterOptions = (
  projects: ProjectSnapshot[],
): ProjectFilterOptions => {
  const platforms = new Map<string, Facet>();
  const channels = new Map<string, Facet>();
  projects.filter(hasTrustedContext).forEach((project) => {
    project.platforms.forEach((facet) => platforms.set(facet.key, facet));
    project.channels.forEach((facet) => channels.set(facet.key, facet));
  });
  return {
    platforms: Array.from(platforms.values()).sort(
      (a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
    ),
    channels: Array.from(channels.values()).sort(
      (a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
    ),
  };
};

const compareProjectIdentity = (
  left: ProjectSnapshot,
  right: ProjectSnapshot,
): number =>
  left.name.localeCompare(right.name) || left.id.localeCompare(right.id);

export const filterAndSortProjects = (
  projects: ProjectSnapshot[],
  projectMeta: Record<string, ProjectMeta>,
  filters: ProjectListFilters,
): ProjectSnapshot[] => {
  const query = filters.search.trim().toLowerCase();
  return projects
    .filter((project) => {
      const meta = metaForProject(projectMeta, project.id);
      if (meta.hidden && !filters.showHidden) return false;
      if (
        query &&
        ![project.name, project.path, project.description ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        )
      ) {
        return false;
      }
      if (
        filters.platform !== "all" &&
        (!hasTrustedContext(project) ||
          !project.platforms.some((facet) => facet.key === filters.platform))
      ) {
        return false;
      }
      if (
        filters.channel !== "all" &&
        (!hasTrustedContext(project) ||
          !project.channels.some((facet) => facet.key === filters.channel))
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftMeta = metaForProject(projectMeta, left.id);
      const rightMeta = metaForProject(projectMeta, right.id);
      if (leftMeta.favorite !== rightMeta.favorite) {
        return leftMeta.favorite ? -1 : 1;
      }
      if (filters.sort === "modified") {
        return (
          (right.repo?.lastCommit?.timestamp ?? 0) -
            (left.repo?.lastCommit?.timestamp ?? 0) ||
          compareProjectIdentity(left, right)
        );
      }
      if (filters.sort === "recent") {
        return (
          (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0) ||
          compareProjectIdentity(left, right)
        );
      }
      if (filters.sort === "storage") {
        return (
          (right.storage?.totalBytes ?? 0) - (left.storage?.totalBytes ?? 0) ||
          compareProjectIdentity(left, right)
        );
      }
      return compareProjectIdentity(left, right);
    });
};
