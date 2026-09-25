import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "./runtime";
import type {
  CleanupProgress,
  RunError,
  RunFinished,
  RunOutput,
  RunStarted,
} from "./types";

export interface RunEventHandlers {
  onStarted: (started: RunStarted) => void;
  onOutput: (output: RunOutput) => void;
  onFinished: (finished: RunFinished) => void;
  onError?: (error: RunError) => void;
}

type EventStrategy = "native" | "preview";

const resolveEventStrategy = (): EventStrategy =>
  isTauriRuntime() ? "native" : "preview";

const subscribeToNativeRunEvents = async (
  handlers: RunEventHandlers,
): Promise<UnlistenFn> => {
  // Subscribe sequentially and clean up on failure: a rejected listen must
  // not leak the unlisteners that already resolved.
  const unlisteners: UnlistenFn[] = [];
  try {
    unlisteners.push(
      await listen<RunStarted>("run-started", (event) =>
        handlers.onStarted(event.payload),
      ),
    );
    unlisteners.push(
      await listen<RunOutput>("run-output", (event) =>
        handlers.onOutput(event.payload),
      ),
    );
    unlisteners.push(
      await listen<RunFinished>("run-finished", (event) =>
        handlers.onFinished(event.payload),
      ),
    );
    unlisteners.push(
      await listen<RunError>("run-error", (event) =>
        handlers.onError?.(event.payload),
      ),
    );
  } catch (error) {
    unlisteners.forEach((unlisten) => unlisten());
    throw error;
  }

  return () => {
    unlisteners.forEach((unlisten) => unlisten());
  };
};

const subscribeToPreviewRunEvents = async (): Promise<UnlistenFn> => () =>
  undefined;

export async function subscribeToRunEvents(
  handlers: RunEventHandlers,
): Promise<UnlistenFn> {
  if (resolveEventStrategy() === "native") {
    return subscribeToNativeRunEvents(handlers);
  }
  return subscribeToPreviewRunEvents();
}

const subscribeToNativeCleanupProgress = async (
  onProgress: (progress: CleanupProgress) => void,
): Promise<UnlistenFn> =>
  listen<CleanupProgress>("cleanup-progress", (event) =>
    onProgress(event.payload),
  );

const subscribeToPreviewCleanupProgress = async (): Promise<UnlistenFn> => () =>
  undefined;

export async function subscribeToCleanupProgress(
  onProgress: (progress: CleanupProgress) => void,
): Promise<UnlistenFn> {
  if (resolveEventStrategy() === "native") {
    return subscribeToNativeCleanupProgress(onProgress);
  }
  return subscribeToPreviewCleanupProgress();
}
