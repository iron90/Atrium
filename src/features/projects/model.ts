import type {
  Facet,
  ProjectSnapshot,
  WorkspaceSnapshot,
} from "../../bridge/types";

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

export const snapshotFingerprint = (snapshot: WorkspaceSnapshot): string =>
  JSON.stringify(
    snapshot.projects.map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      iconSource: project.icon?.source ?? null,
      iconStatus: project.iconConformance.status,
      protocol: project.protocol,
      repo: project.repo
        ? {
            branch: project.repo.branch,
            isClean: project.repo.isClean,
            worktreeChanges: project.repo.worktreeChanges,
            remote: project.repo.remote,
            ahead: project.repo.ahead,
            behind: project.repo.behind,
            lastSha: project.repo.lastCommit?.sha ?? null,
            recentShas: project.repo.recentCommits.map((commit) => commit.sha),
            references: project.repo.references,
          }
        : null,
      tools: project.tools,
      links: project.links,
      platforms: project.platforms.map((facet) => [
        facet.key,
        facet.label,
        facet.source,
      ]),
      channels: project.channels.map((facet) => [
        facet.key,
        facet.label,
        facet.source,
      ]),
      buildProfiles: project.buildProfiles.map((profile) => ({
        id: profile.id,
        platform: profile.platform.key,
        channel: profile.channel.key,
        run: profile.runCommandId,
        check: profile.checkCommandId,
        build: profile.buildCommandId,
        artifacts: profile.artifacts,
        issues: profile.issues,
      })),
      configuration: project.configuration,
      commands: project.commands.map((command) => ({
        id: command.id,
        kind: command.kind,
        displayCommand: command.displayCommand,
        source: command.source,
      })),
      cleanup: project.cleanup,
    })),
  );

export const emptySnapshot = (rootPath: string): WorkspaceSnapshot => ({
  rootPath,
  scannedAt: Date.now(),
  projects: [],
  warnings: [],
});

export const mergeWorkspaceSnapshots = (
  snapshots: WorkspaceSnapshot[],
  fallbackRoot: string,
): WorkspaceSnapshot => {
  const projects = new Map<string, ProjectSnapshot>();
  const warnings: string[] = [];
  for (const item of snapshots) {
    for (const project of item.projects) projects.set(project.id, project);
    warnings.push(...item.warnings);
  }
  return {
    rootPath:
      snapshots.map((item) => item.rootPath).join(" · ") || fallbackRoot,
    scannedAt: snapshots.reduce(
      (latest, item) => Math.max(latest, item.scannedAt),
      Date.now(),
    ),
    projects: Array.from(projects.values()),
    warnings,
  };
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
  return projects
    .filter((project) => {
      const meta = metaForProject(
        projectMeta,
        project.id,
        projects.indexOf(project),
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
        projects.indexOf(left),
      );
      const rightMeta = metaForProject(
        projectMeta,
        right.id,
        projects.indexOf(right),
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
  const manualOrder = [...projects].sort(
    (left, right) =>
      metaForProject(projectMeta, left.id, projects.indexOf(left)).order -
      metaForProject(projectMeta, right.id, projects.indexOf(right)).order,
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
