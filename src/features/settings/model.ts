export type ThemeId = "deep-ocean" | "mist-silver" | "warm-ink";

export const isThemeId = (value: unknown): value is ThemeId =>
  value === "deep-ocean" || value === "mist-silver" || value === "warm-ink";
