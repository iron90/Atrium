import { useCallback, useEffect, useState } from "react";
import { subscribeToRunEvents } from "../../bridge/events";
import type {
  RunError,
  RunFinished,
  RunOutput,
  RunStarted,
} from "../../bridge";
import {
  appendRunOutput,
  outputForRun,
  removeRunOutput,
  replaceRunOutput,
  type RunOutputBuffer,
} from "./run-output-buffer";

export interface RunEventStreamOptions {
  onError: (error: RunError) => void;
  onFinished: (finished: RunFinished) => void;
}

export interface RunEventStreamState {
  activeRuns: Record<string, RunStarted>;
  outputLinesFor: (runId: string) => string[];
  registerRun: (run: RunStarted) => void;
  completeRun: (runId: string) => void;
  replaceOutput: (runId: string, lines: string[]) => void;
}

export function useRunEventStream({
  onError,
  onFinished,
}: RunEventStreamOptions): RunEventStreamState {
  const [activeRuns, setActiveRuns] = useState<Record<string, RunStarted>>({});
  const [outputBuffer, setOutputBuffer] = useState<RunOutputBuffer>({});

  const completeRun = useCallback((runId: string) => {
    setActiveRuns((runs) => {
      const next = { ...runs };
      delete next[runId];
      return next;
    });
    setOutputBuffer((buffer) => removeRunOutput(buffer, runId));
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void subscribeToRunEvents({
      onOutput: (output: RunOutput) =>
        setOutputBuffer((buffer) =>
          appendRunOutput(buffer, output.runId, output.line),
        ),
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

  const registerRun = useCallback((run: RunStarted) => {
    setActiveRuns((runs) => ({ ...runs, [run.runId]: run }));
    setOutputBuffer((buffer) => replaceRunOutput(buffer, run.runId, []));
  }, []);
  const outputLinesFor = useCallback(
    (runId: string) => outputForRun(outputBuffer, runId),
    [outputBuffer],
  );
  const replaceOutput = useCallback(
    (runId: string, lines: string[]) =>
      setOutputBuffer((buffer) => replaceRunOutput(buffer, runId, lines)),
    [],
  );

  return {
    activeRuns,
    outputLinesFor,
    registerRun,
    completeRun,
    replaceOutput,
  };
}
