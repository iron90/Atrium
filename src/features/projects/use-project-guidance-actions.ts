import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";
import { createConfigurationAgentPrompt } from "./guidance-prompt";
import type { Language } from "../../i18n";
import { errorMessage } from "../../shared/errors";
import { protocolViewModel } from "./protocol-presentation";

export interface ProjectGuidanceActions {
  agentPrompt: string | null;
  isAgentPromptForGuidanceUpdate: boolean;
  isAgentPromptCopied: boolean;
  isWritingGuidance: boolean;
  reset: () => void;
  generateGuidance: (project: ProjectSnapshot) => Promise<void>;
  copyAgentPrompt: () => Promise<void>;
}

export interface UseProjectGuidanceActionsOptions {
  language: Language;
  onError: (message: string | null) => void;
}

export function useProjectGuidanceActions({
  language,
  onError,
}: UseProjectGuidanceActionsOptions): ProjectGuidanceActions {
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
  const [isAgentPromptForGuidanceUpdate, setIsAgentPromptForGuidanceUpdate] =
    useState(false);
  const [isAgentPromptCopied, setIsAgentPromptCopied] = useState(false);
  const [isWritingGuidance, setIsWritingGuidance] = useState(false);

  const reset = useCallback(() => {
    setAgentPrompt(null);
    setIsAgentPromptForGuidanceUpdate(false);
    setIsAgentPromptCopied(false);
  }, []);

  const generateGuidance = useCallback(
    async (project: ProjectSnapshot) => {
      setIsWritingGuidance(true);
      onError(null);
      try {
        const report = await bridge.generateProjectGuidance(project.path);
        setAgentPrompt(
          createConfigurationAgentPrompt(project, report.paths, language),
        );
        const protocolView = protocolViewModel(project);
        setIsAgentPromptForGuidanceUpdate(
          protocolView.needsUpdate && protocolView.isReady,
        );
        setIsAgentPromptCopied(false);
      } catch (error) {
        onError(errorMessage(error));
      } finally {
        setIsWritingGuidance(false);
      }
    },
    [language, onError],
  );

  const copyAgentPrompt = useCallback(async () => {
    if (!agentPrompt) return;
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable in this session.");
      }
      await navigator.clipboard.writeText(agentPrompt);
      setIsAgentPromptCopied(true);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [agentPrompt, onError]);

  return {
    agentPrompt,
    isAgentPromptForGuidanceUpdate,
    isAgentPromptCopied,
    isWritingGuidance,
    reset,
    generateGuidance,
    copyAgentPrompt,
  };
}
