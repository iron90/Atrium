import { useCallback, useState } from "react";
import { bridge } from "../../bridge";
import type { ProjectSnapshot } from "../../bridge";
import { createConfigurationAgentPrompt } from "./guidance-prompt";
import { protocolViewModel } from "./protocol-presentation";
import type { Language } from "../../i18n";
import { errorMessage } from "../../shared/errors";

export interface ProjectGuidanceActions {
  agentPrompt: string | null;
  isAgentPromptForGuidanceUpdate: boolean;
  isAgentPromptCopied: boolean;
  isWritingGuidance: boolean;
  reset: () => void;
  dismissAgentPrompt: () => void;
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
        // A prompt opened while integration is unfinished closes once the
        // card reports completion. Only a request made after the card is
        // already integrated stays open, because that click asked for it.
        setIsAgentPromptForGuidanceUpdate(
          protocolViewModel(project).cardStatus === "configured",
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
    dismissAgentPrompt: reset,
    generateGuidance,
    copyAgentPrompt,
  };
}
