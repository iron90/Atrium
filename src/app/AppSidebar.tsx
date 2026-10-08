import atriumIcon from "../../src-tauri/icons/icon.png";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { ScrollArea } from "../shared/ScrollArea";
import { useI18n } from "../i18n";
import { fill } from "../shared/format";
import { APP_VERSION } from "./app-version";
import { LocalActivityPanel, type RuntimeStatus } from "./LocalActivityPanel";
import type { PageId } from "./navigation";
import { navigationItems } from "./navigation";

export function AppSidebar({
  activePage,
  onPageChange,
  status,
  onStop,
  updateAvailable,
}: {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  status: RuntimeStatus;
  onStop: () => Promise<void> | void;
  updateAvailable: boolean;
}) {
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);
  const navItemRefs = useRef<Partial<Record<PageId, HTMLButtonElement | null>>>(
    {},
  );
  const [activeIndicator, setActiveIndicator] = useState({
    top: 0,
    height: 40,
  });

  const measureActiveIndicator = useCallback(() => {
    const nav = navRef.current;
    const activeItem = navItemRefs.current[activePage];
    if (!nav || !activeItem) return;

    const navRect = nav.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    setActiveIndicator({
      top: itemRect.top - navRect.top,
      height: itemRect.height || 40,
    });
  }, [activePage]);

  useLayoutEffect(() => {
    measureActiveIndicator();

    const nav = navRef.current;
    if (!nav) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureActiveIndicator);
      return () => window.removeEventListener("resize", measureActiveIndicator);
    }

    const resizeObserver = new ResizeObserver(measureActiveIndicator);
    resizeObserver.observe(nav);
    Object.values(navItemRefs.current).forEach((item) => {
      if (item) resizeObserver.observe(item);
    });

    return () => resizeObserver.disconnect();
  }, [measureActiveIndicator]);

  return (
    <ScrollArea
      className="sidebar-shell"
      viewportClassName="sidebar"
      viewportComponent="aside"
    >
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
            {updateAvailable ? (
              <button
                type="button"
                className="sidebar-update-badge"
                title={t("sidebarUpdateAvailable")}
                aria-label={t("sidebarUpdateAvailable")}
                onClick={() => onPageChange("settings")}
              >
                <FiArrowUp aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        className="primary-nav"
        aria-label={t("localProjectBoard")}
        ref={navRef}
      >
        <span
          className="nav-active-indicator"
          aria-hidden="true"
          style={
            {
              "--nav-indicator-top": `${activeIndicator.top}px`,
              "--nav-indicator-height": `${activeIndicator.height}px`,
            } as React.CSSProperties
          }
        />
        {navigationItems.map((item) => (
          <button
            className={`nav-item ${activePage === item.id ? "is-active" : ""}`}
            key={item.id}
            type="button"
            ref={(element) => {
              navItemRefs.current[item.id] = element;
            }}
            onClick={() => onPageChange(item.id)}
          >
            <span className="nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <LocalActivityPanel status={status} onStop={onStop} />
    </ScrollArea>
  );
}
