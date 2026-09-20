import type { ProjectSnapshot, WorkspaceSnapshot } from "../../bridge";

const projectFingerprintData = (project: ProjectSnapshot) => ({
  id: project.id,
  name: project.name,
  path: project.path,
  modifiedAt: project.modifiedAt,
  description: project.description,
  iconSource: project.icon?.source ?? null,
  iconStatus: project.iconConformance.status,
  protocol: project.protocol,
  guidance: project.guidance,
  repo: project.repo
    ? {
        branch: project.repo.branch,
        isClean: project.repo.isClean,
        worktreeChanges: project.repo.worktreeChanges,
        worktreeStatusAvailable: project.repo.worktreeStatusAvailable,
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
    hostRequirements: profile.hostRequirements,
    unsupportedActions: profile.unsupportedActions,
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
});

export const projectFingerprint = (project: ProjectSnapshot): string =>
  JSON.stringify(projectFingerprintData(project));

export const snapshotFingerprint = (snapshot: WorkspaceSnapshot): string =>
  JSON.stringify(snapshot.projects.map(projectFingerprintData));

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
