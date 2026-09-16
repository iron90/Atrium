import type { ProjectSnapshot } from "../../bridge";
import { GitChangePanel } from "./GitChangePanel";
import { GitCommitTimeline } from "./GitCommitTimeline";

export function GitHistoryView({
  projects,
  selectedId,
  onSelect,
}: {
  projects: ProjectSnapshot[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
}) {
  const selectedProject = projects.find((project) => project.id === selectedId);

  return (
    <div className="git-history-view">
      <GitChangePanel
        key={selectedProject?.id ?? "none"}
        project={selectedProject}
      />
      <GitCommitTimeline
        projects={projects}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}
