import type { Facet } from "../../bridge";
import { localizedFacetLabel, type Language } from "../../i18n";

export function normalizePlatformKey(platformKey: string): string {
  return platformKey.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function facetTitle(language: Language, facet: Facet): string {
  const label = localizedFacetLabel(language, facet.key, facet.label);
  return facet.evidence.length
    ? `${label} · ${facet.evidence.join(", ")}`
    : label;
}
