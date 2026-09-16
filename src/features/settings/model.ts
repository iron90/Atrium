export type ThemeId = "deep-ocean" | "mist-silver" | "warm-ink";
export type LayoutId = "overview" | "matrix";

export const isThemeId = (value: unknown): value is ThemeId =>
  value === "deep-ocean" || value === "mist-silver" || value === "warm-ink";

export const isLayoutId = (value: unknown): value is LayoutId =>
  value === "overview" || value === "matrix";
