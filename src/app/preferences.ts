import type { Language } from "../i18n";
import type { ProjectMeta } from "../features/projects/project-list-model";
import {
  isInspectorSectionId,
  type InspectorSectionId,
} from "../features/projects/inspector-section-visibility";
import { isThemeId, type ThemeId } from "../features/settings/model";
import { isWorkspaceRefreshMs } from "../features/projects/workspace-refresh";
import { normalizeWindowsPath } from "../shared/windows-path";

export const PREFERENCES_STORAGE_KEY = "atrium.preferences.v1";
export const MAX_PREFERENCES_BYTES = 256 * 1024;

const MAX_PREFERENCE_STRING_LENGTH = 4096;
const MAX_PREFERENCE_LIST_ITEMS = 128;
const MAX_PROJECT_META_ENTRIES = 2048;

export interface LocalPreferences {
  theme?: ThemeId;
  language?: Language;
  rootPath?: string;
  workspaces?: string[];
  excludeNames?: string[];
  projectMeta?: Record<string, ProjectMeta>;
  hiddenInspectorSections?: InspectorSectionId[];
  autoCheckUpdates?: boolean;
  workspaceRefreshMs?: number;
}

const isLanguage = (value: unknown): value is Language =>
  value === "en" || value === "zh";

const isBoundedNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_PREFERENCE_STRING_LENGTH &&
  Boolean(value.trim());

const readStringList = (
  value: unknown,
  maxItems = MAX_PREFERENCE_LIST_ITEMS,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    if (result.length >= maxItems) break;
    if (isBoundedNonEmptyString(item)) result.push(item);
  }
  return result;
};

const readProjectMeta = (
  value: unknown,
): Record<string, ProjectMeta> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, ProjectMeta> = {};
  Object.entries(value)
    .slice(0, MAX_PROJECT_META_ENTRIES)
    .forEach(([projectId, rawMeta]) => {
      if (!isBoundedNonEmptyString(projectId)) return;
      if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
        return;
      }
      const meta = rawMeta as Record<string, unknown>;
      const id = normalizeWindowsPath(projectId);
      const next = {
        favorite: meta.favorite === true,
        hidden: meta.hidden === true,
      };
      const previous = result[id];
      // A project remembered under both the verbatim and legacy path keeps
      // either flag instead of dropping the one read first.
      result[id] = previous
        ? {
            favorite: previous.favorite || next.favorite,
            hidden: previous.hidden || next.hidden,
          }
        : next;
    });
  return result;
};

export const parseLocalPreferences = (raw: string | null): LocalPreferences => {
  if (!raw || raw.length > MAX_PREFERENCES_BYTES) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const preferences = value as Record<string, unknown>;
    return {
      theme: isThemeId(preferences.theme) ? preferences.theme : undefined,
      language: isLanguage(preferences.language)
        ? preferences.language
        : undefined,
      rootPath: isBoundedNonEmptyString(preferences.rootPath)
        ? normalizeWindowsPath(preferences.rootPath)
        : undefined,
      workspaces: readStringList(preferences.workspaces)?.map(
        normalizeWindowsPath,
      ),
      excludeNames: readStringList(preferences.excludeNames),
      projectMeta: readProjectMeta(preferences.projectMeta),
      hiddenInspectorSections: readStringList(
        preferences.hiddenInspectorSections,
      )?.filter(isInspectorSectionId),
      autoCheckUpdates:
        typeof preferences.autoCheckUpdates === "boolean"
          ? preferences.autoCheckUpdates
          : undefined,
      workspaceRefreshMs: isWorkspaceRefreshMs(preferences.workspaceRefreshMs)
        ? preferences.workspaceRefreshMs
        : undefined,
    };
  } catch {
    return {};
  }
};

export const readLocalPreferences = (): LocalPreferences => {
  if (typeof window === "undefined") return {};
  return parseLocalPreferences(
    window.localStorage.getItem(PREFERENCES_STORAGE_KEY),
  );
};

export const persistLocalPreferences = (
  preferences: LocalPreferences,
): void => {
  if (typeof window === "undefined") return;
  try {
    const serialized = serializeWithinBudget(preferences);
    if (!serialized) return;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, serialized);
  } catch {
    // Preferences are best effort; repository facts never depend on them.
  }
};

// projectMeta is the unbounded part (one entry per project path ever seen).
// Dropping oldest entries keeps favorites and hidden flags persisting when
// the budget is hit instead of silently discarding every future write.
const serializeWithinBudget = (
  preferences: LocalPreferences,
): string | null => {
  if (JSON.stringify(preferences).length <= MAX_PREFERENCES_BYTES) {
    return JSON.stringify(preferences);
  }
  const metaEntries = Object.entries(preferences.projectMeta ?? {});
  for (let drop = 0; drop < metaEntries.length; drop += 1) {
    const candidate: LocalPreferences = {
      ...preferences,
      projectMeta: Object.fromEntries(metaEntries.slice(drop)),
    };
    const serialized = JSON.stringify(candidate);
    if (serialized.length <= MAX_PREFERENCES_BYTES) {
      return serialized;
    }
  }
  return null;
};
