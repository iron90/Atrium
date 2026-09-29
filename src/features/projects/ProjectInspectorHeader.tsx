import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot } from "../../bridge";
import { FiRefreshCw } from "react-icons/fi";
import { useI18n } from "../../i18n";
import { ProjectIconView } from "./ProjectIconView";

export function ProjectInspectorHeader({
  project,
  isRefreshing,
  onRefreshProject,
}: {
  project: ProjectSnapshot;
  isRefreshing: boolean;
  onRefreshProject: (project: ProjectSnapshot) => void;
}) {
  const { t } = useI18n();
  const [flashed, setFlashed] = useState(false);
  const wasRefreshing = useRef(false);

  // The refresh confirms itself where it happened: a short pulse on the
  // button replaces the old "Project refreshed" banner line.
  useEffect(() => {
    if (isRefreshing) {
      wasRefreshing.current = true;
      return undefined;
    }
    if (!wasRefreshing.current) return undefined;
    wasRefreshing.current = false;
    setFlashed(true);
    const timer = window.setTimeout(() => setFlashed(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isRefreshing]);

  return (
    <div className="inspector-header">
      <ProjectIconView project={project} variant="inspector" />
      <div>
        <h2>{project.name}</h2>
        <p>{project.description ?? t("descriptionMissing")}</p>
      </div>
      <button
        className={`inspector-refresh ${isRefreshing ? "is-refreshing" : ""} ${
          flashed ? "is-flashed" : ""
        }`}
        type="button"
        onClick={() => onRefreshProject(project)}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
        title={t("refreshProject")}
      >
        <span className="inspector-refresh-glyph" aria-hidden="true">
          <FiRefreshCw />
        </span>
        <span className="sr-only">
          {isRefreshing ? t("refreshingProject") : t("refreshProject")}
        </span>
      </button>
    </div>
  );
}
