import { useCallback, useMemo } from "react";
import { bridge } from "../../bridge";
import type { Language } from "../../i18n";
import { translate } from "../../i18n";
import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunError,
  RunFinished,
  RunStarted,
} from "../../bridge";
import { useRunEventStream } from "./use-run-event-stream";

export type RunMessage =
  | { type: "ready" }
  | {
      type: "localized";
      key: "commandStartFailed";
    }
  | { type: "cancelled" }
  | {
      type: "command";
      commandKind: ProjectCommand["kind"];
      label: string;
      displayCommand: string;
    }
  | { type: "demo"; displayCommand: string }
  | {
      type: "finished";
      displayCommand: string;
      status: RunFinished["status"];
    };

export interface UseProjectRunnerOptions {
  nativeRuntime: boolean;
  selectedProject?: ProjectSnapshot;
  language: Language;
  onError: (message: string | null) => void;
  onMessage: (message: RunMessage) => void;
}

export interface UseProjectRunnerResult {
  activeRun?: RunStarted;
  outputLines: string[];
  runProjectCommand: (
    command: ProjectCommand,
    projectOverride?: ProjectSnapshot,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => Promise<void>;
  stopActiveRun: () => Promise<void>;
}

export function useProjectRunner({
  nativeRuntime,
  selectedProject,
  language,
  onError,
  onMessage,
}: UseProjectRunnerOptions): UseProjectRunnerResult {
  const handleRunError = useCallback(
    (error: RunError) => onError(error.message),
    [onError],
  );
  const handleRunFinished = useCallback(
    (finished: RunFinished) => {
      onMessage({
        type: "finished",
        displayCommand: finished.displayCommand,
        status: finished.status,
      });
    },
    [onMessage],
  );
  const {
    activeRuns,
    outputLinesFor,
    registerRun,
    completeRun,
    replaceOutput,
  } = useRunEventStream({
    onError: handleRunError,
    onFinished: handleRunFinished,
  });

  const activeRun = useMemo(
    () =>
      selectedProject
        ? Object.values(activeRuns).find(
            (run) => run.projectId === selectedProject.id,
          )
        : undefined,
    [activeRuns, selectedProject],
  );
  const outputLines = activeRun ? outputLinesFor(activeRun.runId) : [];

  const runProjectCommand = useCallback(
    async (
      command: ProjectCommand,
      projectOverride?: ProjectSnapshot,
      profileId?: string,
      profileAction?: ProfileAction,
    ) => {
      const targetProject = projectOverride ?? selectedProject;
      if (!targetProject) return;
      onError(null);
      onMessage({
        type: "command",
        commandKind: command.kind,
        label: command.label,
        displayCommand: command.displayCommand,
      });
      try {
        const started = await bridge.runProjectCommand(
          targetProject.path,
          command.id,
          profileId,
          profileAction,
        );
        registerRun(started);
        if (!nativeRuntime) {
          window.setTimeout(() => {
            replaceOutput(started.runId, [
              translate(language, "demoCompleted"),
            ]);
            completeRun(started.runId);
            onMessage({
              type: "demo",
              displayCommand: command.displayCommand,
            });
          }, 700);
        }
      } catch (runError) {
        onError(
          runError instanceof Error ? runError.message : String(runError),
        );
        onMessage({ type: "localized", key: "commandStartFailed" });
      }
    },
    [
      completeRun,
      language,
      nativeRuntime,
      onError,
      onMessage,
      registerRun,
      replaceOutput,
      selectedProject,
    ],
  );

  const stopActiveRun = useCallback(async () => {
    if (!activeRun) return;
    try {
      await bridge.stopProjectCommand(activeRun.runId);
      completeRun(activeRun.runId);
      onMessage({ type: "cancelled" });
    } catch (stopError) {
      onError(
        stopError instanceof Error ? stopError.message : String(stopError),
      );
    }
  }, [activeRun, completeRun, onError, onMessage]);

  return { activeRun, outputLines, runProjectCommand, stopActiveRun };
}
