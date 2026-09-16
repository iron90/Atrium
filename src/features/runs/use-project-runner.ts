import { useCallback, useEffect, useMemo, useState } from "react";
import { bridge } from "../../bridge";
import { subscribeToRunEvents } from "../../bridge/events";
import type { Language } from "../../i18n";
import { translate } from "../../i18n";
import type {
  ProjectCommand,
  ProjectSnapshot,
  RunFinished,
  RunStarted,
} from "../../bridge";

export type ProfileAction = "run" | "check" | "build";

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
  const [activeRuns, setActiveRuns] = useState<Record<string, RunStarted>>({});
  const [outputLines, setOutputLines] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void subscribeToRunEvents({
      onOutput: (output) => {
        setOutputLines((lines) => [...lines, output.line].slice(-180));
      },
      onFinished: (finished) => {
        setActiveRuns((runs) => {
          const next = { ...runs };
          delete next[finished.runId];
          return next;
        });
        onMessage({
          type: "finished",
          displayCommand: finished.displayCommand,
          status: finished.status,
        });
      },
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe();
      } else {
        cleanup = unsubscribe;
      }
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onMessage]);

  const activeRun = useMemo(
    () =>
      selectedProject
        ? Object.values(activeRuns).find(
            (run) => run.projectId === selectedProject.id,
          )
        : undefined,
    [activeRuns, selectedProject],
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
      setOutputLines([]);
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
        setActiveRuns((runs) => ({ ...runs, [started.runId]: started }));
        if (!nativeRuntime) {
          window.setTimeout(() => {
            setActiveRuns((runs) => {
              const next = { ...runs };
              delete next[started.runId];
              return next;
            });
            setOutputLines([translate(language, "demoCompleted")]);
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
    [language, nativeRuntime, onError, onMessage, selectedProject],
  );

  const stopActiveRun = useCallback(async () => {
    if (!activeRun) return;
    try {
      await bridge.stopProjectCommand(activeRun.runId);
      setActiveRuns((runs) => {
        const next = { ...runs };
        delete next[activeRun.runId];
        return next;
      });
      onMessage({ type: "cancelled" });
    } catch (stopError) {
      onError(
        stopError instanceof Error ? stopError.message : String(stopError),
      );
    }
  }, [activeRun, onError, onMessage]);

  return { activeRun, outputLines, runProjectCommand, stopActiveRun };
}
