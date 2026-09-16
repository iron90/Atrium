import { useState } from "react";
import { bridge } from "../../bridge";
import type { GitChangeSummary, ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { CommitList } from "./CommitList";

export function GitChangePanel({ project }: { project?: ProjectSnapshot }) {
  const { t } = useI18n();
  const revisionOptions = Array.from(
    new Set([
      "HEAD",
      "HEAD~1",
      ...(project?.repo?.references ?? []).map((reference) => reference.name),
      ...(project?.repo?.recentCommits ?? []).map((commit) => commit.sha),
    ]),
  );
  const [fromRevision, setFromRevision] = useState(
    project?.repo?.recentCommits[1]?.sha ?? "HEAD~1",
  );
  const [toRevision, setToRevision] = useState("HEAD");
  const [changeSummary, setChangeSummary] = useState<GitChangeSummary | null>(
    null,
  );
  const [isLoadingChanges, setIsLoadingChanges] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  return (
    <section className="git-change-panel">
      <div className="section-heading">
        <h3>{t("versionChanges")}</h3>
        <span>{project?.name ?? t("selectProject")}</span>
      </div>
      {project?.repo ? (
        <>
          <div className="git-revision-controls">
            <label>
              <span>{t("fromRevision")}</span>
              <input
                className="form-control"
                list="git-revisions-from"
                value={fromRevision}
                onChange={(event) => setFromRevision(event.target.value)}
              />
              <datalist id="git-revisions-from">
                {revisionOptions.map((revision) => (
                  <option value={revision} key={revision} />
                ))}
              </datalist>
            </label>
            <label>
              <span>{t("toRevision")}</span>
              <input
                className="form-control"
                list="git-revisions-to"
                value={toRevision}
                onChange={(event) => setToRevision(event.target.value)}
              />
              <datalist id="git-revisions-to">
                {revisionOptions.map((revision) => (
                  <option value={revision} key={revision} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              disabled={isLoadingChanges || !fromRevision.trim()}
              onClick={() => {
                setIsLoadingChanges(true);
                setChangeError(null);
                void bridge
                  .readGitChangeSummary(
                    project.path,
                    fromRevision.trim(),
                    toRevision.trim() || undefined,
                  )
                  .then(setChangeSummary)
                  .catch((error) =>
                    setChangeError(
                      error instanceof Error ? error.message : String(error),
                    ),
                  )
                  .finally(() => setIsLoadingChanges(false));
              }}
            >
              {isLoadingChanges ? t("loadingChanges") : t("loadChanges")}
            </button>
          </div>
          {changeError ? <p className="inline-error">{changeError}</p> : null}
          {changeSummary ? (
            <div className="git-change-summary">
              <div className="change-totals">
                <span>
                  {fill(
                    t("changedFiles"),
                    "count",
                    String(changeSummary.files.length),
                  )}
                </span>
                <span className="change-additions">
                  +{changeSummary.insertions} {t("insertions")}
                </span>
                <span className="change-deletions">
                  −{changeSummary.deletions} {t("deletions")}
                </span>
              </div>
              {changeSummary.commits.length ? (
                <CommitList commits={changeSummary.commits} />
              ) : (
                <p className="empty-copy">{t("noChanges")}</p>
              )}
              {changeSummary.files.length ? (
                <div className="changed-file-list">
                  {changeSummary.files.map((file) => (
                    <div key={file.path}>
                      <span>
                        <strong>{file.status}</strong> {file.path}
                      </span>
                      <small>
                        {file.additions ?? "—"} / {file.deletions ?? "—"}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    JSON.stringify(changeSummary, null, 2),
                  )
                }
              >
                {t("copyChanges")}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-copy">{t("gitHistoryUnavailable")}</p>
      )}
    </section>
  );
}
