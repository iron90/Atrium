import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "./runtime";
import type { RunError, RunFinished, RunOutput, RunStarted } from "./types";

export interface RunEventHandlers {
  onStarted: (started: RunStarted) => void;
  onOutput: (output: RunOutput) => void;
  onFinished: (finished: RunFinished) => void;
  onError?: (error: RunError) => void;
}

export async function subscribeToRunEvents(
  handlers: RunEventHandlers,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  const unlisteners = await Promise.all([
    listen<RunStarted>("run-started", (event) =>
      handlers.onStarted(event.payload),
    ),
    listen<RunOutput>("run-output", (event) =>
      handlers.onOutput(event.payload),
    ),
    listen<RunFinished>("run-finished", (event) =>
      handlers.onFinished(event.payload),
    ),
    listen<RunError>("run-error", (event) => handlers.onError?.(event.payload)),
  ]);

  return () => {
    unlisteners.forEach((unlisten) => unlisten());
  };
}
