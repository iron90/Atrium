import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import type { ProjectAction } from "./project-actions";
import { InspectorSection } from "./InspectorPrimitives";

export function ProjectToolsSection({
  project,
  onOpenProjectAction,
}: {
  project: ProjectSnapshot;
  onOpenProjectAction: (
    action: ProjectAction,
    project: ProjectSnapshot,
    linkId?: string,
  ) => void;
}) {
  const { t } = useI18n();

  return (
    <InspectorSection title={t("projectTools")}>
      <div className="project-tool-bar">
        <button
          type="button"
          onClick={() => onOpenProjectAction("directory", project)}
        >
          {t("openFolder")}
        </button>
        <button
          type="button"
          onClick={() => onOpenProjectAction("terminal", project)}
        >
          {t("openTerminal")}
        </button>
        {project.repo?.remote ? (
          <button
            type="button"
            onClick={() => onOpenProjectAction("remote", project)}
          >
            {t("openRemote")}
          </button>
        ) : null}
      </div>
      {project.links.length ? (
        <div className="project-links">
          {project.links.map((link) => (
            <button
              type="button"
              key={link.id}
              onClick={() => onOpenProjectAction("link", project, link.id)}
            >
              {link.label}
            </button>
          ))}
        </div>
      ) : null}
    </InspectorSection>
  );
}
