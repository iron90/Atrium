import type { ProjectSnapshot } from "../../bridge";
import { useI18n } from "../../i18n";
import { fill } from "../../shared/format";
import { InspectorSection } from "./InspectorPrimitives";
import {
  capabilityLabel,
  capabilityStatusLabel,
  protocolStatusLabel,
  protocolViewModel,
} from "./presentation";

export interface ProjectProtocolSectionProps {
  project: ProjectSnapshot;
  inspectedProject: ProjectSnapshot;
  agentPrompt: string | null;
  isAgentPromptForGuidanceUpdate: boolean;
  isAgentPromptCopied: boolean;
  onCopyAgentPrompt: () => void;
  isWritingGuidance: boolean;
  onGenerateGuidance: (project: ProjectSnapshot) => void;
}

export function ProjectProtocolSection({
  project,
  inspectedProject,
  agentPrompt,
  isAgentPromptForGuidanceUpdate,
  isAgentPromptCopied,
  onCopyAgentPrompt,
  isWritingGuidance,
  onGenerateGuidance,
}: ProjectProtocolSectionProps) {
  const { t } = useI18n();
  const protocol = inspectedProject.protocol;
  const protocolView = protocolViewModel(inspectedProject);
  const shouldShowGuidanceAction =
    protocolView.shouldShowGuidance || protocolView.needsUpdate;
  const shouldShowAgentGuidance =
    protocolView.shouldShowGuidance ||
    (isAgentPromptForGuidanceUpdate && protocolView.needsUpdate);
  const isUpdatingGuidance = protocolView.needsUpdate && protocolView.isReady;
  const protocolDetailsSummary = fill(
    t("protocolDetailsSummary"),
    "count",
    String(protocol.capabilities.length),
  );

  return (
    <InspectorSection title={t("atriumProtocol")}>
      <div
        className={`protocol-card protocol-status-${protocolView.cardStatus}`}
      >
        <div>
          <strong>{protocolStatusLabel(protocolView.cardStatus, t)}</strong>
          <div className="protocol-path">
            <span>{protocol.manifestPath}</span>
          </div>
        </div>
        {shouldShowGuidanceAction ? (
          <button
            className="protocol-action"
            type="button"
            onClick={() => onGenerateGuidance(project)}
            disabled={isWritingGuidance}
          >
            {isWritingGuidance
              ? t("generatingGuidance")
              : isUpdatingGuidance
                ? t("updateAgentGuidance")
                : t("generateGuidance")}
          </button>
        ) : null}
      </div>
      <details className="protocol-details" key={project.id}>
        <summary>
          <span>{t("protocolDetails")}</span>
          <span>{protocolDetailsSummary}</span>
        </summary>
        <div className="protocol-details-body">
          <div
            className="protocol-capabilities"
            aria-label={t("protocolCapabilities")}
          >
            <div
              className={`protocol-capability ${
                protocolView.needsUpdate
                  ? "capability-needs-update"
                  : "capability-configured"
              }`}
            >
              <span className="capability-dot" />
              <span>
                <strong>{t("capabilityAgentGuidance")}</strong>
              </span>
            </div>
            {protocol.capabilities.map((capability) => (
              <div
                className={`protocol-capability capability-${capability.status}`}
                key={capability.id}
                title={
                  capability.issues.join(" ") || capability.evidence.join(", ")
                }
              >
                <span className="capability-dot" />
                <span>
                  <strong>{capabilityLabel(capability.id, t)}</strong>
                  <small>{capabilityStatusLabel(capability.status, t)}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
      {agentPrompt && shouldShowAgentGuidance ? (
        <div className="agent-prompt-card">
          <div className="agent-prompt-heading">
            <div>
              <strong>{t("agentPromptTitle")}</strong>
              <span>{t("agentPromptDescription")}</span>
            </div>
            <button
              className="protocol-action"
              type="button"
              onClick={onCopyAgentPrompt}
            >
              {isAgentPromptCopied
                ? t("agentPromptCopied")
                : t("copyAgentPrompt")}
            </button>
          </div>
          <textarea
            className="agent-prompt"
            readOnly
            value={agentPrompt}
            aria-label={t("agentPromptTitle")}
            rows={10}
          />
        </div>
      ) : null}
    </InspectorSection>
  );
}
