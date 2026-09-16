import { useI18n } from "../i18n";
import type { PageId } from "./navigation";
import { navigationItems } from "./navigation";

export function AppSidebar({
  activePage,
  nativeRuntime,
  onPageChange,
}: {
  activePage: PageId;
  nativeRuntime: boolean;
  onPageChange: (page: PageId) => void;
}) {
  const { t } = useI18n();

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-name">Atrium</div>
          <div className="brand-subtitle">{t("localProjectBoard")}</div>
        </div>
      </div>

      <nav className="primary-nav" aria-label={t("localProjectBoard")}>
        {navigationItems.map((item) => (
          <button
            className={`nav-item ${activePage === item.id ? "is-active" : ""}`}
            key={item.id}
            type="button"
            onClick={() => onPageChange(item.id)}
          >
            <span className="nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-note">
        <span className="note-kicker">{t("localFirst")}</span>
        <p>{t("localFirstBody")}</p>
      </div>

      <div className="sidebar-footer">
        <span className="connection-dot" />
        <span>{nativeRuntime ? t("nativeSession") : t("previewSession")}</span>
      </div>
    </aside>
  );
}
