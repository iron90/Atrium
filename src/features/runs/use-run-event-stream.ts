import { useCallback, useEffect, useState } from "react";
import { subscribeToRunEvents } from "../../bridge/events";
import type { RunError, RunFinished, RunStarted } from "../../bridge";

export interface RunEventStreamOptions {
  onError: (error: RunError) => void;
  onFinished: (finished: RunFinished) => void;
}

export interface RunEventStreamState {
  activeRuns: Record<string, RunStarted>;
  outputLines: string[];
  clearOutput: () => void;
  registerRun: (run: RunStarted) => void;
  completeRun: (runId: string) => void;
  replaceOutput: (lines: string[]) => void;
}

export function useRunEventStream({
  onError,
  onFinished,
}: RunEventStreamOptions): RunEventStreamState {
  const [activeRuns, setActiveRuns] = useState<Record<string, RunStarted>>({});
  const [outputLines, setOutputLines] = useState<string[]>([]);

  const completeRun = useCallback((runId: string) => {
    setActiveRuns((runs) => {
      const next = { ...runs };
      delete next[runId];
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void subscribeToRunEvents({
      onOutput: (output) => {
        setOutputLines((lines) => [...lines, output.line].slice(-180));
      },
      onError,
      onFinished: (finished) => {
        completeRun(finished.runId);
        onFinished(finished);
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
  }, [completeRun, onError, onFinished]);

  const clearOutput = useCallback(() => setOutputLines([]), []);
  const registerRun = useCallback((run: RunStarted) => {
    setActiveRuns((runs) => ({ ...runs, [run.runId]: run }));
  }, []);
  const replaceOutput = useCallback(
    (lines: string[]) => setOutputLines(lines),
    [],
  );

  return {
    activeRuns,
    outputLines,
    clearOutput,
    registerRun,
    completeRun,
    replaceOutput,
  };
}
