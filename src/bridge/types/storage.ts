export type StorageEntryKind = "cache" | "build";

export interface StorageEntry {
  relativePath: string;
  kind: StorageEntryKind;
  bytes: number;
  fileCount: number;
  isComplete: boolean;
}

export type BuildArtifactKind = "file" | "directory" | "missing" | "invalid";

export interface BuildArtifact {
  profileId: string;
  profileLabel: string;
  relativePath: string;
  kind: BuildArtifactKind;
  bytes: number;
  fileCount: number;
  modifiedAt: number | null;
  isComplete: boolean;
}

export interface ProjectStorage {
  totalBytes: number;
  cleanableBytes: number;
  isComplete: boolean;
  entries: StorageEntry[];
}

export type CleanupProgressPhase = "preparing" | "deleting" | "finalizing";

export interface CleanupProgress {
  phase: CleanupProgressPhase;
  relativePath: string | null;
  completedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  percent: number;
}

export interface StorageCleanupFailure {
  relativePath: string;
  message: string;
}

export interface CleanupResult {
  removedBytes: number;
  removedEntries: StorageEntry[];
  failedEntries: StorageCleanupFailure[];
  storage: ProjectStorage;
}
