import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { FacetDetail, InspectorSection } from "./InspectorPrimitives";

export function ProjectContextSection({
  project,
  protocolReady,
}: {
  project: ProjectSnapshot;
  protocolReady: boolean;
}) {
  const { t } = useI18n();

  return (
    <InspectorSection title={t("detectedContext")}>
      {protocolReady ? (
        <>
          <FacetDetail
            label={t("platforms")}
            facets={project.platforms}
            kind="platform"
          />
          <FacetDetail
            label={t("channels")}
            facets={project.channels}
            kind="channel"
          />
        </>
      ) : (
        <div className="protocol-prerequisite">
          <strong>{t("protocolRequired")}</strong>
          <span>{t("protocolRequiredDescription")}</span>
        </div>
      )}
    </InspectorSection>
  );
}
