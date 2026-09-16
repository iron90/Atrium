import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { formatBytes } from "../../shared/format";
import { DetailLoading, InspectorSection } from "./InspectorPrimitives";
import { StoragePanel, type CleanupFeedback } from "./StoragePanel";

export function ProjectStorageSection({
  project,
  inspectedProject,
  isLoading,
  cleanupFeedback,
  cleanupSelection,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
}: {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  isLoading: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
}) {
  const { t } = useI18n();
  const storage = inspectedProject.storage;

  return (
    <InspectorSection
      title={t("storage")}
      trailing={storage ? formatBytes(storage.totalBytes) : undefined}
    >
      {isLoading ? (
        <DetailLoading />
      ) : storage ? (
        <StoragePanel
          project={project}
          storage={storage}
          cleanupFeedback={cleanupFeedback}
          cleanupSelection={cleanupSelection}
          onCleanupSelectionChange={onCleanupSelectionChange}
          isCleaningArtifacts={isCleaningArtifacts}
          onCleanArtifacts={onCleanArtifacts}
        />
      ) : (
        <p className="empty-copy">{t("storageUnavailable")}</p>
      )}
    </InspectorSection>
  );
}
