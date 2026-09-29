import type { GitBranchOverview, ProjectSnapshot } from "../../bridge";
import { CommitList } from "../git/CommitList";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";

export function ProjectCommitsSection({
  project,
  isLoading,
  selectedBranch,
  branchOverview,
  branchOverviewLoading,
  branchOverviewError,
}: {
  project: ProjectSnapshot;
  isLoading: boolean;
  selectedBranch: string | null;
  branchOverview: GitBranchOverview | null;
  branchOverviewLoading: boolean;
  branchOverviewError: string | null;
}) {
  const { t } = useI18n();
  const repo = project.repo;
  const headBranch = repo?.branch ?? null;
  const viewingBranch =
    selectedBranch !== null && selectedBranch !== headBranch
      ? selectedBranch
      : null;
  const commits =
    viewingBranch && branchOverview
      ? branchOverview.commits
      : (repo?.recentCommits ?? []);

  const trailing = isLoading
    ? t("waitingForOutput")
    : !repo
      ? undefined
      : `${viewingBranch ?? headBranch ?? ""} · ${fill(
          t("loaded"),
          "count",
          String(commits.length),
        )}`;

  return (
    <InspectorSection title={t("recentCommits")} trailing={trailing}>
      {isLoading ? (
        <DetailLoading />
      ) : viewingBranch && branchOverviewLoading ? (
        <DetailLoading />
      ) : viewingBranch && branchOverviewError ? (
        <p className="empty-copy">{branchOverviewError}</p>
      ) : commits.length ? (
        <CommitList commits={commits} />
      ) : (
        <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
      )}
    </InspectorSection>
  );
}
