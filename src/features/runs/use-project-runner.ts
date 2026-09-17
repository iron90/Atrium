import { useCallback, useEffect, useMemo, useRef } from "react";
import { bridge } from "../../bridge";
import type { Language } from "../../i18n";
import { translate } from "../../i18n";
import type { RunMessage } from "../../shared/activity";
import { errorMessage } from "../../shared/errors";
import type {
  ProfileAction,
  ProjectCommand,
  ProjectSnapshot,
  RunError,
  RunFinished,
  RunStarted,
} from "../../bridge";
import { useRunEventStream } from "./use-run-event-stream";

export type { RunMessage } from "../../shared/activity";

export interface UseProjectRunnerOptions {
  nativeRuntime: boolean;
  selectedProject?: ProjectSnapshot;
  language: Language;
  onError: (message: string | null) => void;
  onMessage: (message: RunMessage) => void;
  onFinished?: (finished: RunFinished) => void;
}

export interface UseProjectRunnerResult {
  activeRun?: RunStarted;
  activeRuns: RunStarted[];
  outputLines: string[];
  runProjectCommand: (
    command: ProjectCommand,
    projectOverride?: ProjectSnapshot,
    profileId?: string,
    profileAction?: ProfileAction,
  ) => Promise<void>;
  stopRun: (runId: string) => Promise<void>;
  stopActiveRun: () => Promise<void>;
}

export function useProjectRunner({
  nativeRuntime,
  selectedProject,
  language,
  onError,
  onMessage,
  onFinished,
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
      onFinished?.(finished);
    },
    [onFinished, onMessage],
  );
  const {
    activeRuns: activeRunMap,
    outputLinesFor,
    registerRun,
    completeRun,
    replaceOutput,
  } = useRunEventStream({
    onError: handleRunError,
    onFinished: handleRunFinished,
  });
  const demoTimers = useRef(new Map<string, number>());
  const disposedRef = useRef(false);

  useEffect(() => {
    const timers = demoTimers.current;
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const cancelDemoTimer = useCallback((runId: string) => {
    const timer = demoTimers.current.get(runId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    demoTimers.current.delete(runId);
  }, []);

  const activeRuns = useMemo(
    () =>
      Object.values(activeRunMap).sort(
        (left, right) => right.startedAt - left.startedAt,
      ),
    [activeRunMap],
  );
  const activeRun = useMemo(
    () =>
      selectedProject
        ? activeRuns.find((run) => run.projectId === selectedProject.id)
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
        if (disposedRef.current) return;
        registerRun(started);
        if (!nativeRuntime) {
          const timer = window.setTimeout(() => {
            demoTimers.current.delete(started.runId);
            replaceOutput(started.runId, [
              translate(language, "demoCompleted"),
            ]);
            completeRun(started.runId);
            onMessage({
              type: "demo",
              displayCommand: command.displayCommand,
            });
          }, 700);
          demoTimers.current.set(started.runId, timer);
        }
      } catch (runError) {
        onError(errorMessage(runError));
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

  const stopRun = useCallback(
    async (runId: string) => {
      if (!activeRunMap[runId]) return;
      try {
        await bridge.stopProjectCommand(runId);
        cancelDemoTimer(runId);
        completeRun(runId);
        onMessage({ type: "cancelled" });
      } catch (stopError) {
        onError(errorMessage(stopError));
      }
    },
    [activeRunMap, cancelDemoTimer, completeRun, onError, onMessage],
  );

  const stopActiveRun = useCallback(async () => {
    if (!activeRun) return;
    await stopRun(activeRun.runId);
  }, [activeRun, stopRun]);

  return {
    activeRun,
    activeRuns,
    outputLines,
    runProjectCommand,
    stopRun,
    stopActiveRun,
  };
}
