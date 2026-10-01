import { useEffect, useState } from "react";
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
  const headBranch = project?.repo?.branch ?? null;
  const effectiveBranch =
    project && branch && branch !== headBranch ? branch : null;
  const projectPath = project?.path ?? null;
  const cacheKey =
    projectPath && effectiveBranch ? `${projectPath}|${effectiveBranch}` : null;

  const [result, setResult] = useState<{
    key: string;
    overview: GitBranchOverview | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!cacheKey || !projectPath || !effectiveBranch) return undefined;
    let cancelled = false;
    bridge
      .readGitBranchOverview(projectPath, effectiveBranch)
      .then((overview) => {
        if (!cancelled) setResult({ key: cacheKey, overview, error: "" });
      })
      .catch((overviewError) => {
        if (!cancelled) {
          setResult({
            key: cacheKey,
            overview: null,
            error: errorMessage(overviewError),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, projectPath, effectiveBranch]);

  if (!cacheKey) {
    return { overview: null, isLoading: false, error: null };
  }
  if (!result || result.key !== cacheKey) {
    // In flight: a requested key without a settled result loads.
    return { overview: null, isLoading: true, error: null };
  }
  if (result.error) {
    return { overview: null, isLoading: false, error: result.error };
  }
  return { overview: result.overview, isLoading: false, error: null };
}
