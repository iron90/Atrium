import atriumIcon from "../../src-tauri/icons/icon.png";
import type { RunStarted } from "../bridge";
import { useI18n } from "../i18n";
import { fill } from "../shared/format";
import { APP_VERSION } from "./app-version";
import { LocalActivityPanel } from "./LocalActivityPanel";
import type { PageId } from "./navigation";
import { navigationItems } from "./navigation";

export function AppSidebar({
  activePage,
  onPageChange,
  activity,
}: {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  activity: {
    activeRun?: RunStarted;
    onStop: () => Promise<void> | void;
    projectName?: string;
  };
}) {
  const { t } = useI18n();

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <img
          className="brand-mark"
          src={atriumIcon}
          alt=""
          aria-hidden="true"
        />
        <div>
          <div className="brand-name">Atrium</div>
          <div className="brand-subtitle">{t("localProjectBoard")}</div>
          <div className="brand-version">
            {fill(t("appVersion"), "version", APP_VERSION)}
          </div>
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

      <LocalActivityPanel
        activeRun={activity.activeRun}
        onStop={activity.onStop}
        projectName={activity.projectName}
      />
    </aside>
  );
}
