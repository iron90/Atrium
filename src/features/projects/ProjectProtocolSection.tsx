import type { ProjectSnapshot } from "../../bridge";
import { AnimatedDisclosure } from "../../shared/AnimatedDisclosure";
import { ScrollArea } from "../../shared/ScrollArea";
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
  onDismissAgentPrompt: () => void;
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
  onDismissAgentPrompt,
  isWritingGuidance,
  onGenerateGuidance,
}: ProjectProtocolSectionProps) {
  const { t } = useI18n();
  const protocol = inspectedProject.protocol;
  const protocolView = protocolViewModel(inspectedProject);
  const shouldShowAgentGuidance =
    protocolView.needsGuidance || isAgentPromptForGuidanceUpdate;
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
        <button
          className="protocol-action"
          type="button"
          onClick={() => onGenerateGuidance(project)}
          disabled={isWritingGuidance}
        >
          {isWritingGuidance
            ? t("generatingGuidance")
            : protocolView.cardStatus === "needs-update"
              ? t("updateAgentGuidance")
              : protocolView.cardStatus === "needs-sync"
                ? t("finishAgentIntegration")
                : protocolView.cardStatus === "missing"
                  ? t("generateGuidance")
                  : t("refreshIntegration")}
        </button>
      </div>
      <AnimatedDisclosure
        className="protocol-details"
        key={project.id}
        label={t("protocolDetails")}
        meta={protocolDetailsSummary}
      >
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
      </AnimatedDisclosure>
      {agentPrompt && shouldShowAgentGuidance ? (
        <div className="agent-prompt-card">
          <div className="agent-prompt-heading">
            <strong>{t("agentPromptTitle")}</strong>
            <div className="agent-prompt-actions">
              <button
                className="protocol-action"
                type="button"
                onClick={onCopyAgentPrompt}
              >
                {isAgentPromptCopied
                  ? t("agentPromptCopied")
                  : t("copyAgentPrompt")}
              </button>
              <button
                className="protocol-action"
                type="button"
                onClick={onDismissAgentPrompt}
              >
                {t("dismissAgentPrompt")}
              </button>
            </div>
          </div>
          <ScrollArea
            viewportComponent="textarea"
            viewportClassName="agent-prompt"
            viewportProps={{
              readOnly: true,
              value: agentPrompt,
              "aria-label": t("agentPromptTitle"),
              rows: 10,
            }}
          />
        </div>
      ) : null}
    </InspectorSection>
  );
}
