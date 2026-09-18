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
  guidanceMessage: string | null;
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
  guidanceMessage,
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
  const guidanceNeedsAction =
    inspectedProject.guidance.needsUpdate ||
    inspectedProject.guidance.needsSync;
  const shouldShowGuidanceAction =
    protocolView.shouldShowGuidance || guidanceNeedsAction;
  const shouldShowAgentGuidance =
    protocolView.shouldShowGuidance ||
    (isAgentPromptForGuidanceUpdate && guidanceNeedsAction);
  const isUpdatingGuidance = guidanceNeedsAction && protocolView.isReady;
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
      {guidanceMessage && shouldShowGuidanceAction ? (
        <p className="protocol-message">{guidanceMessage}</p>
      ) : null}
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
