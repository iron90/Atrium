import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type { GitChangeSummary, ProjectSnapshot } from "../../bridge";
import { defaultFromRevision, revisionOptions } from "./git-change-model";

export interface GitChangeSummaryState {
  revisionOptions: string[];
  fromRevision: string;
  setFromRevision: (revision: string) => void;
  toRevision: string;
  setToRevision: (revision: string) => void;
  changeSummary: GitChangeSummary | null;
  isLoadingChanges: boolean;
  changeError: string | null;
  loadChanges: () => void;
}

export function useGitChangeSummary(
  project?: ProjectSnapshot,
): GitChangeSummaryState {
  const [fromRevision, setFromRevision] = useState(() =>
    defaultFromRevision(project),
  );
  const [toRevision, setToRevision] = useState("HEAD");
  const [changeSummary, setChangeSummary] = useState<GitChangeSummary | null>(
    null,
  );
  const [isLoadingChanges, setIsLoadingChanges] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const loadChanges = useCallback(() => {
    if (!project?.repo || !fromRevision.trim()) return;
    setIsLoadingChanges(true);
    setChangeError(null);
    void bridge
      .readGitChangeSummary(
        project.path,
        fromRevision.trim(),
        toRevision.trim() || undefined,
      )
      .then(setChangeSummary)
      .catch((error) =>
        setChangeError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setIsLoadingChanges(false));
  }, [fromRevision, project, toRevision]);

  return {
    revisionOptions: revisionOptions(project),
    fromRevision,
    setFromRevision,
    toRevision,
    setToRevision,
    changeSummary,
    isLoadingChanges,
    changeError,
    loadChanges,
  };
}
