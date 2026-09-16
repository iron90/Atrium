export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  timestamp: number;
  subject: string;
}

export type GitReferenceKind = "branch" | "tag";

export interface GitReference {
  name: string;
  kind: GitReferenceKind;
  sha: string | null;
}

export interface GitSnapshot {
  branch: string | null;
  isClean: boolean;
  worktreeChanges: number;
  remote: string | null;
  ahead: number | null;
  behind: number | null;
  lastCommit: GitCommit | null;
  recentCommits: GitCommit[];
  references: GitReference[];
}

export interface GitChangeSummary {
  projectPath: string;
  from: string;
  to: string;
  commits: GitCommit[];
  files: GitFileChange[];
  insertions: number;
  deletions: number;
}

export interface GitFileChange {
  path: string;
  status: string;
  additions: number | null;
  deletions: number | null;
}
