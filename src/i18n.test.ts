import { describe, expect, it } from "vitest";
import { localizedFacetLabel } from "./i18n";

describe("localizedFacetLabel", () => {
  it("resolves equivalent facet keys with different separators", () => {
    expect(localizedFacetLabel("en", "github_releases", "Fallback")).toBe(
      "GitHub Releases",
    );
    expect(localizedFacetLabel("zh", "GitHub Releases", "Fallback")).toBe(
      "GitHub Releases",
    );
  });

  it("keeps the supplied label for unknown facets", () => {
    expect(localizedFacetLabel("en", "custom-channel", "Custom channel")).toBe(
      "Custom channel",
    );
  });
});
