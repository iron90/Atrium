import { memo } from "react";
import { bridge, isTauriRuntime } from "../../bridge";
import { useI18n } from "../../i18n";
import type { Language, TranslationKey } from "../../i18n";
import { fill, formatTime } from "../../shared/format";
import type { LayoutId, ThemeId } from "./model";
import type { AppUpdateController } from "./use-app-update";

// Shown when no release metadata is available to hand the user a URL.
const FALLBACK_RELEASE_URL = "https://github.com/iron90/Atrium/releases/latest";
import {
  INSPECTOR_SECTION_IDS,
  type InspectorSectionId,
} from "../projects/inspector-section-visibility";

// The switch rows reuse the detail-card section headings so the settings
// labels always match what the card actually shows.
const INSPECTOR_SECTION_LABEL_KEYS: Record<InspectorSectionId, TranslationKey> =
  {
    storage: "storage",
    buildProfiles: "buildProfiles",
    rawRepositoryCommands: "rawRepositoryCommands",
    runHistory: "runHistory",
    recentCommits: "recentCommits",
  };

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
  hiddenInspectorSections,
  onToggleInspectorSection,
  appVersion,
  update: appUpdate,
  autoCheckUpdates,
  onAutoCheckUpdatesChange,
  inAppInstallSupported,
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
  hiddenInspectorSections: InspectorSectionId[];
  onToggleInspectorSection: (sectionId: InspectorSectionId) => void;
  appVersion: string;
  update: AppUpdateController;
  autoCheckUpdates: boolean;
  onAutoCheckUpdatesChange: (enabled: boolean) => void;
  inAppInstallSupported: boolean;
}) {
  const { t } = useI18n();
  const { state: updateState } = appUpdate;

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

        <section className="settings-card">
          <h3>{t("inspectorCard")}</h3>
          <p>{t("inspectorCardDescription")}</p>
          <div className="settings-switch-list">
            {INSPECTOR_SECTION_IDS.map((sectionId) => (
              <label className="settings-switch" key={sectionId}>
                <input
                  type="checkbox"
                  role="switch"
                  className="sr-only"
                  checked={!hiddenInspectorSections.includes(sectionId)}
                  onChange={() => onToggleInspectorSection(sectionId)}
                />
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">
                  {t(INSPECTOR_SECTION_LABEL_KEYS[sectionId])}
                </span>
              </label>
            ))}
          </div>
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
        <section className="settings-card">
          <h3>{t("versionCard")}</h3>
          <div className="settings-version-row">
            <span>{t("currentVersion")}</span>
            <span className="settings-version-number">{appVersion}</span>
          </div>
          {updateState.phase === "available" && updateState.info ? (
            <p className="settings-version-status">
              {fill(
                t("newVersionAvailable"),
                "version",
                updateState.info.version,
              )}
            </p>
          ) : null}
          {updateState.phase === "available" && updateState.info?.notes ? (
            <p className="settings-version-notes">{updateState.info.notes}</p>
          ) : null}
          {updateState.phase === "downloading" ? (
            <div className="settings-version-progress" aria-hidden="true">
              <span style={{ width: `${updateState.progress ?? 0}%` }} />
            </div>
          ) : null}
          {updateState.phase === "upToDate" ? (
            <p className="settings-version-status">{t("upToDate")}</p>
          ) : null}
          {updateState.phase === "ready" ? (
            <p className="settings-version-status">{t("updateReady")}</p>
          ) : null}
          {updateState.phase === "error" ? (
            <p className="settings-version-status">
              {updateState.errorKind === "install"
                ? t("updateFailed")
                : t("updateCheckFailed")}
            </p>
          ) : null}
          {updateState.lastCheckedAt ? (
            <p className="settings-help">
              {fill(
                t("lastChecked"),
                "time",
                formatTime(
                  Math.floor(updateState.lastCheckedAt / 1000),
                  language,
                ),
              )}
            </p>
          ) : null}
          <div className="settings-version-actions">
            {updateState.phase === "checking" ? (
              <button type="button" className="secondary-button" disabled>
                {t("checkingForUpdates")}
              </button>
            ) : null}
            {updateState.phase === "downloading" ? (
              <button type="button" className="secondary-button" disabled>
                {t("updating")}
              </button>
            ) : null}
            {updateState.phase === "ready" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void appUpdate.restart()}
              >
                {t("restartToUpdate")}
              </button>
            ) : null}
            {updateState.phase === "available" ? (
              <>
                {inAppInstallSupported ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void appUpdate.install()}
                  >
                    {t("installUpdate")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void appUpdate.openReleasePage(FALLBACK_RELEASE_URL)
                  }
                >
                  {t("openDownloadPage")}
                </button>
              </>
            ) : null}
            {updateState.phase === "idle" ||
            updateState.phase === "upToDate" ||
            updateState.phase === "error" ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void appUpdate.check()}
                >
                  {t("checkForUpdates")}
                </button>
                {updateState.phase === "error" ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      void appUpdate.openReleasePage(FALLBACK_RELEASE_URL)
                    }
                  >
                    {t("openDownloadPage")}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              role="switch"
              className="sr-only"
              checked={autoCheckUpdates}
              onChange={(event) =>
                onAutoCheckUpdatesChange(event.target.checked)
              }
            />
            <span className="settings-switch-track" aria-hidden="true">
              <span className="settings-switch-thumb" />
            </span>
            <span className="settings-switch-label">
              {t("autoCheckUpdates")}
            </span>
          </label>
        </section>
      </div>
    </div>
  );
});
