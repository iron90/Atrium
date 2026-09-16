import type { ReactNode } from "react";
import type { Facet } from "../../bridge";
import { useI18n, localizedFacetLabel } from "../../i18n";
import { FacetMark } from "./FacetMark";
import { facetTitle } from "./facets";

export function DetailLoading() {
  const { t } = useI18n();
  return (
    <div className="details-loading" aria-label={t("loadingDetails")}>
      <span className="loading-line loading-line-long" />
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
    </div>
  );
}

export function InspectorSection({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>{title}</h3>
        {trailing ? <span>{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function FacetDetail({
  label,
  facets,
  kind,
}: {
  label: string;
  facets: Facet[];
  kind: "platform" | "channel";
}) {
  const { language, t } = useI18n();

  return (
    <div className="facet-detail">
      <span>{label}</span>
      <div>
        {facets.length ? (
          facets.map((facet) => (
            <span
              className={`detail-chip ${kind === "platform" ? "platform-detail-chip" : ""}`}
              key={facet.key}
              title={facetTitle(language, facet)}
              aria-label={
                kind === "platform"
                  ? localizedFacetLabel(language, facet.key, facet.label)
                  : undefined
              }
            >
              <FacetMark facet={facet} kind={kind} />
              {kind === "channel"
                ? localizedFacetLabel(language, facet.key, facet.label)
                : null}
            </span>
          ))
        ) : (
          <span className="muted-inline">{t("noEvidence")}</span>
        )}
      </div>
    </div>
  );
}
