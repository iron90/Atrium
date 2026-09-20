import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { CommitList } from "./CommitList";
import { useGitChangeSummary } from "./use-git-change-summary";

export function GitChangePanel({ project }: { project?: ProjectSnapshot }) {
  const { t } = useI18n();
  const {
    revisionOptions,
    fromRevision,
    setFromRevision,
    toRevision,
    setToRevision,
    changeSummary,
    isLoadingChanges,
    changeError,
    loadChanges,
  } = useGitChangeSummary(project);

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
              className={isLoadingChanges ? "is-loading" : ""}
              type="button"
              disabled={isLoadingChanges || !fromRevision.trim()}
              aria-busy={isLoadingChanges}
              onClick={loadChanges}
            >
              {isLoadingChanges ? (
                <span className="status-spinner is-active" aria-hidden="true">
                  ◌
                </span>
              ) : null}
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
