import type { Language } from "../i18n";
import type { ProjectMeta } from "../features/projects/project-list-model";
import {
  isLayoutId,
  isThemeId,
  type LayoutId,
  type ThemeId,
} from "../features/settings/model";

export const PREFERENCES_STORAGE_KEY = "atrium.preferences.v1";
export const MAX_PREFERENCES_BYTES = 256 * 1024;

const MAX_PREFERENCE_STRING_LENGTH = 4096;
const MAX_PREFERENCE_LIST_ITEMS = 128;
const MAX_PROJECT_META_ENTRIES = 2048;

export interface LocalPreferences {
  theme?: ThemeId;
  layout?: LayoutId;
  language?: Language;
  rootPath?: string;
  workspaces?: string[];
  excludeNames?: string[];
  projectMeta?: Record<string, ProjectMeta>;
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
      result[projectId] = {
        favorite: meta.favorite === true,
        hidden: meta.hidden === true,
      };
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
      layout: isLayoutId(preferences.layout) ? preferences.layout : undefined,
      language: isLanguage(preferences.language)
        ? preferences.language
        : undefined,
      rootPath: isBoundedNonEmptyString(preferences.rootPath)
        ? preferences.rootPath
        : undefined,
      workspaces: readStringList(preferences.workspaces),
      excludeNames: readStringList(preferences.excludeNames),
      projectMeta: readProjectMeta(preferences.projectMeta),
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
    const serialized = JSON.stringify(preferences);
    if (serialized.length > MAX_PREFERENCES_BYTES) return;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, serialized);
  } catch {
    // Preferences are best effort; repository facts never depend on them.
  }
};
