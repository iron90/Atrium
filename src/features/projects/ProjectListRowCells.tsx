import type { Facet, ProjectSnapshot } from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { FacetMark } from "./FacetMark";
import { facetTitle } from "./facets";
import { EyeIcon, StarIcon } from "./ProjectActionIcons";
import type { ProjectMeta } from "./project-list-model";
import {
  hasTrustedContext,
  statusClass,
  statusLabel,
  syncStatusAriaLabel,
  syncStatusClass,
  syncStatusVisual,
} from "./presentation";
import { ProjectIconView } from "./ProjectIconView";

export function ProjectIdentityCell({
  project,
  onSelect,
}: {
  project: ProjectSnapshot;
  onSelect: (projectId: string) => void;
}) {
  return (
    <div className="project-select">
      <button
        className="project-select-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(project.id);
        }}
      >
        <ProjectIconView project={project} variant="list" />
        <span className="project-copy">
          <strong>{project.name}</strong>
          <span>{project.description ?? project.path}</span>
        </span>
      </button>
    </div>
  );
}

export function ProjectGitCell({ project }: { project: ProjectSnapshot }) {
  const { language, t } = useI18n();

  return (
    <div className="git-cell">
      <span className="branch-line">
        <span aria-hidden="true">⑂</span>
        {project.repo?.branch ?? t("noRepository")}
      </span>
      <span className={statusClass(project)}>
        <span className="state-dot" />
        {statusLabel(project, language)}
      </span>
      {project.repo ? (
        <span
          className={`git-sync ${syncStatusClass(project.repo)}`}
          title={syncStatusAriaLabel(project.repo, language)}
        >
          <span aria-hidden="true">{syncStatusVisual(project.repo)}</span>
          <span className="sr-only">
            {syncStatusAriaLabel(project.repo, language)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function ProjectFacetCell({
  project,
  kind,
}: {
  project: ProjectSnapshot;
  kind: "platform" | "channel";
}) {
  const contextReady = hasTrustedContext(project);
  return (
    <FacetChips
      facets={
        contextReady
          ? kind === "platform"
            ? project.platforms
            : project.channels
          : []
      }
      emptyKey={kind === "platform" ? "notDetected" : "noEvidence"}
      kind={kind}
    />
  );
}

export function ProjectRowActions({
  project,
  meta,
  onToggleFavorite,
  onToggleHidden,
}: {
  project: ProjectSnapshot;
  meta: ProjectMeta;
  onToggleFavorite: (projectId: string) => void;
  onToggleHidden: (projectId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="project-row-actions" role="group" aria-label={t("actions")}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(project.id);
        }}
        aria-label={t("favorite")}
        aria-pressed={meta.favorite}
        title={t("favorite")}
      >
        <StarIcon active={meta.favorite} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleHidden(project.id);
        }}
        aria-label={meta.hidden ? t("restoreProject") : t("hideProject")}
        aria-pressed={meta.hidden}
        title={meta.hidden ? t("restoreProject") : t("hideProject")}
      >
        <EyeIcon slashed={!meta.hidden} />
      </button>
    </div>
  );
}

function FacetChips({
  facets,
  emptyKey,
  kind,
}: {
  facets: Facet[];
  emptyKey: "notDetected" | "noEvidence";
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();
  return (
    <div className="facet-cell">
      {facets.length ? (
        facets.slice(0, 4).map((facet) => (
          <span
            className={`facet-chip ${kind === "platform" ? "platform-chip" : ""}`}
            key={facet.key}
            title={facetTitle(language, facet)}
            aria-label={
              kind === "platform"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : undefined
            }
          >
            <FacetMark facet={facet} kind={kind} />
            {kind === "channel"
              ? localizedFacetLabel(language, facet.key, facet.label)
              : null}
          </span>
        ))
      ) : (
        <span className="muted-inline">{t(emptyKey)}</span>
      )}
    </div>
  );
}
