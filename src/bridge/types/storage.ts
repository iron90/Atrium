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
