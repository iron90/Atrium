import type { ProjectSnapshot } from "../../bridge";
import { CommitList } from "../git/CommitList";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";

export function ProjectCommitsSection({
  project,
  isLoading,
}: {
  project: ProjectSnapshot;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const repo = project.repo;

  return (
    <InspectorSection
      title={t("recentCommits")}
      trailing={
        isLoading
          ? t("waitingForOutput")
          : repo
            ? fill(t("loaded"), "count", String(repo.recentCommits.length))
            : undefined
      }
    >
      {isLoading ? (
        <DetailLoading />
      ) : repo?.recentCommits.length ? (
        <CommitList commits={repo.recentCommits.slice(0, 5)} />
      ) : (
        <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
      )}
    </InspectorSection>
  );
}
