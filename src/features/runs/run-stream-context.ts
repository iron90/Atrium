import { createContext, useContext } from "react";
import type { RunStarted } from "../../bridge";

export interface RunStreamValue {
  activeRun?: RunStarted;
  outputLines: string[];
}

const EMPTY_RUN_STREAM: RunStreamValue = { outputLines: [] };

// Run output changes on every streamed line. Routing it through context
// keeps only the run consumers re-rendering instead of the whole inspector
// tree, which the prop path re-rendered per line.
export const RunStreamContext = createContext<RunStreamValue>(EMPTY_RUN_STREAM);

export const useRunStream = (): RunStreamValue => useContext(RunStreamContext);
