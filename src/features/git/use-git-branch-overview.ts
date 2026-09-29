import { useEffect, useRef, useState } from "react";
import { bridge } from "../../bridge";
import type { GitBranchOverview, ProjectSnapshot } from "../../bridge";
import { errorMessage } from "../../shared/errors";

export interface GitBranchOverviewState {
  overview: GitBranchOverview | null;
  isLoading: boolean;
  error: string | null;
}

// Inspecting a branch is view state: the worktree never moves, so the
// overview is fetched per selected branch and discarded on selection change.
// Selecting the checked-out branch is the HEAD view and uses the snapshot.
export function useGitBranchOverview(
  project: ProjectSnapshot | undefined,
  branch: string | null,
): GitBranchOverviewState {
  const [overview, setOverview] = useState<GitBranchOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const headBranch = project?.repo?.branch ?? null;
  const effectiveBranch =
    project && branch && branch !== headBranch ? branch : null;

  useEffect(() => {
    if (!project || !effectiveBranch) {
      requestRef.current += 1;
      setOverview(null);
      setIsLoading(false);
      setError(null);
      return undefined;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);
    setError(null);
    bridge
      .readGitBranchOverview(project.path, effectiveBranch)
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setOverview(result);
        setIsLoading(false);
      })
      .catch((overviewError) => {
        if (requestRef.current !== requestId) return;
        setOverview(null);
        setError(errorMessage(overviewError));
        setIsLoading(false);
      });
    return undefined;
  }, [project, effectiveBranch]);

  return { overview, isLoading, error };
}
