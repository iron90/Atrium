import type { Facet, ProjectSnapshot } from "../../bridge";
import { hasTrustedContext } from "./protocol-presentation";

export type ProjectSort = "manual" | "modified" | "storage" | "name";

export interface ProjectMeta {
  favorite: boolean;
  hidden: boolean;
  order: number;
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
  fallbackOrder: number,
): ProjectMeta =>
  projectMeta[projectId] ?? {
    favorite: false,
    hidden: false,
    order: fallbackOrder,
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
  const fallbackOrders = new Map(
    projects.map((project, index) => [project.id, index]),
  );
  return projects
    .filter((project) => {
      const meta = metaForProject(
        projectMeta,
        project.id,
        fallbackOrders.get(project.id) ?? 0,
      );
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
      const leftMeta = metaForProject(
        projectMeta,
        left.id,
        fallbackOrders.get(left.id) ?? 0,
      );
      const rightMeta = metaForProject(
        projectMeta,
        right.id,
        fallbackOrders.get(right.id) ?? 0,
      );
      if (filters.sort === "manual") {
        return (
          leftMeta.order - rightMeta.order ||
          compareProjectIdentity(left, right)
        );
      }
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
      if (filters.sort === "storage") {
        return (
          (right.storage?.totalBytes ?? 0) - (left.storage?.totalBytes ?? 0) ||
          compareProjectIdentity(left, right)
        );
      }
      return compareProjectIdentity(left, right);
    });
};

export const reorderProjectMeta = (
  projects: ProjectSnapshot[],
  projectMeta: Record<string, ProjectMeta>,
  orderedVisibleIds: string[],
): Record<string, ProjectMeta> | null => {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  if (
    orderedVisibleIds.length < 2 ||
    new Set(orderedVisibleIds).size !== orderedVisibleIds.length ||
    orderedVisibleIds.some((projectId) => !projectById.has(projectId))
  ) {
    return null;
  }

  const visibleIds = new Set(orderedVisibleIds);
  const fallbackOrders = new Map(
    projects.map((project, index) => [project.id, index]),
  );
  const manualOrder = [...projects].sort(
    (left, right) =>
      metaForProject(projectMeta, left.id, fallbackOrders.get(left.id) ?? 0)
        .order -
        metaForProject(projectMeta, right.id, fallbackOrders.get(right.id) ?? 0)
          .order || compareProjectIdentity(left, right),
  );
  let nextVisibleIndex = 0;
  const orderedIds = manualOrder.map((project) => {
    if (!visibleIds.has(project.id)) return project.id;
    const nextId = orderedVisibleIds[nextVisibleIndex];
    nextVisibleIndex += 1;
    return nextId;
  });
  if (nextVisibleIndex !== orderedVisibleIds.length) return null;

  const next = { ...projectMeta };
  orderedIds.forEach((projectId, index) => {
    next[projectId] = {
      ...metaForProject(projectMeta, projectId, index),
      order: index,
    };
  });
  return next;
};
