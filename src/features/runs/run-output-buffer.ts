export type RunOutputBuffer = Record<string, string[]>;

const MAX_OUTPUT_LINES = 180;

export function appendRunOutput(
  buffer: RunOutputBuffer,
  runId: string,
  line: string,
): RunOutputBuffer {
  return {
    ...buffer,
    [runId]: [...(buffer[runId] ?? []), line].slice(-MAX_OUTPUT_LINES),
  };
}

export function replaceRunOutput(
  buffer: RunOutputBuffer,
  runId: string,
  lines: string[],
): RunOutputBuffer {
  return {
    ...buffer,
    [runId]: lines.slice(-MAX_OUTPUT_LINES),
  };
}

export function removeRunOutput(
  buffer: RunOutputBuffer,
  runId: string,
): RunOutputBuffer {
  if (!(runId in buffer)) return buffer;
  const next = { ...buffer };
  delete next[runId];
  return next;
}

export function outputForRun(buffer: RunOutputBuffer, runId: string): string[] {
  return buffer[runId] ?? [];
}
