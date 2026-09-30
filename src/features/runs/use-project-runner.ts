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
  RunStatus,
} from "../../bridge";
import {
  useRunEventStream,
  type FinishedRunRecord,
} from "./use-run-event-stream";

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
  lastFinishedRun?: FinishedRunRecord;
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
    finishedByProject,
    outputLinesFor,
    registerRun,
    completeRun,
    replaceOutput,
    recordFinished,
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
  const lastFinishedRun = selectedProject
    ? finishedByProject[selectedProject.id]
    : undefined;

  const recordSyntheticFinished = useCallback(
    (
      run: RunStarted,
      status: Exclude<RunStatus, "running">,
      exitCode: number | null,
      stdout: string,
      stderr: string,
    ) => {
      const finishedAt = Date.now();
      const finished: RunFinished = {
        runId: run.runId,
        projectId: run.projectId,
        commandId: run.commandId,
        profileId: run.profileId,
        profileAction: null,
        projectPath: "",
        platform: null,
        channel: null,
        gitBranch: null,
        gitCommit: null,
        worktreeClean: null,
        displayCommand: run.displayCommand,
        startedAt: run.startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - run.startedAt),
        status,
        exitCode,
        stdout,
        stderr,
      };
      const lines = stdout ? stdout.split("\n") : [];
      recordFinished(finished, lines);
    },
    [recordFinished],
  );

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
      // The sidebar status card already announces the started command; the
      // activity log only records outcomes.
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
            const demoLine = translate(language, "demoCompleted");
            replaceOutput(started.runId, [demoLine]);
            recordSyntheticFinished(started, "succeeded", 0, demoLine, "");
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
      }
    },
    [
      completeRun,
      language,
      nativeRuntime,
      onError,
      onMessage,
      recordSyntheticFinished,
      registerRun,
      replaceOutput,
      selectedProject,
    ],
  );

  const stopRun = useCallback(
    async (runId: string) => {
      const run = activeRunMap[runId];
      if (!run) return;
      try {
        await bridge.stopProjectCommand(runId);
        cancelDemoTimer(runId);
        const lines = outputLinesFor(runId);
        recordSyntheticFinished(run, "cancelled", null, lines.join("\n"), "");
        completeRun(runId);
        onMessage({ type: "cancelled" });
      } catch (stopError) {
        onError(errorMessage(stopError));
      }
    },
    [
      activeRunMap,
      cancelDemoTimer,
      completeRun,
      onError,
      onMessage,
      outputLinesFor,
      recordSyntheticFinished,
    ],
  );

  const stopActiveRun = useCallback(async () => {
    if (!activeRun) return;
    await stopRun(activeRun.runId);
  }, [activeRun, stopRun]);

  return {
    activeRun,
    activeRuns,
    lastFinishedRun,
    outputLines,
    runProjectCommand,
    stopRun,
    stopActiveRun,
  };
}
