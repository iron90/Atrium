import type { ProjectSnapshot } from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { hasTrustedContext } from "./presentation";

export function PlatformMatrix({
  projects,
  onSelect,
}: {
  projects: ProjectSnapshot[];
  onSelect: (projectId: string) => void;
}) {
  const { language, t } = useI18n();
  const trustedProjects = projects.filter(hasTrustedContext);
  const platforms = Array.from(
    new Map(
      trustedProjects
        .flatMap((project) => project.platforms)
        .map((facet) => [facet.key, facet]),
    ).values(),
  );
  return (
    <div className="matrix-view">
      <div className="matrix-intro">
        <span className="eyebrow">{t("detectedContext")}</span>
        <h2>{t("platformMatrix")}</h2>
        <p>{t("platformMatrixDescription")}</p>
      </div>
      <div className="matrix-table">
        <div className="matrix-head">
          <span>{t("project")}</span>
          {platforms.map((facet) => (
            <span key={facet.key}>
              {localizedFacetLabel(language, facet.key, facet.label)}
            </span>
          ))}
        </div>
        {projects.map((project) => (
          <button
            className="matrix-row"
            type="button"
            key={project.id}
            onClick={() => onSelect(project.id)}
          >
            <strong>{project.name}</strong>
            {platforms.map((facet) => (
              <span key={facet.key}>
                {hasTrustedContext(project) &&
                project.platforms.some((item) => item.key === facet.key) ? (
                  <i className="matrix-check">●</i>
                ) : (
                  <i className="matrix-empty">·</i>
                )}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}
