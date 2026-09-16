import type { Language } from "../i18n";
import type { ProjectMeta } from "../features/projects/model";
import {
  isLayoutId,
  isThemeId,
  type LayoutId,
  type ThemeId,
} from "../features/settings/model";

export const PREFERENCES_STORAGE_KEY = "atrium.preferences.v1";

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

const readProjectMeta = (
  value: unknown,
): Record<string, ProjectMeta> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, ProjectMeta> = {};
  Object.entries(value).forEach(([projectId, rawMeta], index) => {
    if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
      return;
    }
    const meta = rawMeta as Record<string, unknown>;
    result[projectId] = {
      favorite: meta.favorite === true,
      hidden: meta.hidden === true,
      order:
        typeof meta.order === "number" && Number.isFinite(meta.order)
          ? meta.order
          : index,
    };
  });
  return result;
};

export const parseLocalPreferences = (raw: string | null): LocalPreferences => {
  if (!raw) return {};
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
      rootPath:
        typeof preferences.rootPath === "string" && preferences.rootPath.trim()
          ? preferences.rootPath
          : undefined,
      workspaces: Array.isArray(preferences.workspaces)
        ? preferences.workspaces.filter(
            (path): path is string =>
              typeof path === "string" && Boolean(path.trim()),
          )
        : undefined,
      excludeNames: Array.isArray(preferences.excludeNames)
        ? preferences.excludeNames.filter(
            (name): name is string =>
              typeof name === "string" && Boolean(name.trim()),
          )
        : undefined,
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
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Preferences are best effort; repository facts never depend on them.
  }
};
