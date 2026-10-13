import { memo } from "react";
import { bridge, isTauriRuntime, type ProxyTestOutcome } from "../../bridge";
import { DropdownSelect } from "../../shared/DropdownSelect";
import { AnimatedDisclosure } from "../../shared/AnimatedDisclosure";
import { ScrollArea } from "../../shared/ScrollArea";
import { useI18n } from "../../i18n";
import type { Language, TranslationKey } from "../../i18n";
import { fill, formatTime, releaseNoteBlocks } from "../../shared/format";
import type { ThemeId } from "./model";
import type { AppUpdateController } from "./use-app-update";
import { useNetworkProxy } from "./use-network-proxy";

// Shown when no release metadata is available to hand the user a URL.
const FALLBACK_RELEASE_URL = "https://github.com/iron90/Atrium/releases/latest";

import {
  INSPECTOR_SECTION_IDS,
  type InspectorSectionId,
} from "../projects/inspector-section-visibility";
import {
  PROXY_TEST_TARGETS,
  type ProxyTestTarget,
} from "../projects/proxy-test-targets";
import {
  WORKSPACE_REFRESH_LABEL_KEYS,
  WORKSPACE_REFRESH_OPTIONS,
  isWorkspaceRefreshMs,
  type WorkspaceRefreshMs,
} from "../projects/workspace-refresh";

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

function proxyTestMessage(
  t: (key: TranslationKey) => string,
  outcome: ProxyTestOutcome,
  host: string,
): string {
  if (outcome.kind === "tunnelled") {
    // A granted tunnel with no answer from the target is its own result and
    // must not borrow the wording of a fast success.
    return outcome.latencyMillis === null
      ? fill(t("proxyTest.tunnelGranted"), "host", host)
      : fill(t("proxyTest.tunnelled"), "ms", String(outcome.latencyMillis));
  }
  const message = t(`proxyTest.${outcome.kind}`);
  if (outcome.kind === "refused") {
    return fill(message, "status", String(outcome.status));
  }
  return message;
}

function resolveWorkspaceDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return Promise.resolve(null);
  return bridge.pickWorkspaceDirectory();
}

