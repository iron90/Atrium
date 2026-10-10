import type { TranslationKey } from "../../i18n";

export const WORKSPACE_REFRESH_DEFAULT_MS = 10_000;

export const WORKSPACE_REFRESH_OPTIONS = [
  0, 5_000, 10_000, 30_000, 60_000, 300_000,
] as const;

export type WorkspaceRefreshMs = (typeof WORKSPACE_REFRESH_OPTIONS)[number];

export const isWorkspaceRefreshMs = (
  value: unknown,
): value is WorkspaceRefreshMs =>
  typeof value === "number" &&
  (WORKSPACE_REFRESH_OPTIONS as readonly number[]).includes(value);

export const WORKSPACE_REFRESH_LABEL_KEYS: Record<
  WorkspaceRefreshMs,
  TranslationKey
> = {
  0: "workspaceRefreshOff",
  5_000: "workspaceRefresh5s",
  10_000: "workspaceRefresh10s",
  30_000: "workspaceRefresh30s",
  60_000: "workspaceRefresh1m",
  300_000: "workspaceRefresh5m",
};
