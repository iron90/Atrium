import * as gitBridge from "./git";
import * as projectBridge from "./projects";
import * as runBridge from "./runs";
import * as toolBridge from "./tools";
import { isTauriRuntime } from "./runtime";

export { isTauriRuntime };

export const bridge = {
  ...projectBridge,
  ...runBridge,
  ...gitBridge,
  ...toolBridge,
};

export type * from "./types";
