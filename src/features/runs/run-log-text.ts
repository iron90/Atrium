import type { RunFinished } from "../../bridge";

export function renderRunLogText(record: RunFinished): string {
  const lines = [
    "Atrium run log",
    "",
    `Project: ${record.projectId}`,
    `Project path: ${record.projectPath}`,
    `Command: ${record.displayCommand}`,
    `Status: ${record.status}`,
    `Exit code: ${record.exitCode ?? ""}`,
    `Started: ${record.startedAt}`,
    `Finished: ${record.finishedAt}`,
    `Duration: ${record.durationMs} ms`,
  ];
  if (record.profileId) lines.push(`Profile: ${record.profileId}`);
  if (record.profileAction) {
    lines.push(`Profile action: ${record.profileAction}`);
  }
  if (record.platform) lines.push(`Platform: ${record.platform.label}`);
  if (record.channel) lines.push(`Channel: ${record.channel.label}`);
  if (record.gitBranch) lines.push(`Git branch: ${record.gitBranch}`);
  if (record.gitCommit) lines.push(`Git commit: ${record.gitCommit}`);
  if (record.worktreeClean !== null) {
    lines.push(`Worktree clean: ${record.worktreeClean}`);
  }
  lines.push(
    "",
    "--- stdout ---",
    record.stdout,
    "--- stderr ---",
    record.stderr,
  );
  return lines.join("\n");
}
