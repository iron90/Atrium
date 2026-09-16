import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";

import { en, zh } from "./i18n/catalog";
export type { Language, TranslationKey } from "./i18n/catalog";
import type { Language, TranslationKey } from "./i18n/catalog";

export interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

export const I18nContext = createContext<I18nValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (key) => en[key],
});

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function translate(language: Language, key: TranslationKey): string {
  return (language === "zh" ? zh : en)[key];
}

export function I18nProvider({
  value,
  children,
}: {
  value: I18nValue;
  children: ReactNode;
}) {
  return createElement(I18nContext.Provider, { value }, children);
}

const facetKeys: Record<string, TranslationKey> = {
  node: "facetNode",
  rust: "facetRust",
  flutter: "facetFlutter",
  python: "facetPython",
  dotnet: "facetDotnet",
  unity: "facetUnity",
  apple: "facetApple",
  desktop: "facetDesktop",
  macos: "facetMacos",
  windows: "facetWindows",
  linux: "facetLinux",
  ios: "facetIos",
  ipad: "facetIpados",
  ipados: "facetIpados",
  android: "facetAndroid",
  web: "facetWeb",
  "github-releases": "facetGithubReleases",
  "github-actions": "facetGithubActions",
  "app-store": "facetAppStore",
  testflight: "facetTestflight",
  "microsoft-store": "facetMicrosoftStore",
};

export function localizedFacetLabel(
  language: Language,
  key: string,
  fallback: string,
): string {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const translationKey = facetKeys[key] ?? facetKeys[normalizedKey];
  return translationKey ? translate(language, translationKey) : fallback;
}
