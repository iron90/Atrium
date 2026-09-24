import { memo } from "react";
import { bridge, isTauriRuntime } from "../../bridge";
import { useI18n } from "../../i18n";
import type { Language } from "../../i18n";
import type { LayoutId, ThemeId } from "./model";

function resolveWorkspaceDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return Promise.resolve(null);
  return bridge.pickWorkspaceDirectory();
}

export const SettingsPanel = memo(function SettingsPanel({
  theme,
  setTheme,
  layout,
  setLayout,
  language,
  setLanguage,
  workspacePaths,
  onWorkspacePathsChange,
  excludeNames,
  setExcludeNames,
  onScan,
  isScanning,
}: {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  layout: LayoutId;
  setLayout: (layout: LayoutId) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  workspacePaths: string[];
  onWorkspacePathsChange: (paths: string[]) => void;
  excludeNames: string[];
  setExcludeNames: (names: string[]) => void;
  onScan: () => void;
  isScanning: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="settings-view">
      <div className="settings-grid">
        <section className="settings-card">
          <h3>{t("appearance")}</h3>
          <p>{t("appearanceDescription")}</p>
          <label className="settings-control" htmlFor="settings-theme">
            <span>{t("theme")}</span>
            <select
              className="form-control"
              id="settings-theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemeId)}
            >
              <option value="deep-ocean">{t("deepOcean")}</option>
              <option value="mist-silver">{t("mistSilver")}</option>
              <option value="warm-ink">{t("warmInk")}</option>
            </select>
          </label>
          <label className="settings-control" htmlFor="settings-layout">
            <span>{t("layout")}</span>
            <select
              className="form-control"
              id="settings-layout"
              value={layout}
              onChange={(event) => setLayout(event.target.value as LayoutId)}
            >
              <option value="overview">{t("overview")}</option>
              <option value="matrix">{t("platformMatrix")}</option>
            </select>
          </label>
          <label className="settings-control" htmlFor="settings-language">
            <span>{t("language")}</span>
            <select
              className="form-control"
              id="settings-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="zh">{t("languageChinese")}</option>
            </select>
          </label>
        </section>

        <section className="settings-card settings-card-workspace">
          <h3>{t("workspace")}</h3>
          <p>{t("workspaceDescription")}</p>
          <div className="workspace-path-list">
            {workspacePaths.map((path, index) => (
              <div className="workspace-path-row" key={`${index}-${path}`}>
                <input
                  className="form-control"
                  aria-label={`${t("workspacePath")} ${index + 1}`}
                  value={path}
                  onChange={(event) => {
                    const next = [...workspacePaths];
                    next[index] = event.target.value;
                    onWorkspacePathsChange(next);
                  }}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="workspace-path-browse"
                  aria-label={`${t("browseWorkspace")} ${index + 1}`}
                  onClick={() => {
                    void resolveWorkspaceDirectory().then((selected) => {
                      if (!selected) return;
                      const next = [...workspacePaths];
                      next[index] = selected;
                      onWorkspacePathsChange(next);
                    });
                  }}
                >
                  …
                </button>
                <button
                  type="button"
                  className="workspace-path-remove"
                  aria-label={`${t("removeWorkspace")} ${index + 1}`}
                  onClick={() =>
                    onWorkspacePathsChange(
                      workspacePaths.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (!isTauriRuntime()) {
                onWorkspacePathsChange([...workspacePaths, ""]);
                return;
              }
              void resolveWorkspaceDirectory().then((selected) => {
                onWorkspacePathsChange(
                  selected
                    ? [...workspacePaths.filter(Boolean), selected]
                    : [...workspacePaths, ""],
                );
              });
            }}
          >
            {t("addWorkspace")}
          </button>
          <label className="settings-control">
            <span>{t("excludeDirectories")}</span>
            <textarea
              className="form-control form-control-multiline"
              value={excludeNames.join("\n")}
              onChange={(event) =>
                setExcludeNames(
                  event.target.value
                    .split(/\n|,/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                )
              }
              rows={3}
              placeholder="node_modules, target"
            />
          </label>
          <div className="settings-footer">
            <p className="settings-help">
              {t("workspaceExclusionDescription")}
            </p>
            <button
              className={`scan-button settings-scan ${isScanning ? "is-loading" : ""}`}
              type="button"
              onClick={onScan}
              disabled={isScanning}
              aria-busy={isScanning}
            >
              <span
                className={`status-spinner ${isScanning ? "is-active" : ""}`}
                aria-hidden="true"
              >
                {isScanning ? "◌" : "↻"}
              </span>
              {isScanning ? t("scanning") : t("scanWorkspace")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
});
