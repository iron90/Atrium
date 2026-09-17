import type { CleanupProgress, ProjectSnapshot } from "../../bridge";
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
  cleanupConfirmation,
  cleanupProgress,
  onCleanupSelectionChange,
  isCleaningArtifacts,
  onCleanArtifacts,
  onCancelCleanup,
  onConfirmCleanup,
}: {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  isLoading: boolean;
  cleanupFeedback: CleanupFeedback | null;
  cleanupSelection: string[];
  cleanupConfirmation: string[] | null;
  cleanupProgress: CleanupProgress | null;
  onCleanupSelectionChange: (paths: string[]) => void;
  isCleaningArtifacts: boolean;
  onCleanArtifacts: (project: ProjectSnapshot) => void;
  onCancelCleanup: () => void;
  onConfirmCleanup: () => void;
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
          cleanupConfirmation={cleanupConfirmation}
          cleanupProgress={cleanupProgress}
          onCleanupSelectionChange={onCleanupSelectionChange}
          isCleaningArtifacts={isCleaningArtifacts}
          onCleanArtifacts={onCleanArtifacts}
          onCancelCleanup={onCancelCleanup}
          onConfirmCleanup={onConfirmCleanup}
        />
      ) : (
        <p className="empty-copy">{t("storageUnavailable")}</p>
      )}
    </InspectorSection>
  );
}
