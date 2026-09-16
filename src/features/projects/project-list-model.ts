import type { Facet, ProjectSnapshot } from "../../bridge";

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
  projects.forEach((project) => {
    project.platforms.forEach((facet) => platforms.set(facet.key, facet));
    project.channels.forEach((facet) => channels.set(facet.key, facet));
  });
  return {
    platforms: Array.from(platforms.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    channels: Array.from(channels.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  };
};

export const filterAndSortProjects = (
  projects: ProjectSnapshot[],
  projectMeta: Record<string, ProjectMeta>,
  filters: ProjectListFilters,
): ProjectSnapshot[] => {
  const query = filters.search.trim().toLowerCase();
  const fallbackOrders = new Map(
    projects.map((project, index) => [project, index]),
  );
  return projects
    .filter((project) => {
      const meta = metaForProject(
        projectMeta,
        project.id,
        fallbackOrders.get(project) ?? 0,
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
        !project.platforms.some((facet) => facet.key === filters.platform)
      ) {
        return false;
      }
      if (
        filters.channel !== "all" &&
        !project.channels.some((facet) => facet.key === filters.channel)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftMeta = metaForProject(
        projectMeta,
        left.id,
        fallbackOrders.get(left) ?? 0,
      );
      const rightMeta = metaForProject(
        projectMeta,
        right.id,
        fallbackOrders.get(right) ?? 0,
      );
      if (filters.sort === "manual") {
        return (
          leftMeta.order - rightMeta.order ||
          left.name.localeCompare(right.name)
        );
      }
      if (leftMeta.favorite !== rightMeta.favorite) {
        return leftMeta.favorite ? -1 : 1;
      }
      if (filters.sort === "modified") {
        return (
          (right.repo?.lastCommit?.timestamp ?? 0) -
          (left.repo?.lastCommit?.timestamp ?? 0)
        );
      }
      if (filters.sort === "storage") {
        return (
          (right.storage?.totalBytes ?? 0) - (left.storage?.totalBytes ?? 0)
        );
      }
      return left.name.localeCompare(right.name);
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
    projects.map((project, index) => [project, index]),
  );
  const manualOrder = [...projects].sort(
    (left, right) =>
      metaForProject(projectMeta, left.id, fallbackOrders.get(left) ?? 0)
        .order -
      metaForProject(projectMeta, right.id, fallbackOrders.get(right) ?? 0)
        .order,
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
