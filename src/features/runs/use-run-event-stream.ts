import { useCallback, useEffect, useRef, useState } from "react";
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

const MAX_SETTLED_RUN_IDS = 256;
const MAX_FINISHED_PROJECTS = 32;

export interface FinishedRunRecord {
  run: RunFinished;
  lines: string[];
}

export interface RunEventStreamOptions {
  onError: (error: RunError) => void;
  onFinished: (finished: RunFinished) => void;
}

export interface RunEventStreamState {
  activeRuns: Record<string, RunStarted>;
  finishedByProject: Record<string, FinishedRunRecord>;
  outputLinesFor: (runId: string) => string[];
  registerRun: (run: RunStarted) => void;
  completeRun: (runId: string) => void;
  replaceOutput: (runId: string, lines: string[]) => void;
  recordFinished: (finished: RunFinished, lines?: string[]) => void;
}

export function useRunEventStream({
  onError,
  onFinished,
}: RunEventStreamOptions): RunEventStreamState {
  const [activeRuns, setActiveRuns] = useState<Record<string, RunStarted>>({});
  const [outputBuffer, setOutputBuffer] = useState<RunOutputBuffer>({});
  const [finishedByProject, setFinishedByProject] = useState<
    Record<string, FinishedRunRecord>
  >({});
  const settledRunIds = useRef(new Set<string>());
  const outputBufferRef = useRef(outputBuffer);
  const onErrorRef = useRef(onError);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onErrorRef.current = onError;
    onFinishedRef.current = onFinished;
  }, [onError, onFinished]);

  useEffect(() => {
    outputBufferRef.current = outputBuffer;
  }, [outputBuffer]);

  const registerRun = useCallback((run: RunStarted) => {
    if (settledRunIds.current.delete(run.runId)) return;

    setActiveRuns((runs) =>
      runs[run.runId] ? runs : { ...runs, [run.runId]: run },
    );
    setOutputBuffer((buffer) =>
      run.runId in buffer ? buffer : replaceRunOutput(buffer, run.runId, []),
    );
  }, []);

  const completeRun = useCallback((runId: string) => {
    setActiveRuns((runs) => {
      const next = { ...runs };
      delete next[runId];
      return next;
    });
    setOutputBuffer((buffer) => removeRunOutput(buffer, runId));
  }, []);

  const recordFinished = useCallback(
    (finished: RunFinished, linesOverride?: string[]) => {
      const lines =
        linesOverride ?? outputForRun(outputBufferRef.current, finished.runId);
      setFinishedByProject((current) => {
        const next = { ...current };
        if (
          !(finished.projectId in next) &&
          Object.keys(next).length >= MAX_FINISHED_PROJECTS
        ) {
          const oldestProjectId = Object.keys(next)[0];
          delete next[oldestProjectId];
        }
        next[finished.projectId] = { run: finished, lines };
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void subscribeToRunEvents({
      onStarted: registerRun,
      onOutput: (output: RunOutput) =>
        setOutputBuffer((buffer) => {
          if (settledRunIds.current.has(output.runId)) return buffer;
          return appendRunOutput(buffer, output.runId, output.line);
        }),
      onError: (error: RunError) => onErrorRef.current(error),
      onFinished: (finished) => {
        settledRunIds.current.add(finished.runId);
        while (settledRunIds.current.size > MAX_SETTLED_RUN_IDS) {
          const oldestRunId = settledRunIds.current.values().next().value;
          if (oldestRunId === undefined) break;
          settledRunIds.current.delete(oldestRunId);
        }
        const lines = outputForRun(outputBufferRef.current, finished.runId);
        recordFinished(finished, lines);
        completeRun(finished.runId);
        onFinishedRef.current(finished);
      },
    })
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
        } else {
          cleanup = unsubscribe;
        }
      })
      .catch((subscriptionError: unknown) => {
        if (disposed) return;
        onErrorRef.current({
          runId: "",
          message:
            subscriptionError instanceof Error
              ? subscriptionError.message
              : String(subscriptionError),
        });
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [completeRun, recordFinished, registerRun]);
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
    finishedByProject,
    outputLinesFor,
    registerRun,
    completeRun,
    replaceOutput,
    recordFinished,
  };
}
