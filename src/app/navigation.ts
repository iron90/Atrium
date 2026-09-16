import type { TranslationKey } from "../i18n";

export type PageId = "projects" | "git" | "settings";

export interface NavigationItem {
  id: PageId;
  labelKey: TranslationKey;
  glyph: string;
}

export const navigationItems: NavigationItem[] = [
  { id: "projects", labelKey: "projects", glyph: "▦" },
  { id: "git", labelKey: "gitHistory", glyph: "⌘" },
  { id: "settings", labelKey: "settings", glyph: "⚙" },
];
