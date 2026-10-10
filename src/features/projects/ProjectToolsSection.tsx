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
    </InspectorSection>
  );
}
