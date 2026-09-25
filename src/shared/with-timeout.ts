export const SCAN_TIMEOUT_MS = 120_000;

export const SCAN_TIMEOUT_MESSAGE =
  "Workspace scan did not finish in time; it will be retried automatically.";

// A hung backend scan must not wedge the in-flight gate forever: reject after
// the deadline so the gate clears and the next refresh can start. The
// underlying backend work is abandoned, not cancelled.
export const withTimeout = <T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