export const SettingsPanel = memo(function SettingsPanel({
  theme,
  setTheme,
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
  workspaceRefreshMs,
  onWorkspaceRefreshMsChange,
}: {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
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
  workspaceRefreshMs: WorkspaceRefreshMs;
  onWorkspaceRefreshMsChange: (intervalMs: WorkspaceRefreshMs) => void;
}) {
  const { t } = useI18n();
  const { state: updateState } = appUpdate;
  const networkProxy = useNetworkProxy();
  // The sentence has to name the actions in the active language instead of
  // leaving English words inside a Chinese sentence.
  const proxyActions = t("networkProxyActions");
  const noteBlocks =
    updateState.phase === "available" && updateState.info?.notes
      ? releaseNoteBlocks(updateState.info.notes, language)
      : [];

  return (
    <div className="settings-view">
      <div className="settings-grid">
        <div className="settings-column">
          <section className="settings-card">
            <h3>{t("appearance")}</h3>
            <p>{t("appearanceDescription")}</p>
            <label className="settings-control" htmlFor="settings-theme">
              <span>{t("theme")}</span>
            </label>
            <DropdownSelect
              id="settings-theme"
              ariaLabel={t("theme")}
              value={theme}
              options={[
                { value: "deep-ocean", label: t("deepOcean") },
                { value: "mist-silver", label: t("mistSilver") },
                { value: "warm-ink", label: t("warmInk") },
              ]}
              onChange={(value) => setTheme(value as ThemeId)}
            />
            <label className="settings-control" htmlFor="settings-language">
              <span>{t("language")}</span>
            </label>
            <DropdownSelect
              id="settings-language"
              ariaLabel={t("language")}
              value={language}
              options={[
                { value: "en", label: t("languageEnglish") },
                { value: "zh", label: t("languageChinese") },
              ]}
              onChange={(value) => setLanguage(value as Language)}
            />
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
        </div>
        <div className="settings-column">
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
            <div className="settings-control">
              <span>{t("excludeDirectories")}</span>
            </div>
            {excludeNames.length ? (
              <div className="exclusion-list">
                {excludeNames.map((name) => (
                  <div className="exclusion-row" key={name}>
                    <span className="exclusion-name">{name}</span>
                    <button
                      type="button"
                      className="exclusion-remove"
                      aria-label={`${t("removeExclusion")} ${name}`}
                      onClick={() =>
                        setExcludeNames(
                          excludeNames.filter((entry) => entry !== name),
                        )
                      }
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-version-status">{t("noExclusions")}</p>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void bridge.pickWorkspaceDirectory().then((picked) => {
                  if (!picked) return;
                  // The exclusion engine matches directory NAMES inside the
                  // workspaces, so the picker contributes the folder's own name.
                  const name = picked.split(/[\\/]/).filter(Boolean).pop();
                  if (!name || excludeNames.includes(name)) return;
                  setExcludeNames([...excludeNames, name]);
                });
              }}
            >
              {t("addExcludedFolder")}
            </button>
            <label
              className="settings-control"
              htmlFor="settings-workspace-refresh"
            >
              <span>{t("workspaceRefresh")}</span>
            </label>
            <DropdownSelect
              id="settings-workspace-refresh"
              ariaLabel={t("workspaceRefresh")}
              value={String(workspaceRefreshMs)}
              options={WORKSPACE_REFRESH_OPTIONS.map((intervalMs) => ({
                value: String(intervalMs),
                label: t(WORKSPACE_REFRESH_LABEL_KEYS[intervalMs]),
              }))}
              onChange={(value) => {
                const intervalMs = Number(value);
                if (isWorkspaceRefreshMs(intervalMs)) {
                  onWorkspaceRefreshMsChange(intervalMs);
                }
              }}
            />
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
            <h3>{t("networkProxyCard")}</h3>
            <p>{fill(t("networkProxyDescription"), "actions", proxyActions)}</p>
            <label
              className="settings-control"
              htmlFor="settings-network-proxy"
            >
              <span>{t("networkProxyAddress")}</span>
            </label>
            <input
              id="settings-network-proxy"
              className="form-control"
              value={networkProxy.proxy}
              placeholder="http://127.0.0.1:7890"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => networkProxy.setProxy(event.target.value)}
            />
            <p className="settings-help">
              {fill(t("networkProxyAddressHint"), "actions", proxyActions)}
            </p>
            <div className="settings-version-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={networkProxy.detection.phase === "detecting"}
                onClick={networkProxy.detection.detect}
              >
                {networkProxy.detection.phase === "detecting"
                  ? t("detectingLocalProxies")
                  : t("detectLocalProxies")}
              </button>
            </div>
            {networkProxy.detection.phase === "done" ? (
              networkProxy.detection.candidates.length ? (
                <ul className="proxy-detection-list">
                  {networkProxy.detection.candidates.map((candidate) => (
                    <li className="proxy-detection-row" key={candidate.url}>
                      <span className="proxy-detection-detail">
                        <code>{candidate.url}</code>
                        <em>{t(`proxyKind.${candidate.kind}`)}</em>
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => networkProxy.setProxy(candidate.url)}
                      >
                        {t("useThisProxy")}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-version-status">
                  {t("noLocalProxyFound")}
                </p>
              )
            ) : null}
            {networkProxy.detection.error ? (
              <p className="settings-version-status">
                {networkProxy.detection.error}
              </p>
            ) : null}
            <AnimatedDisclosure label={t("networkProxyAdvanced")}>
              <label
                className="settings-control"
                htmlFor="settings-network-no-proxy"
              >
                <span>{t("networkProxyBypass")}</span>
              </label>
              <input
                id="settings-network-no-proxy"
                className="form-control"
                value={networkProxy.noProxy}
                placeholder="localhost,127.0.0.1,::1"
                spellCheck={false}
                autoComplete="off"
                onChange={(event) =>
                  networkProxy.setNoProxy(event.target.value)
                }
              />
              <p className="settings-help">{t("networkProxyBypassHint")}</p>
              <label
                className="settings-control"
                htmlFor="settings-network-test-host"
              >
                <span>{t("networkProxyTestHost")}</span>
              </label>
              <input
                id="settings-network-test-host"
                className="form-control"
                value={networkProxy.testHost}
                placeholder="www.gstatic.com"
                spellCheck={false}
                autoComplete="off"
                onChange={(event) =>
                  networkProxy.setTestHost(event.target.value)
                }
              />
              <p className="settings-help">{t("networkProxyTestHostHint")}</p>
            </AnimatedDisclosure>
            <div className="settings-version-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={networkProxy.phase === "loading"}
                onClick={networkProxy.save}
              >
                {networkProxy.phase === "saving"
                  ? t("savingNetworkProxy")
                  : t("saveNetworkProxy")}
              </button>
            </div>

            <div className="settings-version-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={networkProxy.sweep.phase === "running"}
                onClick={networkProxy.sweep.checkAll}
              >
                {networkProxy.sweep.phase === "running"
                  ? t("checkingAllProxyTargets")
                  : t("checkAllProxyTargets")}
              </button>
            </div>
            <p className="settings-help">{t("proxyTargetsNote")}</p>
            <ul className="proxy-detection-list">
              {(() => {
                const customHost = networkProxy.testHost.trim().toLowerCase();
                const known = PROXY_TEST_TARGETS.some(
                  (target) => target.host === customHost,
                );
                const rows: readonly ProxyTestTarget[] = [
                  ...PROXY_TEST_TARGETS,
                  ...(customHost && !known
                    ? [
                        {
                          id: "custom",
                          host: customHost,
                          labelKey: "proxyTargetCustom" as const,
                        },
                      ]
                    : []),
                ];
                return rows.map((target) => {
                  const outcome = networkProxy.sweep.outcomes[target.host];
                  const failure = networkProxy.sweep.errors[target.host];
                  const summary = failure
                    ? failure
                    : outcome
                      ? proxyTestMessage(t, outcome, target.host)
                      : t("proxyTargetPending");
                  const reachable = outcome?.kind === "tunnelled";
                  return (
                    <li className="proxy-detection-row" key={target.id}>
                      <span className="proxy-detection-detail">
                        <code>{target.host}</code>
                        <em className={reachable ? "is-success" : undefined}>
                          {t(target.labelKey)} · {summary}
                        </em>
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(
                          networkProxy.sweep.running[target.host],
                        )}
                        onClick={() =>
                          networkProxy.sweep.checkHost(target.host)
                        }
                      >
                        {networkProxy.sweep.running[target.host]
                          ? t("testingThisHost")
                          : t("testThisHost")}
                      </button>
                    </li>
                  );
                });
              })()}
            </ul>
            {networkProxy.phase === "saved" ? (
              <p className="settings-version-status">
                {t("networkProxySaved")}
              </p>
            ) : null}
            {networkProxy.error ? (
              <p className="settings-version-status">{networkProxy.error}</p>
            ) : null}
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
            {noteBlocks.length > 0 ? (
              <ScrollArea viewportClassName="settings-version-notes">
                {noteBlocks.map((block, index) =>
                  block.type === "heading" ? (
                    <h4 key={index}>{block.text}</h4>
                  ) : block.type === "command" ? (
                    <code key={index} className="settings-version-command">
                      {block.text}
                    </code>
                  ) : (
                    <p key={index}>{block.text}</p>
                  ),
                )}
              </ScrollArea>
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
                  formatTime(updateState.lastCheckedAt, language),
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
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void appUpdate.check()}
                  >
                    {t("checkForUpdates")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void appUpdate.install()}
                  >
                    {t("installUpdate")}
                  </button>
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
    </div>
  );
});
